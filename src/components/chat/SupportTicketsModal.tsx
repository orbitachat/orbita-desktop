import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supportService, SupportTicketRecord } from '../../services/supportService';
import { useChatStore } from '../../store/useChatStore';

interface SupportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportTicketsModal: React.FC<SupportTicketsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [isMobileWidth, setIsMobileWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 650 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileWidth(window.innerWidth < 650);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = supportService.subscribeToTickets((list) => {
      setTickets(list);
    });
    supportService.fetchAdminTickets();
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenTicket = (ticketNumber: string) => {
    onClose();
    useChatStore.getState().setActiveChat('system_support');
    useChatStore.getState().setCurrentView('chats');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('orbita:reply-ticket', { detail: { ticketNumber } }));
    }, 60);
  };

  const handleCloseTicket = async (e: React.MouseEvent, ticketNumber: string) => {
    e.stopPropagation();
    await supportService.closeTicket(ticketNumber);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="support-tickets-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 600,
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
          initial={{ opacity: 1, scale: 1, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: isMobileWidth ? '100vw' : '400px',
            maxHeight: isMobileWidth ? 'calc(100vh - 30px)' : 'min(90vh, 720px)',
            height: isMobileWidth ? 'calc(100vh - 30px)' : 'auto',
            display: 'flex',
            flexDirection: 'column',
            margin: isMobileWidth ? '0' : '0 16px',
            marginTop: isMobileWidth ? '30px' : '0',
            backgroundColor: 'var(--md-bg, #211d2f)',
            borderRadius: isMobileWidth ? 0 : 10,
            border: 'none',
            outline: 'none',
            color: 'var(--md-on-surface, #e8e0f0)',
            boxShadow: isMobileWidth ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              padding: '16px 20px',
              backgroundColor: 'var(--md-bg, #211d2f)',
              flexShrink: 0,
              userSelect: 'none',
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 18%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-color, #7C3AED)',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={19} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--md-on-surface, #e8e0f0)' }}>
                  {t('support.admin_panel_title', 'Управление обращениями')}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--md-on-surface-var, #a89eb8)', marginTop: 1 }}>
                  {tickets.length > 0 ? `${tickets.length} ${t('support.open_tickets_badge', 'Тикеты')}` : t('support.no_active_tickets', 'Нет открытых обращений')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Закрыть')}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--md-on-surface-var, #a89eb8)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-color, #9b7dd4)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--md-on-surface-var, #a89eb8)')}
            >
              <X size={20} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '0 0 8px',
            }}
            className="chat-list-scrollbar"
          >
            {tickets.length === 0 ? (
              <div style={{ padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
                <MessageSquare size={36} style={{ color: 'var(--md-on-surface-var, #a89eb8)', opacity: 0.4 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--md-on-surface, #e8e0f0)' }}>
                  {t('support.no_active_tickets', 'Нет открытых обращений')}
                </span>
                <span style={{ fontSize: 12, color: 'var(--md-on-surface-var, #a89eb8)', maxWidth: 260, lineHeight: 1.4 }}>
                  {t('support.no_active_tickets_desc', 'Все обращения пользователей обработаны или закрыты.')}
                </span>
              </div>
            ) : (
              tickets.map((tk) => {
                const isAnswered = tk.status === 'answered';
                const rawText = (tk.decrypted_message_text || tk.message_text || '').replace(/^orb_e2e:/, '');
                const parts = rawText.split('\n\n---\n\n');
                const latestQuestion = parts[parts.length - 1]?.trim() || rawText;
                const timeDate = tk.created_at ? new Date(tk.created_at) : null;
                const timeStr = timeDate
                  ? `${timeDate.getHours().toString().padStart(2, '0')}:${timeDate.getMinutes().toString().padStart(2, '0')}`
                  : '';

                return (
                  <div
                    key={tk.ticket_number}
                    onClick={() => handleOpenTicket(tk.ticket_number)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      cursor: 'pointer',
                      transition: 'background-color 120ms ease',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        backgroundColor: isAnswered
                          ? 'rgba(34, 197, 94, 0.15)'
                          : 'color-mix(in srgb, var(--accent-color, #7C3AED) 18%, transparent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isAnswered ? '#4ade80' : 'var(--accent-color, #9b7dd4)',
                        flexShrink: 0,
                        position: 'relative',
                      }}
                    >
                      <MessageSquare size={20} />
                      {!isAnswered && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-color, #9b7dd4)',
                            boxShadow: '0 0 0 2px var(--md-bg, #211d2f)',
                          }}
                        />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--md-on-surface, #e8e0f0)' }}>
                            {tk.ticket_number}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--md-on-surface-var, #a89eb8)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {tk.sender_nickname || 'User'}
                          </span>
                        </div>
                        {timeStr && (
                          <span style={{ fontSize: 11, color: 'var(--md-on-surface-var, #a89eb8)', flexShrink: 0 }}>
                            {timeStr}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 12.5,
                            color: 'var(--md-on-surface-var, #a89eb8)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {latestQuestion}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: isAnswered ? 'rgba(34, 197, 94, 0.15)' : 'color-mix(in srgb, var(--accent-color, #7C3AED) 18%, transparent)',
                              color: isAnswered ? '#4ade80' : 'var(--accent-color, #9b7dd4)',
                            }}
                          >
                            {isAnswered ? t('support.status_answered', 'Отвечено') : t('support.status_pending', 'Ожидает ответа')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCloseTicket(e, tk.ticket_number)}
                            aria-label={t('support.close_ticket', 'Закрыть тикет')}
                            style={{
                              background: 'none',
                              border: 'none',
                              outline: 'none',
                              color: 'var(--md-on-surface-var, #a89eb8)',
                              cursor: 'pointer',
                              padding: 3,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 4,
                              transition: 'color 120ms',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ff595a')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--md-on-surface-var, #a89eb8)')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
