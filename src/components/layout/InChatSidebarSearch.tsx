import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, Message } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { MessageStatus } from '../MessageStatus';

interface InChatSidebarSearchProps {
  onClose: () => void;
  activeChatId: string | null;
  isMobileView?: boolean;
}

interface MessageSearchResult {
  chatId: string;
  chatName: string;
  chatAvatar?: string;
  isNotes: boolean;
  message: Message;
  messageIndex: number;
  senderName: string;
  senderAvatar?: string;
  isOwn: boolean;
  snippet: string;
}

const formatTelegramSearchTime = (timestamp: number, isRu: boolean): string => {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7 && diffDays >= 0) {
    const daysRu = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return isRu ? daysRu[date.getDay()] : daysEn[date.getDay()];
  }

  const monthsRu = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = isRu ? monthsRu[date.getMonth()] : monthsEn[date.getMonth()];
  return `${day} ${month}`;
};

const formatFoundCount = (count: number, isRu: boolean): string => {
  if (count === 0) {
    return isRu ? 'Сообщений не найдено' : 'No messages found';
  }
  if (!isRu) {
    return count === 1 ? 'Found 1 message' : `Found ${count} messages`;
  }
  const rem10 = count % 10;
  const rem100 = count % 100;
  if (rem100 >= 11 && rem100 <= 19) {
    return `Найдено ${count} сообщений`;
  }
  if (rem10 === 1) {
    return `Найдено ${count} сообщение`;
  }
  if (rem10 >= 2 && rem10 <= 4) {
    return `Найдено ${count} сообщения`;
  }
  return `Найдено ${count} сообщений`;
};

const RESULTS_BATCH_SIZE = 35;

