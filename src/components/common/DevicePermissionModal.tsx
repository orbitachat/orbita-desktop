import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useDevicePermissionStore } from '../../store/useDevicePermissionStore';

export const DevicePermissionModal: React.FC = () => {
  const { t } = useTranslation();
  const isModalOpen = useDevicePermissionStore((s) => s.isModalOpen);
  const permissionType = useDevicePermissionStore((s) => s.permissionType);
  const confirmPermission = useDevicePermissionStore((s) => s.confirmPermission);
  const denyPermission = useDevicePermissionStore((s) => s.denyPermission);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return;
      if (e.key === 'Escape') {
        denyPermission();
      } else if (e.key === 'Enter') {
        confirmPermission();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, confirmPermission, denyPermission]);

  if (!isModalOpen || !permissionType) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[600] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
        }}
        onClick={denyPermission}
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
          <div className="text-left">
            <h3
              className="text-[14px] font-medium leading-snug"
              style={{ color: 'var(--text-main, #ffffff)' }}
            >
              {permissionType === 'camera'
                ? t('permission.camera_title')
                : t('permission.microphone_title')}
            </h3>
          </div>

          <div className="flex justify-end items-center gap-2 mt-6">
            <button
              type="button"
              onClick={denyPermission}
              aria-label={t('common.cancel')}
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
              onClick={confirmPermission}
              aria-label={t('permission.allow')}
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
              {t('permission.allow')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
