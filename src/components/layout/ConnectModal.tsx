import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { channelService } from '../../services/channelService';
import { groupService } from '../../services/groupService';
import { extractCodeFromInput } from '../../utils/inviteLink';

export type CreateModalType = 'group' | 'channel' | 'friend';

interface ConnectModalProps {
  type: CreateModalType;
  onClose: () => void;
  onConnectRequest: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  type,
  onClose,
  onConnectRequest,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempWarning, setTempWarning] = useState<string | null>(null);
  const tempWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myCode = useChatStore((s) => s.myCode);
  const addChannelChat = useChatStore((s) => s.addChannelChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const showTempWarning = useCallback((msg: string) => {
    if (tempWarningTimerRef.current) {
      clearTimeout(tempWarningTimerRef.current);
    }
    setTempWarning(msg);
    inputRef.current?.focus();
    tempWarningTimerRef.current = setTimeout(() => {
      setTempWarning(null);
      tempWarningTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (tempWarningTimerRef.current) {
        clearTimeout(tempWarningTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAvatarClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (isLoading) return;
    const trimmed = inputValue.trim();

    if (!trimmed) {
      if (type === 'friend') {
        showTempWarning(t('createModal.specify_friend_id', 'Укажите ID вашего друга'));
      } else if (type === 'channel') {
        showTempWarning(t('createModal.specify_channel_name', 'Укажите название канала'));
      } else {
        showTempWarning(t('createModal.specify_group_name', 'Укажите название группы'));
      }
      return;
    }

    if (type === 'friend') {
      const cleanInput = extractCodeFromInput(trimmed).trim();
      if (!cleanInput || !/^[a-zA-Z0-9_-]{6,64}$/.test(cleanInput)) {
        showTempWarning(t('createModal.invalid_content', 'Неверное содержимое'));
        return;
      }
      setIsLoading(true);
      setError(null);
      const targetCode = cleanInput.length === 36 && !cleanInput.includes(' ') ? cleanInput.toUpperCase() : cleanInput;
      onConnectRequest(targetCode, (ok, msg) => {
        setIsLoading(false);
        if (ok) {
          onClose();
        } else {
          showTempWarning(msg || t('createModal.invalid_content', 'Неверное содержимое'));
        }
      });
      return;
    }

    if (type === 'group') {
      try {
        const res = await groupService.createGroup(trimmed, '', myNickname, myCode);
        if (res && res.group) {
          const newChat: Chat = {
            id: res.group.id,
            type: 'group',
            name: res.group.name,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: res.sharedSecret,
            role: 'owner',
            inviteCode: res.group.code,
            avatarUrl: avatarUrl || undefined,
            members: (res.group.members || []).map((m) => ({
              nickname: m.nickname,
              role: (m.role as 'owner' | 'admin' | 'member') || 'member',
              lastSeen: m.lastSeen || Date.now(),
            })),
            createdAt: Date.now(),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
            muted: false,
            notificationsEnabled: true,
          };
          useChatStore.setState((s) => ({ chats: [newChat, ...s.chats] }));
          setActiveChat(res.group.id);
          onClose();
        } else {
          setError(t('common.error', 'Ошибка создания группы'));
        }
      } catch (err: any) {
        setError(err?.message || t('common.error', 'Ошибка создания группы'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (type === 'channel') {
      try {
        const channel = await channelService.createChannel(
          trimmed,
          '',
          avatarUrl,
          myNickname
        );
        if (channel) {
          addChannelChat({
            id: channel.id,
            name: channel.name,
            description: channel.description,
            avatarUrl: channel.avatarUrl,
            creatorNickname: channel.creatorNickname,
            subscribersCount: 1,
            isOfficial: false,
            isOwner: true,
          });
          setActiveChat(channel.id);
          onClose();
        } else {
          setError(t('common.error', 'Ошибка создания сообщества'));
        }
      } catch (err: any) {
        setError(err?.message || t('common.error', 'Ошибка создания сообщества'));
      } finally {
        setIsLoading(false);
      }
    }
  }, [inputValue, isLoading, type, onConnectRequest, myNickname, myCode, avatarUrl, addChannelChat, setActiveChat, onClose, t]);

  const label =
    type === 'friend'
      ? t('createModal.friend_id', 'ID аккаунта друга')
      : type === 'channel'
      ? t('createModal.channel_name', 'Название канала')
      : t('createModal.group_name', 'Название группы');

  const isFloating = isFocused || inputValue.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-[360px] rounded-[8px] p-5 shadow-2xl overflow-hidden relative"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            minHeight: '175px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-4 mt-2">
            {type !== 'friend' && (
              <div className="flex-shrink-0">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  aria-label={t('createModal.choose_photo', 'Выбрать фото')}
                  className="w-14 h-14 rounded-full bg-[#3B82F6] flex items-center justify-center cursor-pointer overflow-hidden relative border-none outline-none"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={26} className="text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            )}

            <div className="relative flex-1 flex flex-col justify-end min-w-0 pt-4">
              <span
                className="absolute left-0 pointer-events-none select-none text-[15px] leading-normal truncate max-w-full"
                style={{
                  bottom: '8px',
                  transformOrigin: 'left bottom',
                  transform: (isFloating || Boolean(tempWarning)) ? 'translateY(-20px) scale(0.78)' : 'translateY(0) scale(1)',
                  transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease',
                  color: tempWarning
                    ? '#ef4444'
                    : isFocused
                    ? 'var(--accent-color, #7C3AED)'
                    : 'var(--text-dim, #9ca3af)',
                }}
              >
                {tempWarning || label}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  if (tempWarning) setTempWarning(null);
                  if (error) setError(null);
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit();
                  } else if (e.key === 'Escape') {
                    onClose();
                  }
                }}
                className="w-full bg-transparent outline-none text-[15px] text-[var(--text-main, #ffffff)] pt-4 pb-1 transition-colors"
                style={{
                  border: 'none',
                  borderRadius: 0,
                  boxSizing: 'border-box',
                  borderBottom: '2px solid',
                  borderBottomColor: tempWarning
                    ? '#ef4444'
                    : isFocused
                    ? 'var(--accent-color, #7C3AED)'
                    : 'var(--border-color, rgba(255, 255, 255, 0.15))',
                }}
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="text-[12px] text-red-400 mt-2 px-1">
              {error}
            </div>
          )}

          <div className="flex justify-end items-center gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.cancel', 'Отмена')}
              className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {t('common.cancel', 'Отмена')}
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSubmit}
              disabled={isLoading}
              aria-label={t('common.next', 'Далее')}
              className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.backgroundColor =
                    'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)';
                }
              }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {isLoading && (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderTopColor: 'var(--accent-color, #7C3AED)',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              )}
              {t('common.next', 'Далее')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};