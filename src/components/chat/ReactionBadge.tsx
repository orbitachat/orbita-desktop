import React, { useMemo } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';

const POPULAR_REACTIONS: Record<string, number> = {
  '👍': 1,
  '❤️': 2,
  '🔥': 3,
  '🎉': 4,
  '😂': 5,
  '😮': 6,
  '😢': 7,
  '👏': 8,
  '🙏': 9,
  '👎': 10,
};

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
}) => {
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myUserId = useAuthStore((s) => s.userId);
  const myCode = useChatStore((s) => s.myCode);

  const hasReacted = useMemo(() => {
    return Boolean(
      (myUserId && users.includes(myUserId)) ||
      (myCode && users.includes(myCode)) ||
      (myNickname && users.includes(myNickname)) ||
      users.includes('YOU')
    );
  }, [users, myUserId, myCode, myNickname]);

  const uniqueCount = useMemo(() => {
    let count = 0;
    let countedSelf = false;
    for (const u of users) {
      const isMe = (myUserId && u === myUserId) || (myCode && u === myCode) || (myNickname && u === myNickname) || u === 'YOU';
      if (isMe) {
        if (!countedSelf) {
          countedSelf = true;
          count++;
        }
      } else {
        count++;
      }
    }
    return Math.max(1, count);
  }, [users, myUserId, myCode, myNickname]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(emoji);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${emoji} ${uniqueCount}`}
      className="select-none active:scale-95"
      style={{
        borderRadius: '9999px',
        backgroundColor: hasReacted
          ? 'var(--accent-color, #7C3AED)'
          : 'rgba(255, 255, 255, 0.16)',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        height: '28px',
        minHeight: '28px',
        padding: '0 8px',
        gap: '5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'background-color 0.15s ease, transform 0.1s ease',
      }}
    >
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
      <span
        className="tabular-nums"
        style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: hasReacted ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'color 0.15s ease',
        }}
      >
        {uniqueCount}
      </span>
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
  const entries = useMemo(() => {
    if (!reactions) return [];
    return Object.entries(reactions)
      .filter(([_, users]) => Array.isArray(users) && users.length > 0)
      .sort(([a], [b]) => {
        const orderA = POPULAR_REACTIONS[a] ?? 100;
        const orderB = POPULAR_REACTIONS[b] ?? 100;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
      });
  }, [reactions]);

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
