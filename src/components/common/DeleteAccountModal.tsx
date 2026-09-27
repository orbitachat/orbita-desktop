// src/components/common/DeleteAccountModal.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';

interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteAccountModal = ({ isOpen, onClose, onConfirm }: DeleteAccountModalProps) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="w-full max-w-sm rounded-2xl p-6"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="mb-4 flex justify-center" style={{ color: 'var(--md-error, #f2b8b5)' }}>
              <Trash2 size={48} />
            </div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-main)' }}>
              {t('settings.delete_account_confirm_title')}
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-dim)' }}>
              {t('settings.delete_account_confirm_description')}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-full text-sm font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--surface-muted)',
                  color: 'var(--text-main)',
                  border: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-muted)')}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={onConfirm}
                className="px-6 py-2 rounded-full text-sm font-bold transition-colors"
                style={{
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  border: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-light)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-color)')}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};