import React from 'react';
import { useTranslation } from 'react-i18next';
import { ForwardedFrom, useChatStore } from '../../store/useChatStore';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { Avatar } from '../common/Avatar';
import { useForwardedAuthor } from '../../hooks/useForwardedAuthor';
import { useToastStore } from '../../store/useToastStore';

interface ForwardedMessageBlockProps {
  forwarded: ForwardedFrom;
  isOwn: boolean;
  themeColor?: string;
}

export const ForwardedMessageBlock: React.FC<ForwardedMessageBlockProps> = ({
  forwarded,
  isOwn,
  themeColor,
}) => {
  const { t } = useTranslation();
  const { nickname, avatarUrl, isIdHidden, senderId, isAnonymous } = useForwardedAuthor(forwarded);

  const activeChatId = useChatStore((s) => s.activeChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const setCurrentView = useChatStore((s) => s.setCurrentView);
  const myCode = useChatStore((s) => s.myCode);
  const chats = useChatStore((s) => s.chats);

  const handleClickNickname = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isIdHidden || !senderId) return;

    if (myCode && senderId === myCode) {
      if (activeChatId === 'notes') {
        useToastStore.getState().showToast(t('forward.already_in_chat', { nickname }), 'text');
      } else {
        setActiveChat('notes');
        setCurrentView('chats');
      }
      return;
    }

    const existingChat = chats.find(
      (c) => c.id !== 'notes' && (c.peerCode === senderId || (c.type === 'private' && (c.name === senderId || c.peerCode === senderId)))
    );

    if (existingChat) {
      if (activeChatId === existingChat.id) {
        useToastStore.getState().showToast(t('forward.already_in_chat', { nickname }), 'text');
      } else {
        setActiveChat(existingChat.id);
        setCurrentView('chats');
      }
    } else {
      window.dispatchEvent(new CustomEvent('orbita:start-chat-with-user', { detail: { code: senderId } }));
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 select-none"
      style={{
        fontSize: '12.5px',
        lineHeight: 1.2,
        color: isOwn ? 'rgba(255, 255, 255, 0.92)' : (themeColor || 'var(--accent-color, #9b7dd4)'),
        fontWeight: 500,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span className="truncate flex items-center gap-1.5">
        {isAnonymous ? (
          t('forward.forwarded_message', 'Пересланное сообщение')
        ) : (
          <>
            <span style={{ opacity: 0.85, fontWeight: 400 }}>
              {t('forward.forwarded_from', 'Переслано от')}
            </span>
            {!isIdHidden && (
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                  display: 'inline-flex',
                }}
              >
                <Avatar
                  src={avatarUrl}
                  alt={nickname}
                  style={{ width: 16, height: 16, borderRadius: '50%' }}
                />
              </div>
            )}
            <span
              onClick={handleClickNickname}
              className={!isIdHidden ? 'hover:underline' : ''}
              style={{
                fontWeight: 600,
                cursor: isIdHidden ? 'default' : 'pointer',
              }}
            >
              {nickname}
            </span>
          </>
        )}
      </span>
      {!isAnonymous && !isIdHidden && senderId && (
        <DeveloperBadge userId={senderId} size={15} />
      )}
    </div>
  );
};

