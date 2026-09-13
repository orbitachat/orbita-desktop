import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { Pin } from 'lucide-react';
import { Message, useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { parseReplyChain, countEmojis, formatTimeOfDay, markdownToHtml, formatPreviewText } from '../../utils/messageUtils';
import { isEmojiOnly } from '../../lib/emoji-data';
import { MessageStatus } from '../MessageStatus';
import { MessageReactions } from './ReactionBadge';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';

interface MessageItemProps {
  msg: Message;
  isOwn: boolean;
  isPinned: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  themeColor: string;
  bubbleRadius: number | string;
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  onQuoteClick?: (q: { id?: string; sender: string; text: string; time: string }) => void;
  isGroup?: boolean;
  onLinkClick?: (url: string) => void;
  onButtonClick?: (button: { text: string; action: string; channelId?: string; url?: string; data?: string; icon?: 'channel' | 'backup' | 'help' | 'link' }) => void;
}

const MessageText = ({
  text,
  timeNode,
  themeColor,
  isOwn = true,
  isEmojiOnly = false,
  onLinkClick,
}: {
  text: string;
  timeNode?: React.ReactNode;
  themeColor: string;
  isOwn?: boolean;
  isEmojiOnly?: boolean;
  onLinkClick?: (url: string) => void;
}) => {
  const handleHtmlClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      const url = target.getAttribute('href');
      if (url && onLinkClick) {
        onLinkClick(url);
      }
    } else if (target.classList.contains('spoiler') || target.getAttribute('data-spoiler') === 'true') {
      target.style.filter = target.style.filter === 'none' ? 'blur(3px)' : 'none';
    }
  };

  return (
    <div
      className={`${isOwn ? 'select-text-own' : 'select-text-incoming'}`}
      style={{
        fontSize: 'inherit',
        lineHeight: 1.3,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        width: '100%',
        position: 'relative',
      }}
    >
      <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        <span 
          style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(text, isOwn ? '#ffffff' : (themeColor || 'var(--accent-color)')) }} 
          onClick={handleHtmlClick}
        />
      </span>
      {timeNode && (
        <span
          aria-hidden
          className="flex-shrink-0 select-none message-time-badge"
          style={{
            float: 'right',
            marginLeft: '10px',
            marginRight: isOwn ? '-9px' : '-6px',
            marginBottom: '-4.5px',
            marginTop: isEmojiOnly ? '16px' : '6px',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {timeNode}
        </span>
      )}
      <div style={{ clear: 'both' }} />
    </div>
  );
};

