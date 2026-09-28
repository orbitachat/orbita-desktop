import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface UnsafeLinkModalProps {
  isOpen: boolean;
  url: string;
  onClose: () => void;
}

export const UnsafeLinkModal: React.FC<UnsafeLinkModalProps> = ({
  isOpen,
  url,
  onClose,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="w-full max-w-[360px] rounded-[8px] p-5 shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-left">
            <h3
              className="text-[15px] font-semibold leading-snug"
              style={{ color: 'var(--text-main, #ffffff)' }}
            >
              {t('confirmModal.open_link_title', 'Вы уверены, что хотите открыть эту ссылку в браузере?')}
            </h3>
            <div
              className="text-[13px] mt-3 font-mono break-all p-2.5 rounded border"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                color: 'var(--accent-color, #7C3AED)',
              }}
            >
              {url}
            </div>
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
              {t('common.cancel')}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (window.orbita?.openExternal) {
                  window.orbita.openExternal(url);
                } else {
                  window.open(url, '_blank');
                }
              }}
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
              {t('common.open')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
