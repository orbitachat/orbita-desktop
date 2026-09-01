// src/components/chat/SendAsTxtModal.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, MoreVertical, Smile } from 'lucide-react';

interface SendAsTxtModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (caption: string) => void;
  textLength: number;
}

export const SendAsTxtModal: React.FC<SendAsTxtModalProps> = ({
  isOpen,
  onClose,
  onSend,
  textLength,
}) => {
  const [caption, setCaption] = useState('');

  if (!isOpen) return null;

  // Approximate byte size
  const sizeKb = (textLength * 1.2 / 1024).toFixed(1);

  const handleSend = () => {
    onSend(caption);
    setCaption('');
    onClose();
  };

  return (
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
            initial={{ scale: 0.95, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--bg-secondary, #252836)',
              borderRadius: '8px',
              border: 'none',
              outline: 'none',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              color: 'var(--text-main, #ffffff)',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid color-mix(in srgb, var(--text-main) 8%, transparent)',
              }}
            >
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                Отправить как файл
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {}}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim, #94a3b8)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>

            {/* File item card */}
            <div style={{ padding: '20px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  backgroundColor: 'var(--surface-container)',
                  padding: '12px 16px',
                  borderRadius: '14px',
                }}
              >
                {/* Purple file icon badge */}
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-color, #7C3AED)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0,
                  }}
                >
                  <FileText size={22} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--text-main, #ffffff)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    message.txt
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-dim, #94a3b8)', marginTop: '2px' }}>
                    {sizeKb} KB
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim, #94a3b8)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Caption field */}
              <div style={{ marginTop: '16px', position: 'relative' }}>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Подпись"
                  style={{
                    width: '100%',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '2px solid var(--accent-color, #7C3AED)',
                    padding: '8px 32px 8px 0',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
                <Smile
                  size={18}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim, #94a3b8)',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '12px 20px 20px 20px',
              }}
            >
              <button
                type="button"
                onClick={() => {}}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #7C3AED)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px 12px',
                }}
              >
                Добавить
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #7C3AED)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px 12px',
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSend}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #7C3AED)',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '8px 12px',
                }}
              >
                Отправить
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