export const MessageItem: React.FC<MessageItemProps> = React.memo(
  ({ msg, isOwn, isPinned, onContextMenu, themeColor, bubbleRadius, currentUserId, onToggleReaction, onQuoteClick, isGroup = false, onLinkClick, onButtonClick }) => {
    const { t } = useTranslation();
    const myCode = useChatStore((s) => s.myCode);
    const myNickname = useAuthStore((s) => s.nickname);
    const activeChatId = useChatStore((s) => s.activeChatId);
    const activeChat = useChatStore((s) => s.chats.find(c => c.id === activeChatId));
    const parsed = useMemo(() => parseReplyChain(msg.text), [msg.text]);
    const isEmoji = useMemo(() => isEmojiOnly(parsed.body) && parsed.body.trim().length > 0, [parsed.body]);
    const emojiCount = useMemo(() => (isEmoji ? countEmojis(parsed.body) : 0), [parsed.body, isEmoji]);

    const timeStr = useMemo(() => formatTimeOfDay(msg.time), [msg.time]);

    const isEmojiNoBubble = isEmoji && emojiCount >= 1 && emojiCount < 4;

    const emojiNoBubbleStyle = useMemo(() => {
      if (emojiCount === 1) {
        return { fontSize: '90px', lineHeight: 1.1 };
      }
      if (emojiCount === 2 || emojiCount === 3) {
        return { fontSize: '40px', lineHeight: 1.2 };
      }
      return { fontSize: 'inherit' };
    }, [emojiCount]);

    const bubbleFontSize = useMemo(() => {
      if (isEmoji && emojiCount >= 4) {
        return '22px';
      }
      return 'inherit';
    }, [isEmoji, emojiCount]);

    const isChannel = useChatStore((s) => s.chats.find((c) => c.id === s.activeChatId)?.type === 'channel');

    const timeBadge = (
      <span
        className="tabular-nums select-none message-time-badge"
        style={{
          color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)',
          fontSize: '11px',
          display: 'inline-flex',
          alignItems: 'center',
          lineHeight: 1,
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{timeStr}</span>
        {isOwn && msg.status && (
          <span style={{ display: 'inline-flex', width: '26px', minWidth: '26px', flexShrink: 0, justifyContent: 'flex-end', userSelect: 'none', WebkitUserSelect: 'none' }}>
            <MessageStatus status={msg.status} isOwn={isOwn} />
          </span>
        )}
      </span>
    );

    const hasReactions = !!(msg.reactions && Object.keys(msg.reactions).length > 0);
    const hasLinkPreview = Boolean(
      msg.linkPreview &&
      (
        Boolean(msg.linkPreview.description) ||
        Boolean(msg.linkPreview.image) ||
        (Boolean(msg.linkPreview.title) &&
          Boolean(msg.linkPreview.siteName) &&
          msg.linkPreview.title!.trim().toLowerCase() !== msg.linkPreview.siteName!.trim().toLowerCase())
      )
    );

    const isShortMessage = (parsed.body.length < 35 && !parsed.quotes.length && !msg.linkPreview);

    return (
      <div
        onContextMenu={onContextMenu}
        className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
        style={{ transformOrigin: isOwn ? 'top right' : 'top left' }}
      >
        {isEmojiNoBubble ? (
          <div
            className="max-w-[min(440px,75%)] min-w-[50px] w-fit relative flex flex-col items-end"
            style={{ padding: '2px 4px' }}
          >
            <span
              className="select-none"
              style={{
                ...emojiNoBubbleStyle,
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {parsed.body}
            </span>
            <div
              className="select-none tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150 mt-1 message-time-badge"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                borderRadius: '8px',
                padding: '2.5px 7px',
                color: 'rgba(255, 255, 255, 0.95)',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
                zIndex: 1,
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{timeStr}</span>
              {isOwn && msg.status && (
                <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '5px', transform: 'translateY(-1.5px)', flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <MessageStatus status={msg.status} isOwn={isOwn} />
                </span>
              )}
            </div>
            <MessageReactions
              reactions={msg.reactions}
              onToggleReaction={(emoji) => onToggleReaction?.(emoji)}
              isOwn={isOwn}
              isSmallMessage={true}
            />
          </div>
        ) : (
          <div
            className={`flex flex-col min-w-[50px] ${
              hasLinkPreview
                ? 'max-w-[min(540px,94%)] sm:max-w-[min(500px,85%)] w-full'
                : 'max-w-[min(460px,88%)] sm:max-w-[min(440px,75%)] w-fit'
            }`}
          >
            <div
              className="w-full relative flex flex-col"
              style={{
                padding: '6.5px 12px 6.5px 11px',
                borderRadius: bubbleRadius,
                background: isOwn
                  ? 'var(--chat-bubble-own-bg, #2c6bed)'
                  : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
                color: isOwn
                  ? '#ffffff'
                  : 'var(--chat-bubble-incoming-text, var(--text-main, #ffffff))',
                fontSize: bubbleFontSize,
              }}
            >
            {!isOwn && isGroup && msg.sender && (
              <div className="flex items-center mb-1 select-none message-sender-name" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                <span
                  className="truncate font-semibold select-none message-sender-name"
                  style={{
                    color: themeColor || 'var(--accent-color, #7C3AED)',
                    fontSize: '12.5px',
                    lineHeight: '1.2',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {msg.sender}
                </span>
                <DeveloperBadge userId={msg.senderId || activeChat?.peerCode} size={20} />
              </div>
            )}

            {parsed.quotes.length > 0 && (
              <div className="flex flex-col min-w-0 mb-1 select-none" style={{ gap: '4px', userSelect: 'none', WebkitUserSelect: 'none' }}>
                {parsed.quotes.map((q, depth) => (
                  <div
                    key={`${depth}-${q.time}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuoteClick?.(q);
                    }}
                    className="flex w-full items-start gap-2 cursor-pointer hover:opacity-85 transition-opacity"
                    style={{
                      padding: '5px 10px',
                      backgroundColor: isOwn ? 'rgba(255, 255, 255, 0.15)' : 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
                      borderRadius: '0 6px 6px 0',
                      borderLeft: isOwn ? '3px solid #ffffff' : '3px solid var(--accent-color)',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {isChannel && <ChannelMegaphoneIcon size={12} className="flex-shrink-0" />}
                        <p
                          className="truncate font-semibold"
                          style={{
                            color: isOwn ? '#ffffff' : 'var(--accent-color)',
                            fontSize: '12.5px',
                            lineHeight: '1.2',
                          }}
                        >
                          {q.sender}
                        </p>
                        <DeveloperBadge
                          userId={
                            (q as any).senderId ||
                            (q.sender && q.sender.length === 36 ? q.sender : undefined) ||
                            (q.sender === activeChat?.name ? (activeChat?.peerCode || activeChat?.id) : undefined) ||
                            (q.sender === myNickname || q.sender === currentUserId ? myCode : (activeChat?.peerCode || myCode))
                          }
                          size={18}
                        />
                      </div>
                      <p
                        className="truncate"
                        style={{
                          color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-main)',
                          fontSize: '13px',
                          lineHeight: '1.35',
                          marginTop: '2px',
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(formatPreviewText(q.text, t), isOwn ? '#ffffff' : themeColor).replace(/<br\s*\/?>/gi, ' ') }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <MessageText
              text={parsed.body}
              timeNode={!hasLinkPreview && !hasReactions ? timeBadge : undefined}
              themeColor={isOwn ? '#ffffff' : (themeColor || 'var(--accent-color)')}
              isOwn={isOwn}
              isEmojiOnly={isEmoji && emojiCount >= 4}
              onLinkClick={onLinkClick}
            />

              {hasLinkPreview && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onLinkClick && msg.linkPreview?.url) {
                      onLinkClick(msg.linkPreview.url);
                    }
                  }}
                  className="flex flex-col w-full min-w-0 mt-2 cursor-pointer hover:opacity-90 transition-opacity select-none"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: isOwn ? 'rgba(0,0,0,0.18)' : 'color-mix(in srgb, var(--accent-color) 10%, rgba(0,0,0,0.15))',
                    borderRadius: '0 8px 8px 0',
                    borderLeft: isOwn ? '3px solid rgba(255,255,255,0.7)' : '3px solid var(--accent-color)',
                  }}
                >
                  {msg.linkPreview!.siteName && (
                    <span
                      className="font-bold text-[12.5px] mb-0.5 truncate"
                      style={{ color: isOwn ? 'rgba(255,255,255,0.95)' : 'var(--accent-color)' }}
                    >
                      {msg.linkPreview!.siteName}
                    </span>
                  )}
                  {msg.linkPreview!.title &&
                    (!msg.linkPreview!.siteName ||
                      msg.linkPreview!.title.trim().toLowerCase() !== msg.linkPreview!.siteName.trim().toLowerCase()) && (
                    <span
                      className="font-bold text-[13.5px] leading-snug mb-1 line-clamp-2"
                      style={{ color: isOwn ? '#ffffff' : 'var(--text-main)' }}
                    >
                      {msg.linkPreview!.title}
                    </span>
                  )}
                  {msg.linkPreview!.description && (
                    <span
                      className="text-[12.5px] leading-normal mb-1.5 opacity-90 line-clamp-4"
                      style={{ color: isOwn ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)' }}
                    >
                      {msg.linkPreview!.description}
                    </span>
                  )}
                  {msg.linkPreview!.image && (
                    <img
                      src={msg.linkPreview!.image}
                      alt=""
                      decoding="async"
                      loading="lazy"
                      className="w-full max-h-72 object-cover rounded-md mt-1"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                </div>
              )}

              {hasLinkPreview && !hasReactions && (
                <div
                  className="flex justify-end items-center select-none message-time-badge"
                  style={{
                    marginRight: isOwn ? '-9px' : '-6px',
                    marginBottom: '-4.5px',
                    marginTop: '4px',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {timeBadge}
                </div>
              )}

              {hasReactions && (
                <div className="flex items-end justify-between gap-2 mt-1 min-w-0 w-full select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <div className="flex-1 min-w-0">
                    <MessageReactions
                      reactions={msg.reactions}
                      onToggleReaction={(emoji) => onToggleReaction?.(emoji)}
                      isOwn={isOwn}
                      isSmallMessage={isShortMessage}
                    />
                  </div>
                  <div className="flex-shrink-0 ml-auto flex items-center gap-1 self-end pb-0.5 select-none message-time-badge" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                    {timeBadge}
                  </div>
                </div>
              )}
            </div>

            {msg.buttons && msg.buttons.length > 0 && (
              <div className="flex flex-col w-full select-none" style={{ marginTop: '5px', gap: '5px' }}>
                {msg.buttons.map((btn, bIdx) => (
                  <button
                    key={bIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onButtonClick?.(btn);
                    }}
                    aria-label={btn.text}
                    className="w-full flex items-center justify-center px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255, 255, 255, 0.08)) 80%, var(--accent-color) 12%)',
                      color: 'var(--text-main, #ffffff)',
                      border: 'none',
                      outline: 'none',
                      backdropFilter: 'blur(8px)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--surface-container, rgba(255, 255, 255, 0.14)) 70%, var(--accent-color) 24%)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--surface-container, rgba(255, 255, 255, 0.08)) 80%, var(--accent-color) 12%)';
                    }}
                  >
                    <span className="truncate">{btn.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isPinned && (
          <Pin
            size={10}
            style={{ color: 'var(--accent-color, #7C3AED)' }}
            className="mt-1 select-none"
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.msg === next.msg &&
    prev.isOwn === next.isOwn &&
    prev.isPinned === next.isPinned &&
    prev.bubbleRadius === next.bubbleRadius &&
    prev.currentUserId === next.currentUserId &&
    prev.onButtonClick === next.onButtonClick
);