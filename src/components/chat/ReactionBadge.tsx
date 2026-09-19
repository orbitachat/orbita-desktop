// src/components/chat/ReactionBadge.tsx
import React, { useMemo } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

interface ReactionBadgeProps {
  emoji: string;
  users: string[];
  onToggle: (emoji: string) => void;
  activeChatId?: string;
}

export const ReactionBadge: React.FC<ReactionBadgeProps> = React.memo(({
  emoji,
  users,
  onToggle,
  activeChatId,
}) => {
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myCode = useChatStore((s) => s.myCode);
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const chats = useChatStore((s) => s.chats);
  const storeActiveChatId = useChatStore((s) => s.activeChatId);

  const effectiveChatId = activeChatId || storeActiveChatId;
  const currentChat = useMemo(() => {
    return chats.find((c) => c.id === effectiveChatId);
  }, [effectiveChatId, chats]);

  const isChannel = currentChat?.type === 'channel';
  const hasReacted = Boolean((myCode && users.includes(myCode)) || users.includes(myNickname) || users.includes('YOU'));

  // Определение avatarUrl для каждого пользователя
  const getAvatarUrl = (userNick: string): string | null | undefined => {
    if (userNick === myNickname || userNick === 'YOU') {
      return myAvatarUrl;
    }
    const chat = chats.find((c) => c.name === userNick || c.id === userNick);
    if (chat?.avatarUrl) return chat.avatarUrl;

    if (currentChat?.type === 'private') {
      return currentChat.avatarUrl;
    }
    return null;
  };

  // В личных чатах показываем до 2 аватарок (от меня и от собеседника)
  const displayUsers = useMemo(() => {
    return users.slice(0, 2);
  }, [users]);

  const badgeBg = hasReacted
    ? 'color-mix(in srgb, var(--accent-color, #8b5cf6) 45%, rgba(35, 30, 50, 0.95))'
    : 'rgba(255, 255, 255, 0.12)';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(emoji);
      }}
      className="inline-flex items-center justify-center transition-opacity hover:opacity-90 active:opacity-75 select-none"
      style={{
        borderRadius: '9999px',
        backgroundColor: badgeBg,
        border: 'none',
        outline: 'none',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        height: '28px',
        minHeight: '28px',
        padding: isChannel ? '0 10px' : '0 6px',
        gap: isChannel ? '6px' : '5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
    >
      {/* Слева эмодзи */}
      <span
        className="emoji-font"
        style={{
          fontSize: '15px',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {emoji}
      </span>

      {/* В сообществах (каналах): исключительно цифра рядом с реакцией (Скрин 1) */}
      {isChannel ? (
        <span
          className="tabular-nums text-white"
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#ffffff',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {users.length}
        </span>
      ) : (
        /* В личных чатах: аватарки с разделением без цифры (Скрин 2) */
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          {displayUsers.map((u, i) => {
            const avatarUrl = getAvatarUrl(u);
            const isSubsequent = i > 0;
            return (
              <div
                key={`${u}-${i}`}
                style={{
                  position: 'relative',
                  marginLeft: isSubsequent ? '-6px' : '0',
                  zIndex: 10 + i,
                  borderRadius: '50%',
                  boxShadow: isSubsequent ? `0 0 0 2.5px ${badgeBg}` : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  boxSizing: 'border-box',
                }}
              >
                <Avatar
                  src={avatarUrl}
                  alt={u}
                  className="w-[20px] h-[20px] rounded-full"
                  style={{
                    width: '20px',
                    height: '20px',
                    fontSize: '10.5px',
                    border: 'none',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
});

ReactionBadge.displayName = 'ReactionBadge';

interface MessageReactionsProps {
  reactions?: Record<string, string[]>;
  onToggleReaction: (emoji: string) => void;
  isOwn?: boolean;
  activeChatId?: string;
  isSmallMessage?: boolean;
}

export const MessageReactions: React.FC<MessageReactionsProps> = React.memo(({
  reactions,
  onToggleReaction,
  isOwn: _isOwn = false,
  activeChatId,
  isSmallMessage = false,
}) => {
  if (!reactions) return null;

  const entries = Object.entries(reactions).filter(([_, users]) => Array.isArray(users) && users.length > 0);
  if (entries.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1 mt-1 z-10 select-none items-center"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        maxWidth: isSmallMessage ? '170px' : '100%',
        width: 'fit-content',
      }}
    >
      {entries.map(([emoji, users]) => (
        <ReactionBadge
          key={emoji}
          emoji={emoji}
          users={users}
          onToggle={onToggleReaction}
          activeChatId={activeChatId}
        />
      ))}
    </div>
  );
});

MessageReactions.displayName = 'MessageReactions';
