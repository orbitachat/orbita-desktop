import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore, isMessageOutgoing } from '../../store/useChatStore';
import { useCallStore } from '../../store/useCallStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Avatar } from '../common/Avatar';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';

interface CallsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CallsModal: React.FC<CallsModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const chats = useChatStore((s) => s.chats);
  const messagesByChatId = useChatStore((s) => s.messagesByChatId);
  const setActiveChat = useChatStore((s) => s.setActiveChat);
  const myCode = useChatStore((s) => s.myCode);
  const startCall = useCallStore((s) => s.startCall);
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';

  const innerContentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const callsScrollRef = useRef<HTMLDivElement>(null);

  const [targetHeight, setTargetHeight] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(window.innerHeight * 0.85, 720);
    }
    return 720;
  });

  const [callsThumb, setCallsThumb] = useState<{ top: number; height: number } | null>(null);
  const [isCallsActive, setIsCallsActive] = useState(false);
  const callsActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isMobileWidth, setIsMobileWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 680 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileWidth(window.innerWidth < 680);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const chatIds = new Set(chats.map((c) => c.id));
    const orphanedKeys = Object.keys(messagesByChatId).filter((id) => !chatIds.has(id));
    if (orphanedKeys.length > 0) {
      useChatStore.setState((state) => {
        const nextMsgs = { ...state.messagesByChatId };
        orphanedKeys.forEach((k) => delete nextMsgs[k]);
        return { messagesByChatId: nextMsgs };
      });
    }
  }, [isOpen, chats, messagesByChatId]);

  const formatCallDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (isToday) {
      return timeStr;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return `${t('common.yesterday', 'вчера')} ${t('common.at', 'в')} ${timeStr}`;
    }

    const isRu = i18n.language?.startsWith('ru');
    const monthsRu = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    if (isRu) {
      return `${date.getDate()} ${monthsRu[date.getMonth()]} ${t('common.at', 'в')} ${timeStr}`;
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` ${timeStr}`;
  };

  const callHistory = useMemo(() => {
    const list: Array<{
      id: string;
      chatId: string;
      chatName: string;
      avatarUrl?: string;
      time: number;
      timeFormatted: string;
      isOutgoing: boolean;
      status: string;
    }> = [];

    const activeChatsMap = new Map(chats.map((c) => [c.id, c]));

    Object.entries(messagesByChatId).forEach(([chatId, msgs]) => {
      const chat = activeChatsMap.get(chatId);
      if (!chat) return;

      msgs.forEach((msg) => {
        if (msg.mediaType !== 'call' && !msg.text?.startsWith('[Call]')) {
          return;
        }

        const isOutgoing = isMessageOutgoing(msg, myCode, myNickname, chat);
        const status = msg.mediaName || 'completed';

        list.push({
          id: msg.id || `${chat.id}_${msg.time}`,
          chatId: chat.id,
          chatName: chat.name,
          avatarUrl: chat.avatarUrl,
          time: msg.time,
          timeFormatted: formatCallDate(msg.time),
          isOutgoing,
          status,
        });
      });
    });

    list.sort((a, b) => b.time - a.time);
    return list;
  }, [messagesByChatId, chats, myCode, myNickname, t, i18n.language]);

  const contacts = useMemo(() => {
    return chats.filter((c) => c.id !== 'notes' && c.type !== 'channel');
  }, [chats]);

  const updateCallsThumb = useCallback(() => {
    const el = callsScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4) {
      setCallsThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setCallsThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerCallsActive = useCallback(() => {
    updateCallsThumb();
    const el = callsScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 4) {
      setIsCallsActive(true);
      if (callsActiveTimerRef.current) clearTimeout(callsActiveTimerRef.current);
      callsActiveTimerRef.current = setTimeout(() => {
        setIsCallsActive(false);
      }, 1000);
    } else {
      setIsCallsActive(false);
    }
  }, [updateCallsThumb]);

  const handleCallsMouseLeave = useCallback(() => {
    if (callsActiveTimerRef.current) clearTimeout(callsActiveTimerRef.current);
    setIsCallsActive(false);
  }, []);

  useEffect(() => {
    updateCallsThumb();
  }, [callHistory.length, contacts.length, updateCallsThumb]);

  useEffect(() => {
    const el = callsScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateCallsThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateCallsThumb]);

  useEffect(() => {
    if (isMobileWidth || !isOpen) return;

    const measure = () => {
      if (innerContentRef.current) {
        const contentH = innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight;
        const headerH = headerRef.current?.offsetHeight || 56;
        const footerH = footerRef.current?.offsetHeight || 52;
        const measured = Math.ceil(contentH) + headerH + footerH;
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
  }, [callHistory.length, contacts.length, isMobileWidth, isOpen]);

  const handleStartCall = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    onClose();
    startCall(chatId, 'audio', myNickname);
  };

  const handleSelectContact = (chatId: string) => {
    setActiveChat(chatId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      key="calls-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: isMobileWidth ? 'block' : 'flex',
        alignItems: isMobileWidth ? 'stretch' : 'flex-start',
        justifyContent: isMobileWidth ? 'stretch' : 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        border: 'none',
        padding: isMobileWidth ? '0' : 'min(7.5vh, 64px) 16px 16px',
        userSelect: 'none',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{
          opacity: 1,
          scale: 1,
          height: isMobileWidth ? 'calc(100vh - 30px)' : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900),
        }}
        animate={{
          opacity: 1,
          scale: 1,
          height: isMobileWidth
            ? 'calc(100vh - 30px)'
            : targetHeight !== null
            ? Math.min(targetHeight, typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900)
            : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900),
        }}
        transition={{
          height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0 },
          scale: { duration: 0 },
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isMobileWidth ? '100vw' : '400px',
          maxHeight: isMobileWidth ? 'calc(100vh - 30px)' : 'min(90vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          margin: isMobileWidth ? '0' : '0 16px',
          marginTop: isMobileWidth ? '30px' : '0',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary, #211d2f))',
          borderRadius: isMobileWidth ? 0 : 10,
          color: 'var(--text-main, #ffffff)',
          boxShadow: isMobileWidth ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div
          ref={headerRef}
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            padding: '16px 20px',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary, #211d2f))',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            boxSizing: 'border-box',
            borderBottom: 'none',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text-main, #ffffff)',
              margin: 0,
              userSelect: 'none',
            }}
          >
            {t('callsModal.title', 'Звонки')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Закрыть')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim, #9f96b3)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'color 150ms',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, #9f96b3)')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
              <path
                fill="currentColor"
                d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12L4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586z"
              />
            </svg>
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onMouseMove={triggerCallsActive}
          onMouseEnter={triggerCallsActive}
          onMouseLeave={handleCallsMouseLeave}
        >
          <div
            ref={callsScrollRef}
            onScroll={triggerCallsActive}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
            className="chat-list-scrollbar select-none"
          >
            <div ref={innerContentRef} style={{ width: '100%', minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
              {callHistory.length > 0 ? (
                callHistory.map((item) => {
                  const isMissed = item.status === 'missed' || item.status === 'rejected' || item.status === 'declined' || item.status === 'canceled';
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectContact(item.chatId)}
                      className="group relative cursor-pointer"
                      style={{
                        borderRadius: 0,
                        width: '100%',
                        backgroundColor: 'transparent',
                        border: 'none',
                        padding: '8px 16px',
                        minHeight: 48,
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background-color 0.12s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255, 255, 255, 0.04))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <Avatar
                          src={item.avatarUrl}
                          alt={item.chatName}
                          className="w-10 h-10 rounded-full shrink-0"
                        />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-semibold text-[14.5px] text-[var(--text-main)] truncate">
                            {item.chatName}
                          </span>
                          <div className="flex items-center gap-1 text-xs text-[var(--text-dim)] mt-0.5">
                            {item.isOutgoing ? (
                              <ArrowUpRight size={17} strokeWidth={2.2} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                            ) : isMissed ? (
                              <ArrowDownLeft size={17} strokeWidth={2.2} style={{ color: '#ef4444', flexShrink: 0 }} />
                            ) : (
                              <ArrowDownLeft size={17} strokeWidth={2.2} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                            )}
                            <span className="truncate">{item.timeFormatted}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleStartCall(e, item.chatId)}
                        aria-label={t('callsModal.start_call', 'Позвонить')}
                        style={{
                          background: 'none',
                          border: 'none',
                          outline: 'none',
                          padding: '6px',
                          cursor: 'pointer',
                          color: 'var(--text-dim, #9f96b3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '8px',
                          flexShrink: 0,
                          transition: 'color 150ms, background-color 150ms',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = 'var(--text-main, #ffffff)';
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-dim, #9f96b3)';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
                          <g fill="none">
                            <path fill="currentColor" d="M20 16v4c-2.758 0-5.07-.495-7-1.325-3.841-1.652-6.176-4.63-7.5-7.675C4.4 8.472 4 5.898 4 4h4l1 4l-3.5 3c1.324 3.045 3.659 6.023 7.5 7.675L16 15z" />
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 18.675c1.93.83 4.242 1.325 7 1.325v-4l-4-1zm0 0C9.159 17.023 6.824 14.045 5.5 11m0 0C4.4 8.472 4 5.898 4 4h4l1 4z" />
                          </g>
                        </svg>
                      </button>
                    </div>
                  );
                })
              ) : contacts.length > 0 ? (
                contacts.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => handleSelectContact(chat.id)}
                    className="group relative cursor-pointer"
                    style={{
                      borderRadius: 0,
                      width: '100%',
                      backgroundColor: 'transparent',
                      border: 'none',
                      padding: '8px 16px',
                      minHeight: 48,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background-color 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255, 255, 255, 0.04))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <Avatar
                        src={chat.avatarUrl}
                        alt={chat.name}
                        className="w-10 h-10 rounded-full shrink-0"
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-semibold text-[14.5px] text-[var(--text-main)] truncate">
                          {chat.name}
                        </span>
                        <span className="text-xs text-[var(--text-dim)] mt-0.5">
                          {chat.online ? t('common.online', 'в сети') : t('common.offline', 'был(а) недавно')}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleStartCall(e, chat.id)}
                      aria-label={t('callsModal.start_call', 'Позвонить')}
                      style={{
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        padding: '6px',
                        cursor: 'pointer',
                        color: 'var(--text-dim, #9f96b3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '8px',
                        flexShrink: 0,
                        transition: 'color 150ms, background-color 150ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--text-main, #ffffff)';
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-dim, #9f96b3)';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">
                        <g fill="none">
                          <path fill="currentColor" d="M20 16v4c-2.758 0-5.07-.495-7-1.325-3.841-1.652-6.176-4.63-7.5-7.675C4.4 8.472 4 5.898 4 4h4l1 4l-3.5 3c1.324 3.045 3.659 6.023 7.5 7.675L16 15z" />
                          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 18.675c1.93.83 4.242 1.325 7 1.325v-4l-4-1zm0 0C9.159 17.023 6.824 14.045 5.5 11m0 0C4.4 8.472 4 5.898 4 4h4l1 4z" />
                        </g>
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)] gap-2 text-center px-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" className="opacity-30 mb-1">
                    <g fill="none">
                      <path fill="currentColor" d="M20 16v4c-2.758 0-5.07-.495-7-1.325-3.841-1.652-6.176-4.63-7.5-7.675C4.4 8.472 4 5.898 4 4h4l1 4l-3.5 3c1.324 3.045 3.659 6.023 7.5 7.675L16 15z" />
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 18.675c1.93.83 4.242 1.325 7 1.325v-4l-4-1zm0 0C9.159 17.023 6.824 14.045 5.5 11m0 0C4.4 8.472 4 5.898 4 4h4l1 4z" />
                    </g>
                  </svg>
                  <span className="text-sm font-medium">
                    {t('callsModal.no_calls', 'История звонков пуста')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {callsThumb && (
            <>
              <div
                className="overlay-scroll-track"
                onMouseDown={(e) => handleScrollbarTrackMouseDown(e, callsScrollRef.current)}
                style={{
                  top: '6px',
                  bottom: '6px',
                  opacity: isCallsActive ? 1 : 0,
                }}
              />
              <div
                className="overlay-scroll-thumb"
                onMouseDown={(e) => handleScrollbarThumbMouseDown(e, callsScrollRef.current)}
                style={{
                  top: callsThumb.top + 6,
                  height: callsThumb.height,
                  opacity: isCallsActive ? 1 : 0,
                }}
              />
            </>
          )}
        </div>

        <div
          ref={footerRef}
          style={{
            padding: '10px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary, #211d2f))',
            borderTop: 'none',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Закрыть')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '8px',
              outline: 'none',
            }}
          >
            {t('common.close', 'Закрыть')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
