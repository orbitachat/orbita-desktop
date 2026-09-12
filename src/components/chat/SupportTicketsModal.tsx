import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, ShieldAlert, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supportService, SupportTicketRecord } from '../../services/supportService';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';

interface SupportTicketsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportTicketsModal: React.FC<SupportTicketsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [selectedTicketNumber, setSelectedTicketNumber] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [closingTicketNumber, setClosingTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = supportService.subscribeToTickets((list) => {
      setTickets(list);
      if (list.length > 0 && !selectedTicketNumber) {
        setSelectedTicketNumber(list[0].ticket_number);
      }
    });
    supportService.fetchAdminTickets();
    return () => unsub();
  }, [isOpen, selectedTicketNumber]);

  if (!isOpen) return null;

  const selectedTicket = tickets.find((tk) => tk.ticket_number === selectedTicketNumber) || tickets[0];

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    const ok = await supportService.replyToTicket(selectedTicket.ticket_number, replyText.trim());
    setIsSubmitting(false);
    if (ok) {
      setReplyText('');
    }
  };

  const handleCloseTicket = async (ticketNumber: string) => {
    if (isSubmitting) return;
    setClosingTicketNumber(ticketNumber);
    await supportService.closeTicket(ticketNumber);
    setClosingTicketNumber(null);
    if (selectedTicketNumber === ticketNumber) {
      const remaining = tickets.filter((t) => t.ticket_number !== ticketNumber);
      setSelectedTicketNumber(remaining.length > 0 ? remaining[0].ticket_number : null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 select-none"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-[820px] h-[580px] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-secondary, #1a1726)',
          border: '1px solid color-mix(in srgb, var(--accent-color, #7C3AED) 25%, transparent)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border-color, rgba(255, 255, 255, 0.08))' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 20%, transparent)' }}
            >
              <ShieldAlert size={20} style={{ color: 'var(--accent-color, #7C3AED)' }} />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold" style={{ color: 'var(--text-main, #ffffff)' }}>
                {t('support.admin_panel_title', 'Управление обращениями')}
              </h2>
              <p className="text-[12px]" style={{ color: 'var(--text-dim, rgba(255, 255, 255, 0.6))' }}>
                {t('support.admin_panel_subtitle', 'Активные сессии обращений технической поддержки')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Закрыть')}
            className="p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
            style={{ backgroundColor: 'transparent' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div
            className="w-[280px] border-r flex flex-col flex-shrink-0 overflow-y-auto"
            style={{ borderColor: 'var(--border-color, rgba(255, 255, 255, 0.08))' }}
          >
            {tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <MessageSquare size={32} style={{ color: 'var(--text-dim)', opacity: 0.4 }} className="mb-2" />
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-dim)' }}>
                  {t('support.no_active_tickets', 'Нет открытых обращений')}
                </span>
                <span className="text-[11px] mt-1" style={{ color: 'var(--text-dim)', opacity: 0.7 }}>
                  {t('support.no_active_tickets_desc', 'Все обращения пользователей обработаны или закрыты.')}
                </span>
              </div>
            ) : (
              tickets.map((tk) => {
                const isSelected = selectedTicket?.ticket_number === tk.ticket_number;
                const isAnswered = tk.status === 'answered';
                return (
                  <div
                    key={tk.ticket_number}
                    onClick={() => setSelectedTicketNumber(tk.ticket_number)}
                    className="p-3.5 border-b cursor-pointer transition-all flex flex-col gap-1 text-left"
                    style={{
                      borderColor: 'var(--border-color, rgba(255, 255, 255, 0.05))',
                      backgroundColor: isSelected
                        ? 'color-mix(in srgb, var(--accent-color, #7C3AED) 16%, transparent)'
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-main)' }}>
                        {tk.ticket_number}
                      </span>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                        style={{
                          backgroundColor: isAnswered
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'color-mix(in srgb, var(--accent-color, #7C3AED) 20%, transparent)',
                          color: isAnswered ? '#4ade80' : 'var(--accent-color, #a78bfa)',
                        }}
                      >
                        {isAnswered
                          ? t('support.status_answered', 'Отвечено')
                          : t('support.status_pending', 'Ожидает ответа')}
                      </span>
                    </div>
                    <span className="text-[12px] truncate" style={{ color: 'var(--text-dim)' }}>
                      {tk.sender_nickname || 'Пользователь'} (ID: {tk.user_code})
                    </span>
                    <span className="text-[11px] truncate opacity-70" style={{ color: 'var(--text-dim)' }}>
                      {(tk.decrypted_message_text || tk.message_text).replace(/^orb_e2e:/, '')}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary,rgba(0,0,0,0.2))]">
            {selectedTicket ? (
              <div className="flex-1 flex flex-col min-h-0 p-5 gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color,rgba(255,255,255,0.08))]">
                  <div>
                    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-main)' }}>
                      {selectedTicket.ticket_number}
                    </h3>
                    <span className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
                      {selectedTicket.sender_nickname || 'Пользователь'} • ID: {selectedTicket.user_code}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCloseTicket(selectedTicket.ticket_number)}
                    disabled={closingTicketNumber === selectedTicket.ticket_number}
                    aria-label={t('support.close_ticket', 'Закрыть тикет')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    {closingTicketNumber === selectedTicket.ticket_number ? (
                      <MD3CircularSpinner size="small" color="#f87171" />
                    ) : (
                      <X size={14} />
                    )}
                    <span>{t('support.close_ticket', 'Закрыть тикет')}</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                  <div
                    className="p-3.5 rounded-xl text-left"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                    }}
                  >
                    <span className="text-[11px] font-medium block mb-1 opacity-60" style={{ color: 'var(--text-dim)' }}>
                      {selectedTicket.sender_nickname || 'Пользователь'}:
                    </span>
                    <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-main)' }}>
                      {(selectedTicket.decrypted_message_text || selectedTicket.message_text).replace(/^orb_e2e:/, '')}
                    </p>
                  </div>

                  {selectedTicket.admin_reply && (
                    <div
                      className="p-3.5 rounded-xl text-left"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent-color, #7C3AED) 20%, transparent)',
                      }}
                    >
                      <span className="text-[11px] font-medium block mb-1" style={{ color: 'var(--accent-color, #a78bfa)' }}>
                        {t('support.name', 'Техническая поддержка')}:
                      </span>
                      <p className="text-[13px] whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-main)' }}>
                        {selectedTicket.admin_reply.replace(/^orb_e2e:/, '')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-color,rgba(255,255,255,0.08))]">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    placeholder={t('support.reply_placeholder', 'Введите ответ на обращение...')}
                    className="flex-1 px-3.5 py-2.5 rounded-xl text-[13px] outline-none transition-all"
                    style={{
                      backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.07))',
                      color: 'var(--text-main, #ffffff)',
                      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSubmitting}
                    aria-label={t('support.send_reply', 'Отправить ответ')}
                    className="flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: 'var(--accent-color, #7C3AED)',
                      color: '#ffffff',
                    }}
                  >
                    {isSubmitting ? (
                      <MD3CircularSpinner size="small" color="#ffffff" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <MessageSquare size={36} style={{ color: 'var(--text-dim)', opacity: 0.4 }} className="mb-3" />
                <span className="text-[14px] font-medium" style={{ color: 'var(--text-dim)' }}>
                  {t('support.select_ticket_to_reply', 'Выберите обращение для ответа')}
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
