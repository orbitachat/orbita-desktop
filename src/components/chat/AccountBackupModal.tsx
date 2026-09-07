import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, ShieldCheck, Copy, Check, RefreshCw, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { generateMnemonic, createAccountBackup } from '../../services/accountBackupService';

interface AccountBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AccountBackupModal: React.FC<AccountBackupModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  const [mnemonic, setMnemonic] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [hasCopied, setHasCopied] = useState<boolean>(false);
  const [isConfirmed, setIsConfirmed] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initMnemonic = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setHasCopied(false);
    setIsConfirmed(false);
    setIsSuccess(false);
    try {
      const phrase = await generateMnemonic();
      setMnemonic(phrase);
    } catch {
      setErrorMessage(t('backup.err_generate'));
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      initMnemonic();
    }
  }, [isOpen]);

  const words = mnemonic.split(' ').filter(Boolean);

  const handleCopy = async () => {
    if (!mnemonic) return;
    try {
      await navigator.clipboard.writeText(mnemonic);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
    } catch {}
  };

  const handleSaveBackup = async () => {
    if (!mnemonic || !isConfirmed) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const backupBytes = await createAccountBackup(mnemonic);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `orbita_backup_${dateStr}.orbita`;

      if (typeof window !== 'undefined' && (window as any).orbita?.saveFileAs) {
        await (window as any).orbita.saveFileAs(
          backupBytes,
          fileName,
          [{ name: 'Orbita Backup', extensions: ['orbita'] }]
        );
      } else {
        const blob = new Blob([backupBytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setIsSuccess(true);
    } catch {
      setErrorMessage(t('backup.err_generate'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          padding: '16px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isSaving) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: '100%',
            maxWidth: '540px',
            backgroundColor: 'var(--bg-secondary, #1e1a2b)',
            borderRadius: '16px',
            border: 'none',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(155, 125, 212, 0.16)',
                  color: 'var(--accent-color, #9b7dd4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '17px',
                    fontWeight: 700,
                    color: '#ffffff',
                  }}
                >
                  {t('backup.title')}
                </h3>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12.5px',
                    color: 'rgba(255, 255, 255, 0.55)',
                  }}
                >
                  {t('backup.subtitle')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label={t('common.close')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {isSuccess ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '24px 12px',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(34, 197, 94, 0.16)',
                    color: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={32} />
                </div>
                <div>
                  <h4
                    style={{
                      margin: '0 0 6px',
                      fontSize: '17px',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {t('backup.success_created')}
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.65)',
                      maxWidth: '380px',
                    }}
                  >
                    {t('backup.notice_1')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.done', 'Готово')}
                  style={{
                    marginTop: '8px',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #9b7dd4)',
                    color: '#ffffff',
                    fontSize: '14.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  {t('common.done', 'Готово')}
                </button>
              </div>
            ) : (
              <>
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertTriangle size={18} style={{ color: 'var(--accent-color, #9b7dd4)', flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12.5px', lineHeight: 1.45, color: 'rgba(255, 255, 255, 0.85)' }}>
                    <div style={{ fontWeight: 650, marginBottom: '2px', color: '#ffffff' }}>{t('backup.notice_1')}</div>
                    <div style={{ opacity: 0.75 }}>{t('backup.notice_2')}</div>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)' }}>
                      {t('welcome.phrase_label')}
                    </span>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={initMnemonic}
                        disabled={isGenerating}
                        aria-label={t('backup.regenerate')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'rgba(255, 255, 255, 0.6)',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <RefreshCw size={13} className={isGenerating ? 'animate-spin' : ''} />
                        <span>{t('backup.regenerate')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!mnemonic}
                        aria-label={t('backup.copy_words')}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: hasCopied ? '#22c55e' : '#ffffff',
                          cursor: 'pointer',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {hasCopied ? <Check size={13} /> : <Copy size={13} />}
                        <span>{hasCopied ? t('backup.copied') : t('backup.copy_words')}</span>
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      padding: '12px',
                      backgroundColor: 'rgba(0, 0, 0, 0.24)',
                      borderRadius: '12px',
                    }}
                  >
                    {words.map((word, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 10px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          color: '#ffffff',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontWeight: 600,
                            minWidth: '16px',
                          }}
                        >
                          {idx + 1}.
                        </span>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{word}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.9)',
                    userSelect: 'none',
                    padding: '2px 0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isConfirmed}
                    onChange={(e) => setIsConfirmed(e.target.checked)}
                    aria-label={t('backup.checkbox_confirm')}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: 'var(--accent-color, #9b7dd4)',
                      cursor: 'pointer',
                    }}
                  />
                  <span>{t('backup.checkbox_confirm')}</span>
                </label>

                {errorMessage && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      fontSize: '13px',
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveBackup}
                  disabled={!isConfirmed || isSaving || !mnemonic}
                  aria-label={t('backup.download_file')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor:
                      isConfirmed && !isSaving && mnemonic
                        ? 'var(--accent-color, #9b7dd4)'
                        : 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 650,
                    cursor: isConfirmed && !isSaving && mnemonic ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                  }}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{t('backup.creating')}</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>{t('backup.download_file')}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
