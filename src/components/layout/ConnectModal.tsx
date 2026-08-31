import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, UserPlus, Users, Globe, Copy, ArrowLeft, Plus } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { channelService } from '../../services/channelService';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import { useShallow } from 'zustand/react/shallow';
import { getInviteLink, extractCodeFromInput } from '../../utils/inviteLink';

interface ConnectModalProps {
  onClose: () => void;
  onConnectRequest: (friendCode: string, callback: (success: boolean, error?: string) => void) => void;
  initialSection?: Section;
  initialCreatingChannel?: boolean;
}

type Section = 'main' | 'newMessage' | 'invite' | 'createGroup' | 'joinCommunity';

const AnimatedCheckmark = ({ color = 'var(--accent-color, #7C3AED)' }: { color?: string }) => (
  <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, overflow: 'visible', flexShrink: 0 }}>
    <path
      d="M3 13 L9 19 L21 7"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength="1"
      style={{
        strokeDasharray: 1,
        strokeDashoffset: 1,
        animation: 'drawCheck 0.4s cubic-bezier(0.65,0,0.35,1) 0.05s forwards',
      }}
    />
    <style>{`@keyframes drawCheck { to { stroke-dashoffset: 0; } }`}</style>
  </svg>
);

const LoadingSpinner = () => (
  <div style={{
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: 'var(--accent-color, #7C3AED)',
    animation: 'spin 0.8s linear infinite',
  }}>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export const ConnectModal = ({
  onClose,
  onConnectRequest,
  initialSection = 'main',
  initialCreatingChannel = false,
}: ConnectModalProps) => {
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 650 : false);
  const [activeSection, setActiveSection] = useState<Section>(initialSection);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channelKeyInput, setChannelKeyInput] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [isCreatingChannel, setIsCreatingChannel] = useState(initialCreatingChannel);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDescription, setNewChannelDescription] = useState('');

  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';

  const {
    chats,
    setActiveChat,
    addChannelChat,
    myCode,
  } = useChatStore(
    useShallow((state) => ({
      chats: state.chats,
      setActiveChat: state.setActiveChat,
      addChannelChat: state.addChannelChat,
      myCode: state.myCode,
    }))
  );

  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 650);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const measure = () => {
      if (innerContentRef.current) {
        // Natural content height + 32px (16px top + 16px bottom padding)
        const measured = (innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight) + 32;
        if (measured > 0) {
          setTargetHeight(measured);
        }
      }
    };

    const rafId = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 30);

    let ro: ResizeObserver | null = null;
    if (innerContentRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(innerContentRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [activeSection, isMobile]);

  const handleCopy = useCallback(async () => {
    if (!myCode) return;
    try {
      const link = getInviteLink(myCode);
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [myCode]);

  const handleOpenChat = useCallback(
    (chatId: string) => {
      setActiveChat(chatId);
      onClose();
    },
    [setActiveChat, onClose]
  );

  const handleBack = useCallback(() => {
    setActiveSection('main');
    setFriendCodeInput('');
    setError(null);
    setChannelKeyInput('');
    setChannelError(null);
    setIsCreatingChannel(false);
  }, []);

  const handleJoinChannel = useCallback(async (keyToJoin?: string) => {
    const rawKey = keyToJoin || channelKeyInput;
    const key = extractCodeFromInput(rawKey).trim();
    if (!key) return;

    setChannelLoading(true);
    setChannelError(null);

    try {
      const channel = await channelService.getChannel(key);
      if (!channel) {
        setChannelError('Сообщество не найдено. Проверьте правильность 36-значного ключа.');
        setChannelLoading(false);
        return;
      }

      if (channel.creatorNickname !== myNickname && !channel.isOfficial) {
        const newCount = await channelService.joinChannel(channel.id, myNickname);
        if (newCount !== null) {
          channel.subscribersCount = newCount;
        }
      }

      addChannelChat({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        avatarUrl: channel.avatarUrl,
        creatorNickname: channel.creatorNickname,
        subscribersCount: channel.subscribersCount,
        isOfficial: channel.isOfficial,
        isOwner: channel.creatorNickname === myNickname,
      });

      setActiveChat(channel.id);
      onClose();
    } catch (err: any) {
      setChannelError(err?.message || 'Ошибка подключения к сообществу');
    } finally {
      setChannelLoading(false);
    }
  }, [channelKeyInput, addChannelChat, setActiveChat, onClose, myNickname]);

  const handleCreateChannel = useCallback(async () => {
    if (!newChannelName.trim()) return;

    setChannelLoading(true);
    setChannelError(null);

    try {
      const channel = await channelService.createChannel(
        newChannelName.trim(),
        newChannelDescription.trim(),
        null,
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
        setChannelError('Не удалось создать сообщество');
      }
    } catch (err: any) {
      setChannelError(err?.message || 'Ошибка создания сообщества');
    } finally {
      setChannelLoading(false);
    }
  }, [newChannelName, newChannelDescription, myNickname, addChannelChat, setActiveChat, onClose]);

  const handleConnect = useCallback(() => {
    const raw = extractCodeFromInput(friendCodeInput).trim();
    if (!raw || connecting) return;
    const trimmed = raw.length === 36 && !raw.includes(' ') ? raw.toUpperCase() : raw;
    setConnecting(true);
    setError(null);
    onConnectRequest(trimmed, (ok, msg) => {
      setConnecting(false);
      if (ok) {
        onClose();
      } else {
        setError(msg || t('common.error'));
      }
    });
  }, [friendCodeInput, connecting, onConnectRequest, t, onClose]);

  const renderMainContent = () => {
    // Сортируем чаты: заметки всегда первые (если отображаются)
    const sortedChats = [...chats].sort((a, b) => {
      if (a.id === 'notes') return -1;
      if (b.id === 'notes') return 1;
      return 0;
    });

    return (
      <div className="flex flex-col h-full px-2" style={{ userSelect: 'none' }}>
        <div className="flex items-center justify-between py-1">
          <div className="flex-1" />
          <h2 className="text-lg font-bold text-[var(--text-main)] text-center flex-1">
            {t('connectModal.contacts')}
          </h2>
          <div className="flex-1 flex justify-end">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[var(--surface-container-strong)] transition-colors text-[var(--text-dim)]"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-2">
          {/* Плашка разделов */}
          <div className="rounded-2xl bg-[var(--surface-container)] overflow-hidden">
            {[
              { id: 'newMessage', icon: MessageSquare, label: t('connectModal.new_message') },
              { id: 'invite', icon: UserPlus, label: t('connectModal.invite_friend') },
              { id: 'createGroup', icon: Users, label: t('connectModal.create_group') },
              { id: 'joinCommunity', icon: Globe, label: t('connectModal.join_community') },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as Section)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-none hover:bg-[var(--surface-container-strong)] transition-colors"
                >
                  <Icon size={20} className="text-[var(--text-dim)]" />
                  <span className="text-sm font-medium text-[var(--text-main)]">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Плашка заметок — всегда отображается, даже если нет сообщений */}
          <div className="rounded-2xl bg-[var(--surface-container)] overflow-hidden">
            <button
              onClick={() => handleOpenChat('notes')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-none hover:bg-[var(--surface-container-strong)] transition-colors"
            >
              <NotesAvatar className="w-10 h-10" />
              <span className="text-sm text-[var(--text-main)]">{t('connectModal.notes')}</span>
            </button>
          </div>

          {/* Плашка остальных чатов */}
          {sortedChats.filter(c => c.id !== 'notes').length > 0 && (
            <div className="rounded-2xl bg-[var(--surface-container)] overflow-hidden">
              {sortedChats.filter(c => c.id !== 'notes').map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleOpenChat(chat.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-none hover:bg-[var(--surface-container-strong)] transition-colors"
                >
                  <Avatar src={chat.avatarUrl} alt={chat.name} className="w-10 h-10 rounded-full" />
                  <span className="text-sm text-[var(--text-main)]">{chat.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'newMessage':
        return (
          <div className="flex flex-col gap-6 px-2" style={{ userSelect: 'none' }}>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">{t('common.back')}</span>
            </button>
            <div>
              <p className="text-sm text-[var(--text-dim)] mb-4">
                {t('connectModal.enter_code_description')}
              </p>
              <input
                type="text"
                value={friendCodeInput}
                onChange={(e) => setFriendCodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder={t('connectModal.enter_code_placeholder')}
                className="w-full bg-transparent px-1 py-2.5 text-[var(--text-main)] placeholder:text-[var(--text-dim)] outline-none text-sm transition-colors"
                autoFocus
                style={{
                  userSelect: 'text',
                  borderRadius: 0,
                  border: 'none',
                  borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                }}
                onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255,255,255,0.15))')}
              />
              {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
              <button
                onClick={handleConnect}
                disabled={!friendCodeInput.trim() || connecting}
                className="mt-4 w-full py-3 rounded-2xl bg-[var(--accent-color)] text-white font-medium hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {connecting && <LoadingSpinner />}
                {connecting ? t('common.connecting') : t('connectModal.connect')}
              </button>
            </div>
          </div>
        );
      case 'invite':
        return (
          <div className="flex flex-col gap-6 px-2" style={{ userSelect: 'none' }}>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">{t('common.back')}</span>
            </button>
            <div>
              <p className="text-sm text-[var(--text-dim)] mb-4 leading-relaxed">
                {t('connectModal.invite_description')}
              </p>
              <div className="flex items-center justify-between gap-3 bg-[var(--surface-container)] rounded-2xl p-4 border border-white/5 shadow-inner">
                <span className="flex-1 font-mono text-sm font-semibold tracking-wider text-[var(--text-main)] select-all break-all">
                  {myCode || '------'}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-[var(--text-main)] cursor-pointer flex-shrink-0"
                  title={t('common.copy', 'Копировать')}
                >
                  {copied ? (
                    <AnimatedCheckmark color="var(--accent-color, #7C3AED)" />
                  ) : (
                    <Copy size={18} />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      case 'createGroup':
        return (
          <div className="flex flex-col gap-6 px-2" style={{ userSelect: 'none' }}>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">{t('common.back')}</span>
            </button>
            <p className="text-sm text-[var(--text-dim)]">
              {t('connectModal.in_development')}
            </p>
          </div>
        );
      case 'joinCommunity':
        return (
          <div className="flex flex-col gap-5 px-1 pb-4" style={{ userSelect: 'none' }}>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  if (isCreatingChannel) {
                    setIsCreatingChannel(false);
                  } else {
                    handleBack();
                  }
                }}
                className="flex items-center gap-2 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="text-sm font-medium">{t('common.back')}</span>
              </button>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-color)]">
                {t('connectModal.join_community')}
              </span>
            </div>

            {channelError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <span>{channelError}</span>
              </div>
            )}

            {isCreatingChannel ? (
              /* Форма создания своего канала */
              <div className="flex flex-col gap-4 p-4 rounded-2xl bg-[var(--surface-container)] border border-[var(--surface-border)]">
                <div className="flex items-center gap-2 text-[var(--text-main)] font-semibold text-sm">
                  <Plus size={18} className="text-[var(--accent-color)]" />
                  <span>Создать публичный канал</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-dim)]">Название канала</label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="Например: Новости IT или Мой Блог"
                    maxLength={60}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--surface-border)] text-sm text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-color)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-dim)]">Описание (опционально)</label>
                  <textarea
                    value={newChannelDescription}
                    onChange={(e) => setNewChannelDescription(e.target.value)}
                    placeholder="О чем этот канал..."
                    rows={2}
                    maxLength={200}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--surface-border)] text-sm text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-color)] resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setIsCreatingChannel(false)}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--surface-container-strong)] text-[var(--text-dim)] text-xs font-semibold hover:text-[var(--text-main)] transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleCreateChannel}
                    disabled={!newChannelName.trim() || channelLoading}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {channelLoading ? <LoadingSpinner /> : 'Создать'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Ввод 36-значного ключа */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-[var(--surface-container)]">
                  <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                    Вступить по ключу сообщества
                  </span>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={channelKeyInput}
                      onChange={(e) => {
                        setChannelKeyInput(e.target.value);
                        setChannelError(null);
                      }}
                      placeholder="Вставь 36-значный ключ канала..."
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--surface-border)] text-xs text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-color)] font-mono"
                    />
                    <button
                      onClick={() => handleJoinChannel()}
                      disabled={!channelKeyInput.trim() || channelLoading}
                      className="px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center min-w-[75px]"
                    >
                      {channelLoading ? <LoadingSpinner /> : 'Вступить'}
                    </button>
                  </div>
                </div>

                {/* Кнопка создания канала */}
                <button
                  onClick={() => {
                    setIsCreatingChannel(true);
                    setChannelError(null);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[var(--surface-container)] hover:bg-[var(--surface-container-strong)] border border-[var(--surface-border)] transition-colors text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Plus size={20} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-main)]">Создать своё сообщество</div>
                      <div className="text-xs text-[var(--text-dim)]">Публичный канал с авторами и подписчиками</div>
                    </div>
                  </div>
                </button>

                {/* Разделитель "Или вступите в сообщество мессенджера" */}
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-[var(--surface-border)]" />
                  <span className="text-[11px] font-medium text-[var(--text-dim)] uppercase tracking-wider">
                    Или вступите в сообщество
                  </span>
                  <div className="flex-1 h-px bg-[var(--surface-border)]" />
                </div>

                {/* Карточка официального новостного канала (Session style) */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--surface-container)] to-[var(--surface-container-strong)] border border-[var(--accent-color)]/30 relative overflow-hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-[var(--accent-color)] text-white flex items-center justify-center font-bold text-base shadow-lg shadow-[var(--accent-color)]/20 flex-shrink-0">
                      ⚡
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-[var(--text-main)] truncate">Orbita News</span>
                        <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold uppercase">
                          Официальный
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-dim)] mt-1 line-clamp-2 leading-relaxed">
                        Официальный новостной канал мессенджера Orbita. Обновления, релизы, важные анонсы и фичи.
                      </p>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--surface-border)]/50">
                        <span className="text-[11px] text-[var(--text-dim)] flex items-center gap-1 font-medium">
                          <Users size={13} /> 1.2k подписчиков
                        </span>
                        <button
                          onClick={() => handleJoinChannel('orbita-official-news-community-36c')}
                          disabled={channelLoading}
                          className="px-3.5 py-1.5 rounded-xl bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-md"
                        >
                          {chats.some(c => c.id === 'orbita-official-news-community-36c') ? 'Открыть' : 'Вступить'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        border: 'none',
        zIndex: 200,
        display: 'flex',
        alignItems: isMobile ? 'stretch' : 'flex-start',
        justifyContent: 'center',
        padding: isMobile ? '0' : 'min(7.5vh, 64px) 16px 16px',
      }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{
          opacity: 1,
          scale: 1,
          height: isMobile ? 'calc(100vh - 30px)' : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
        }}
        animate={{
          opacity: 1,
          scale: 1,
          height: isMobile
            ? 'calc(100vh - 30px)'
            : targetHeight !== null
            ? Math.min(targetHeight, typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750)
            : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
        }}
        transition={{
          height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0 },
          scale: { duration: 0 },
        }}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100vw' : '400px',
          maxHeight: isMobile ? 'calc(100vh - 30px)' : 'min(85vh, 750px)',
          marginTop: isMobile ? '30px' : '0',
          borderRadius: isMobile ? 0 : 10,
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          boxShadow: isMobile ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
          color: 'var(--text-main)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
          className="transparent-scrollbar"
        >
          <div
            ref={innerContentRef}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {activeSection === 'main' ? renderMainContent() : renderSectionContent()}
          </div>
        </div>
      </motion.div>
    </div>
  );
};