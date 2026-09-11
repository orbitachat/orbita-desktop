import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface DiscordFileLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxMb?: number;
}

export const DiscordFileLimitModal: React.FC<DiscordFileLimitModalProps> = ({
  isOpen,
  onClose,
  maxMb = 10,
}) => {
  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            border: 'none',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--bg-secondary, #252836)',
              borderRadius: '8px',
              border: 'none',
              outline: 'none',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
              padding: '28px 24px 24px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              color: 'var(--text-main, #ffffff)',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* Graphic / Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 15%, transparent)',
                color: 'var(--accent-color, #7C3AED)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="12" x2="12" y2="16" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>

            {/* Title */}
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: 'var(--text-main, #ffffff)',
                margin: '0 0 8px 0',
                lineHeight: 1.3,
              }}
            >
              Медиа в сообщении превышают {maxMb} мб
            </h3>

            {/* Description */}
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-dim, #94a3b8)',
                margin: '0 0 24px 0',
                lineHeight: 1.5,
              }}
            >
              Максимальный суммарный размер файлов и медиа в одном сообщении составляет {maxMb} МБ. Пожалуйста, выберите файл меньшего размера.
            </p>

            {/* Action Button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                padding: '11px 20px',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                border: 'none',
                outline: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease, transform 0.1s ease',
                boxShadow: '0 2px 8px color-mix(in srgb, var(--accent-color, #7C3AED) 40%, transparent)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Понятно
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
