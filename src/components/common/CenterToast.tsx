import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { OrbitaBadgeIcon } from '../ui/DeveloperBadge';

export const CenterToast: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useToastStore((s) => s.isOpen);
  const message = useToastStore((s) => s.message);
  const type = useToastStore((s) => s.type);
  const devNickname = useToastStore((s) => s.devNickname);
  const toastId = useToastStore((s) => s.toastId);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div
          key={toastId}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 999999,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 10%, var(--bg-primary, #0D0B14))',
              color: 'var(--text-main, #ffffff)',
              padding: '8px 18px',
              borderRadius: '7px',
              border: 'none',
              outline: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
              fontSize: '13.5px',
              fontWeight: 500,
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              maxWidth: '90vw',
            }}
          >
            {type === 'developer' && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  color: 'var(--accent-color, #c85f95)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <OrbitaBadgeIcon size={36} color="var(--accent-color, #c85f95)" />
              </div>
            )}
            {type === 'image' && (
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-color, #7C3AED)',
                  color: '#ffffff',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={14} strokeWidth={2.5} />
              </div>
            )}
            <span>
              {type === 'developer'
                ? t('common.dev_toast', { nickname: devNickname || 'Пользователь' })
                : message}
            </span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
