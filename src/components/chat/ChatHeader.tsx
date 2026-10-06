import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { useChatStore, type Chat } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import { BotAvatar } from '../common/BotAvatar';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { GroupUsersIcon } from '../common/GroupUsersIcon';
import { BotIcon } from '../common/BotIcon';
import { ActiveCallBar } from '../call/ActiveCallBar';
import { supportService } from '../../services/supportService';
import { formatLastSeen } from '../../utils/messageUtils';

interface ChatHeaderProps {
  headerRef: React.RefObject<HTMLDivElement | null>;
  activeChatId: string | null;
  activeChat: Chat | null | undefined;
  isMobileView?: boolean;
  onBack?: () => void;
  isOnline: boolean;
  otherUserTyping: boolean;
  isServerConnected: boolean;
  voiceCallsEnabled: boolean;
  onAudioCallPress: () => void;
  onAddMember: () => void;
  onOpenSupportTickets: () => void;
  onProfileClick: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  headerRef,
  activeChatId,
  activeChat,
  isMobileView,
  onBack,
  isOnline,
  otherUserTyping,
  isServerConnected,
  voiceCallsEnabled,
  onAudioCallPress,
  onAddMember,
  onOpenSupportTickets,
  onProfileClick,
}) => {
  const { t } = useTranslation();

  return (
    <div
      ref={headerRef as any}
      className="sticky top-0 z-20 w-full select-none"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <header
        className="flex justify-center w-full select-none"
        style={{
          padding: '10px 16px',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <div
          className="flex items-center justify-between w-full select-none"
          style={{
            maxWidth: '100%',
            borderRadius: 0,
            backgroundColor: 'transparent',
            padding: '0',
          }}
        >
          <div
            className="flex items-center gap-3 flex-1 min-w-0 select-none"
            onClick={onProfileClick}
            style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            {isMobileView && onBack && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
                aria-label={t('chatWindow.back')}
                className="flex h-9 w-9 items-center justify-center text-[var(--text-main)] transition-opacity hover:opacity-80 border-none bg-transparent cursor-pointer"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            {isMobileView && (
              activeChatId === 'notes' ? (
                <NotesAvatar className="w-10 h-10" />
              ) : activeChat?.type === 'bot' ? (
                <BotAvatar className="w-10 h-10" />
              ) : (
                <Avatar src={activeChat?.avatarUrl} alt={activeChat?.name} className="w-10 h-10 rounded-full flex-shrink-0" />
              )
            )}
            <div className="flex flex-col min-w-0 flex-1 select-none" style={{ gap: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
              <div className="flex items-center gap-1.5 min-w-0 select-none">
                {activeChat?.type === 'channel' && (
                  <ChannelMegaphoneIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                )}
                {activeChat?.type === 'group' && (
                  <GroupUsersIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                )}
                {activeChat?.type === 'bot' && (
                  <BotIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                )}
                <h2 className="font-bold text-[14px] truncate select-none m-0" style={{ color: 'var(--text-main)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                  {activeChatId === 'notes' ? t('connectModal.notes') : activeChat?.name}
                </h2>
                {activeChat?.type === 'bot' && (
                  <VerifiedBadge size={16} className="flex-shrink-0" />
                )}
                <DeveloperBadge
                  userId={activeChat?.peerCode || activeChat?.originalPeerCode || (activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined) || (activeChat?.type === 'private' ? (activeChatId ?? undefined) : undefined)}
                  nickname={activeChat?.name}
                  username={activeChat?.username}
                  numericId={activeChat?.numericId}
                  size={20}
                />
                {activeChat?.type === 'channel' && activeChat.isOfficial && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                    {t('channel.official')}
                  </span>
                )}
              </div>
              <div className="select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                {activeChatId === 'notes' ? null : activeChat?.type === 'channel' ? (
                  <span className="text-[11px] font-medium text-[var(--text-dim)]">
                    {activeChat.subscribersCount
                      ? `${activeChat.subscribersCount.toLocaleString('ru-RU')} ${(() => { const n = activeChat.subscribersCount || 0; const m10 = n % 10; const m100 = n % 100; if (m10 === 1 && m100 !== 11) return 'подписчик'; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'подписчика'; return 'подписчиков'; })()}`
                      : t('channel.subscribers_none', 'подписчиков пока нет')}
                  </span>
                ) : activeChat?.type === 'group' ? (
                  <span className="text-[11px] font-medium text-[var(--text-dim)]">
                    {activeChat.onlineCount && activeChat.onlineCount > 0
                      ? t('groupSettings.members_and_online', {
                          count: activeChat.membersCount || activeChat.members?.length || 1,
                          online: Math.min(activeChat.membersCount || activeChat.members?.length || 1, activeChat.onlineCount),
                        })
                      : t('groupSettings.members_count', {
                          count: activeChat.membersCount || activeChat.members?.length || 1,
                        })}
                  </span>
                ) : activeChat?.type === 'bot' ? null : !isServerConnected ? (
                  <span className="text-[11px] font-semibold text-[var(--accent-color)] animate-pulse">
                    {t('common.connecting') || 'соединение...'}
                  </span>
                ) : (
                  <span
                    className="text-[11.5px] font-normal"
                    style={{
                      color: isOnline ? 'var(--accent-color)' : 'var(--text-dim)',
                      textShadow: isOnline ? '0 0 1.5px color-mix(in srgb, var(--accent-color) 30%, transparent)' : 'none',
                    }}
                  >
                    {otherUserTyping && activeChatId !== 'notes' ? (
                      <span className="text-[11.5px] font-semibold" style={{ color: 'var(--accent-color)' }}>
                        {t('chatWindow.typing')}
                      </span>
                    ) : (
                      isOnline ? t('chatWindow.online') : (activeChat?.lastSeen ? formatLastSeen(activeChat.lastSeen, t) : t('chatWindow.offline'))
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeChatId === 'system_support' && supportService.isAdmin && (
              <button
                className="p-2 transition-colors duration-200 text-[var(--accent-color, #7C3AED)] hover:opacity-80 cursor-pointer bg-transparent border-none outline-none flex items-center justify-center relative"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSupportTickets();
                }}
                aria-label={t('support.open_tickets_modal', 'Тикеты поддержки')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
                  <path d="M13 5v2"/>
                  <path d="M13 17v2"/>
                  <path d="M13 11v2"/>
                </svg>
              </button>
            )}
            {activeChat?.type === 'group' && (
              <button
                className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddMember();
                }}
                aria-label={t('groupSettings.add_member', 'Добавить участника')}
              >
                <UserPlus size={20} />
              </button>
            )}
            <button
              className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                useChatStore.getState().openInChatSearch('this_chat');
              }}
              aria-label={t('common.search', 'Поиск')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.71 20.29L18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.39M11 18a7 7 0 1 1 7-7a7 7 0 0 1-7 7" />
              </svg>
            </button>
            {activeChatId !== 'notes' && activeChat?.type !== 'channel' && voiceCallsEnabled && (
              <button
                className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onAudioCallPress();
                }}
                aria-label={t('call.call', 'Позвонить')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>
      <ActiveCallBar />
    </div>
  );
};
