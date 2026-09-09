import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, MoreVertical } from 'lucide-react';
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myCode = useChatStore((s) => s.myCode);
  const addChannelChat = useChatStore((s) => s.addChannelChat);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

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
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);

    if (type === 'friend') {
      const cleanInput = extractCodeFromInput(trimmed).trim();
      const targetCode = cleanInput.length === 36 && !cleanInput.includes(' ') ? cleanInput.toUpperCase() : cleanInput;
      onConnectRequest(targetCode, (ok, msg) => {
        setIsLoading(false);
        if (ok) {
          onClose();
        } else {
          setError(msg || t('common.error', 'Ошибка'));
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
          <div className="absolute top-4 right-4">
            <button
              type="button"
              aria-label={t('createModal.more_options', 'Дополнительно')}
              className="p-1 text-[var(--text-dim, #9ca3af)] hover:text-[var(--text-main)] transition-colors cursor-pointer bg-transparent border-none outline-none"
            >
              <MoreVertical size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-2 pr-6">
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

            <div className="relative flex-1 flex flex-col justify-end pt-3 min-w-0">
              <span
                className={`absolute left-0 pointer-events-none transition-all duration-200 ease-out origin-left select-none ${
                  isFloating
                    ? 'text-[11px] -top-0.5'
                    : 'text-[15px] top-3.5'
                }`}
                style={{
                  color: isFocused
                    ? 'var(--accent-color, #7C3AED)'
                    : 'var(--text-dim, #9ca3af)',
                }}
              >
                {label}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
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
                className="w-full bg-transparent outline-none text-[15px] text-[var(--text-main, #ffffff)] pb-1.5 pt-3 transition-colors"
                style={{
                  border: 'none',
                  borderRadius: 0,
                  borderBottom: isFocused
                    ? '2px solid var(--accent-color, #7C3AED)'
                    : '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
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
              onClick={handleSubmit}
              disabled={!inputValue.trim() || isLoading}
              aria-label={t('common.next', 'Далее')}
              className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
                border: 'none',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                if (inputValue.trim() && !isLoading) {
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