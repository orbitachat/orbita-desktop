import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { NotesAvatar } from './NotesAvatar';

export type ConfirmActionType =
  | 'clear_history'
  | 'delete_chat'
  | 'leave_channel'
  | 'delete_message'
  | 'pin_message'
  | 'unpin_message'
  | 'discard_voice';

interface ActionConfirmModalProps {
  isOpen: boolean;
  type: ConfirmActionType | null;
  chatName?: string;
  avatarUrl?: string;
  isNotes?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  isOpen,
  type,
  chatName = '',
  avatarUrl,
  isNotes = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen || !type) return null;

  const isDestructive =
    type === 'clear_history' || type === 'delete_chat' || type === 'leave_channel' || type === 'delete_message' || type === 'discard_voice';

  const showHeader = (type === 'clear_history' || type === 'delete_chat' || type === 'leave_channel') && (chatName || isNotes);

  const getTitle = () => {
    switch (type) {
      case 'clear_history':
        return t('confirmModal.clear_history_title', {
          name: chatName || t('connectModal.notes'),
          defaultValue: `Вы точно хотите удалить все сообщения, сохраненные в ${chatName}?`,
        });
      case 'delete_chat':
        return t('confirmModal.delete_chat_title', {
          name: chatName,
          defaultValue: 'Вы точно хотите удалить чат, а также все сообщения, сохраненные в нем?',
        });
      case 'leave_channel':
        return t('confirmModal.leave_channel_title', {
          name: chatName,
          defaultValue: `Вы точно хотите покинуть канал ${chatName}?`,
        });
      case 'delete_message':
        return t('confirmModal.delete_message_title', {
          defaultValue: 'Удалить это сообщение?',
        });
      case 'pin_message':
        return t('confirmModal.pin_message_title', {
          defaultValue: 'Закрепить это сообщение?',
        });
      case 'unpin_message':
        return t('confirmModal.unpin_message_title', {
          defaultValue: 'Открепить это сообщение?',
        });
      case 'discard_voice':
        return t('confirmModal.discard_voice_title', {
          defaultValue: 'Вы точно хотите прекратить запись и удалить голосовое сообщение?',
        });
      default:
        return '';
    }
  };

  const getConfirmText = () => {
    switch (type) {
      case 'clear_history':
      case 'delete_chat':
      case 'delete_message':
      case 'discard_voice':
        return t('common.delete', { defaultValue: 'Удалить' });
      case 'leave_channel':
        return t('channel.leave_channel', { defaultValue: 'Покинуть канал' });
      case 'pin_message':
        return t('common.pin', { defaultValue: 'Закрепить' });
      case 'unpin_message':
        return t('common.unpin', { defaultValue: 'Открепить' });
      default:
        return '';
    }
  };

  const showSubtitle = type === 'clear_history' || type === 'delete_chat' || type === 'leave_channel';

  const modalContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-[340px] rounded-[8px] p-5 shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {showHeader && (
            <div className="flex items-center gap-3 mb-4">
              {isNotes ? (
                <NotesAvatar className="w-10 h-10 flex-shrink-0" />
              ) : (
                <Avatar
                  src={avatarUrl}
                  alt={chatName}
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
              )}
              <span
                className="font-bold text-[15px] truncate"
                style={{ color: 'var(--text-main, #ffffff)' }}
              >
                {chatName}
              </span>
            </div>
          )}

          <div className="text-left">
            <h3
              className="text-[14px] font-medium leading-snug"
              style={{ color: 'var(--text-main, #ffffff)' }}
            >
              {getTitle()}
            </h3>

            {showSubtitle && (
              <p
                className="text-[13px] mt-4 font-normal"
                style={{ color: 'var(--text-dim, #9ca3af)' }}
              >
                {t('confirmModal.cannot_be_undone', {
                  defaultValue: 'Это действие нельзя будет отменить.',
                })}
              </p>
            )}
          </div>

          <div className="flex justify-end items-center gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--accent-color, #7C3AED)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {t('common.cancel', { defaultValue: 'Отмена' })}
            </button>

            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: 'transparent',
                color: isDestructive ? '#ef4444' : 'var(--accent-color, #7C3AED)',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = isDestructive
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {getConfirmText()}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
