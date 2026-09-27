import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Bookmark, ShieldCheck } from 'lucide-react';
import { useChatStore, Message, Chat } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  messagesToForward: Message[];
  onForward: (targetChatId: string, hideAuthor: boolean) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  onClose,
  messagesToForward,
  onForward,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [hideAuthor, setHideAuthor] = useState(false);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list: Array<Chat | { id: 'notes'; name: string; type: 'notes' }> = [
      { id: 'notes', name: t('forward.notes', 'Избранное'), type: 'notes' },
      ...chats.filter((c) => !c.isBlocked && c.id !== 'notes'),
    ];

    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [chats, searchQuery, t]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          maxHeight: '85vh',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary, #1c1c1e))',
          borderRadius: '16px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 600,
                color: 'var(--text-main, #ffffff)',
              }}
            >
              {t('forward.forward_messages', 'Переслать сообщения')}
            </h3>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-dim, #8e8e93)',
              }}
            >
              {t('forward.messages_count', { count: messagesToForward.length })}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.cancel', 'Отмена')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim, #8e8e93)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = 'var(--text-main, #ffffff)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-dim, #8e8e93)';
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.03))',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '13.5px',
                  fontWeight: 500,
                  color: 'var(--text-main, #ffffff)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ShieldCheck size={16} style={{ color: hideAuthor ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim, #8e8e93)' }} />
                {t('forward.hide_author', 'Скрыть имя автора')}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)' }}>
                {t('forward.hide_author_desc', 'Анонимизировать метаданные перед отправкой')}
              </span>
            </div>
            <div
              onClick={() => setHideAuthor(!hideAuthor)}
              style={{
                width: '42px',
                height: '24px',
                borderRadius: '12px',
                backgroundColor: hideAuthor ? 'var(--accent-color, #9b7dd4)' : 'rgba(255, 255, 255, 0.15)',
                position: 'relative',
                transition: 'background-color 0.2s',
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: '12px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: hideAuthor ? '20px' : '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                }}
              />
            </div>
          </label>
        </div>

        <div style={{ padding: '12px 20px 8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--surface-container-high, rgba(255, 255, 255, 0.06))',
              borderRadius: '10px',
              padding: '8px 12px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            }}
          >
            <Search size={16} style={{ color: 'var(--text-dim, #8e8e93)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('forward.search_placeholder', 'Поиск чата...')}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main, #ffffff)',
                fontSize: '13.5px',
                width: '100%',
              }}
            />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {filteredChats.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: 'var(--text-dim, #8e8e93)',
                fontSize: '13px',
              }}
            >
              {t('forward.no_chats', 'Чаты не найдены')}
            </div>
          ) : (
            filteredChats.map((chat) => {
              const isNotes = chat.id === 'notes';
              const isCurrent = chat.id === activeChatId;

              return (
                <button
                  key={chat.id}
                  onClick={() => onForward(chat.id, hideAuthor)}
                  aria-label={chat.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    width: '100%',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                    textAlign: 'left',
                    boxSizing: 'border-box',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    {isNotes ? (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-color, #9b7dd4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                        }}
                      >
                        <Bookmark size={20} />
                      </div>
                    ) : (
                      <Avatar
                        src={(chat as Chat).avatarUrl}
                        alt={chat.name}
                        className="w-10 h-10 rounded-full"
                      />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '14.5px',
                          fontWeight: 500,
                          color: 'var(--text-main, #ffffff)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {chat.name}
                      </span>
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--accent-color, #9b7dd4)',
                            fontWeight: 500,
                          }}
                        >
                          ({t('forward.current', 'текущий')})
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-dim, #8e8e93)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '1px',
                      }}
                    >
                      {isNotes
                        ? t('forward.notes', 'Избранное')
                        : (chat as Chat).type === 'channel'
                        ? t('forward.channel', 'Канал')
                        : (chat as Chat).type === 'group'
                        ? t('forward.group', 'Группа')
                        : ((chat as Chat).lastMsg || t('forward.dialog', 'Диалог'))}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
