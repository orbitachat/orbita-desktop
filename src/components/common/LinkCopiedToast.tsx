import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const LinkCopiedToast: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              backgroundColor: 'var(--md-surface, var(--surface-container, #242424))',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: '#ffffff',
              padding: '2px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.55)',
              fontSize: '13.5px',
              fontWeight: 500,
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                color: 'var(--accent-color, #9b7dd4)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Link size={26} strokeWidth={2.2} style={{ color: 'var(--accent-color, #9b7dd4)', flexShrink: 0 }} />
            </div>
            <span>{t('common.link_copied')}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