export const InChatSidebarSearch: React.FC<InChatSidebarSearchProps> = ({
  onClose,
  activeChatId,
}) => {
  const { t, i18n } = useTranslation();
  const isRu = i18n.language === 'ru' || i18n.language?.startsWith('ru');

  const chats = useChatStore((s) => s.chats);
  const messagesByChatId = useChatStore((s) => s.messagesByChatId);
  const inChatSearch = useChatStore((s) => s.inChatSearch);
  const setInChatSearchScope = useChatStore((s) => s.setInChatSearchScope);
  const setInChatSearchQuery = useChatStore((s) => s.setInChatSearchQuery);
  const jumpToChatMessage = useChatStore((s) => s.jumpToChatMessage);
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);

  const [searchQuery, setSearchQuery] = useState(inChatSearch?.query || '');
  const [debouncedQuery, setDebouncedQuery] = useState(inChatSearch?.query || '');
  const [isScopeMenuOpen, setIsScopeMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState<number>(RESULTS_BATCH_SIZE);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scopeMenuRef = useRef<HTMLDivElement>(null);

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const scope = inChatSearch?.scope || 'this_chat';

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setInChatSearchQuery(searchQuery);
    }, 80);
    return () => clearTimeout(timer);
  }, [searchQuery, setInChatSearchQuery]);

  useEffect(() => {
    setVisibleCount(RESULTS_BATCH_SIZE);
  }, [debouncedQuery, scope]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(e.target as Node)) {
        setIsScopeMenuOpen(false);
      }
    };
    if (isScopeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isScopeMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery, onClose]);

  const targetChats = useMemo(() => {
    if (scope === 'this_chat') {
      if (!activeChatId) return [];
      if (activeChatId === 'notes') {
        return [{ id: 'notes', name: t('connectModal.notes', 'Заметки'), avatarUrl: undefined, isNotes: true }];
      }
      const found = chats.find((c) => c.id === activeChatId);
      if (!found) return [];
      return [{
        id: found.id,
        name: found.name || 'User',
        avatarUrl: found.avatarUrl,
        isNotes: false,
      }];
    }

    const list: { id: string; name: string; avatarUrl?: string; isNotes: boolean }[] = [];
    for (const c of chats) {
      if (!c || !c.id) continue;
      if (c.id === 'notes') {
        const msgs = messagesByChatId['notes'] || [];
        if (msgs.length > 0) {
          list.push({ id: 'notes', name: t('connectModal.notes', 'Заметки'), avatarUrl: undefined, isNotes: true });
        }
      } else {
        list.push({
          id: c.id,
          name: c.name || 'User',
          avatarUrl: c.avatarUrl,
          isNotes: false,
        });
      }
    }
    return list;
  }, [scope, activeChatId, chats, messagesByChatId, t]);

  const searchResults: MessageSearchResult[] = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];

    const results: MessageSearchResult[] = [];

    for (const chatInfo of targetChats) {
      const msgs = messagesByChatId[chatInfo.id];
      if (!msgs || msgs.length === 0) continue;

      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (!m) continue;

        const rawText = m.text || '';
        const mediaName = m.mediaName || '';
        const isOwn = m.sender === myNickname;
        const senderName = isOwn ? myNickname : (m.sender || chatInfo.name);
        const senderAvatar = isOwn ? myAvatarUrl : chatInfo.avatarUrl;

        const matchText = rawText.toLowerCase().includes(q);
        const matchMedia = mediaName.toLowerCase().includes(q);
        const matchSender = senderName.toLowerCase().includes(q);

        if (matchText || matchMedia || matchSender) {
          let cleanSnippet = rawText;
          if (cleanSnippet.startsWith('[')) {
            cleanSnippet = cleanSnippet.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*(https?:\/\/[^\s]+)?/i, '').trim();
          }
          if (cleanSnippet.startsWith('↩')) {
            cleanSnippet = cleanSnippet.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '').trim();
          }

          const matchIdx = cleanSnippet.toLowerCase().indexOf(q);
          if (matchIdx > 20) {
            cleanSnippet = '...' + cleanSnippet.slice(matchIdx - 12);
          }

          results.push({
            chatId: chatInfo.id,
            chatName: chatInfo.name,
            chatAvatar: chatInfo.avatarUrl,
            isNotes: chatInfo.isNotes,
            message: m,
            messageIndex: i,
            senderName,
            senderAvatar: senderAvatar || undefined,
            isOwn,
            snippet: cleanSnippet || mediaName || (m.mediaType ? `[${m.mediaType}]` : rawText),
          });
        }
      }
    }

    results.sort((a, b) => b.message.time - a.message.time);

    return results;
  }, [debouncedQuery, targetChats, messagesByChatId, myNickname, myAvatarUrl]);

  const visibleResults = useMemo(() => {
    return searchResults.slice(0, visibleCount);
  }, [searchResults, visibleCount]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && visibleCount < searchResults.length) {
      setVisibleCount((prev) => Math.min(searchResults.length, prev + RESULTS_BATCH_SIZE));
    }
  }, [visibleCount, searchResults.length]);

  const handleResultClick = useCallback((res: MessageSearchResult) => {
    jumpToChatMessage(res.chatId, res.messageIndex, res.message.id);
  }, [jumpToChatMessage]);

  const highlightMatch = useCallback((text: string, query: string) => {
    const q = query.trim();
    if (!q || q.length < 2) return text;

    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <span
          key={i}
          style={{
            color: 'var(--accent-color, #7C3AED)',
            fontWeight: 600,
          }}
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden select-none relative bg-transparent">
      <div className="px-4 pt-3 pb-1 flex items-center">
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search', 'Поиск')}
            style={{
              width: '100%',
              height: '36px',
              borderRadius: '999px',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
              color: 'var(--text-main, #e0e0e0)',
              fontSize: '13px',
              paddingLeft: '14px',
              paddingRight: searchQuery ? '32px' : '14px',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDebouncedQuery('');
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-dim, #9ca3af)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-2.5 pb-0.5">
        <span className="text-[12px] font-medium text-[var(--text-dim)]">
          {t('chatSearch.in_chat', 'Поиск в чате:')}
        </span>
      </div>

      <div className="px-3 pb-1.5 flex items-center justify-between relative">
        <div className="relative" ref={scopeMenuRef}>
          <button
            type="button"
            onClick={() => setIsScopeMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer text-left"
            style={{ border: 'none', background: 'transparent' }}
          >
            {scope === 'this_chat' ? (
              activeChatId === 'notes' ? (
                <NotesAvatar className="w-5 h-5 rounded-full flex-shrink-0" />
              ) : (
                <Avatar
                  src={activeChat?.avatarUrl}
                  alt={activeChat?.name || ''}
                  className="w-5 h-5 rounded-full flex-shrink-0"
                />
              )
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="text-[var(--text-dim)] flex-shrink-0"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
            <span className="text-[13px] font-medium text-[var(--text-main)]">
              {scope === 'this_chat'
                ? t('chatSearch.this_chat', 'Этот чат')
                : t('chatSearch.my_chats', 'Мои чаты')}
            </span>
            <ChevronDown size={14} className="text-[var(--text-dim)]" />
          </button>

          {isScopeMenuOpen && (
            <div
              className="absolute left-0 top-[38px] z-50 min-w-[170px] py-1 rounded-xl shadow-2xl backdrop-blur-xl"
              style={{
                backgroundColor: 'var(--settings-bg, var(--bg-secondary, #1e2932))',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setInChatSearchScope('this_chat');
                  setIsScopeMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] transition-colors hover:bg-white/5 text-left cursor-pointer"
                style={{ border: 'none', background: 'transparent' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {activeChatId === 'notes' ? (
                    <NotesAvatar className="w-5 h-5 rounded-full flex-shrink-0" />
                  ) : (
                    <Avatar
                      src={activeChat?.avatarUrl}
                      alt={activeChat?.name || ''}
                      className="w-5 h-5 rounded-full flex-shrink-0"
                    />
                  )}
                  <span className="text-[13px] text-[var(--text-main)] truncate">
                    {t('chatSearch.this_chat', 'Этот чат')}
                  </span>
                </div>
                {scope === 'this_chat' && (
                  <Check size={16} className="text-[var(--accent-color, #7C3AED)] flex-shrink-0 ml-2" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setInChatSearchScope('all_chats');
                  setIsScopeMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] transition-colors hover:bg-white/5 text-left cursor-pointer"
                style={{ border: 'none', background: 'transparent' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-[var(--text-dim)] flex-shrink-0"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[13px] text-[var(--text-main)] truncate">
                    {t('chatSearch.my_chats', 'Мои чаты')}
                  </span>
                </div>
                {scope === 'all_chats' && (
                  <Check size={16} className="text-[var(--accent-color, #7C3AED)] flex-shrink-0 ml-2" />
                )}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Закрыть')}
          className="p-1.5 rounded-full hover:bg-white/10 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
          style={{ border: 'none', background: 'transparent' }}
        >
          <X size={16} />
        </button>
      </div>

      {debouncedQuery.trim() !== '' && (
        <div
          className="px-4 py-2 select-none"
          style={{
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
          }}
        >
          <span className="text-[12px] font-medium text-[var(--text-dim)]">
            {formatFoundCount(searchResults.length, isRu)}
          </span>
        </div>
      )}

      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar"
      >
        {debouncedQuery.trim() === '' ? (
          <div className="h-full flex flex-col items-center justify-center select-none py-20 px-4 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}
            >
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="text-[var(--text-dim)] opacity-40"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <span className="text-[13.5px] text-[var(--text-dim)] font-medium">
              {t('chatSearch.search_messages', 'Поиск по сообщениям')}
            </span>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center select-none px-4 text-center">
            <span className="text-[13px] text-[var(--text-dim)] font-medium">
              {t('chatSearch.no_results', 'Ничего не найдено')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col py-1">
            {visibleResults.map((res, idx) => {
              const avatarToDisplay = res.isNotes
                ? undefined
                : (scope === 'this_chat' ? (res.isOwn ? myAvatarUrl : res.senderAvatar) : (res.chatAvatar || res.senderAvatar));
              const displayName = scope === 'this_chat' ? res.senderName : res.chatName;

              return (
                <div
                  key={`${res.chatId}_${res.message.id || res.message.time}_${idx}`}
                  onClick={() => handleResultClick(res)}
                  className="px-3.5 py-2 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors select-none group"
                >
                  {res.isNotes ? (
                    <NotesAvatar className="w-10 h-10 rounded-full flex-shrink-0" />
                  ) : (
                    <Avatar
                      src={avatarToDisplay}
                      alt={displayName}
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                  )}

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-semibold text-[13px] text-[var(--text-main)] truncate">
                          {displayName}
                        </span>
                        {!res.isOwn && (
                          <DeveloperBadge
                            userId={res.chatId}
                            nickname={displayName}
                            size={14}
                          />
                        )}
                      </div>

                      <div className="flex items-center flex-shrink-0 ml-1">
                        {res.isOwn && (
                          <MessageStatus
                            status={res.message.read || res.message.status === 'read' ? 'read' : (res.message.status || 'sent')}
                            className="mr-1"
                            isOwn={true}
                            color="var(--accent-color, #7C3AED)"
                          />
                        )}
                        <span className="text-[11px] text-[var(--text-dim)] tabular-nums">
                          {formatTelegramSearchTime(res.message.time, isRu)}
                        </span>
                      </div>
                    </div>

                    <div className="text-[12.5px] text-[var(--text-dim)] truncate mt-0.5 leading-snug">
                      {scope === 'all_chats' && !res.isOwn && res.message.sender && (
                        <span className="text-[var(--text-main)] font-medium mr-1">
                          {res.message.sender}:
                        </span>
                      )}
                      {highlightMatch(res.snippet, debouncedQuery)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
