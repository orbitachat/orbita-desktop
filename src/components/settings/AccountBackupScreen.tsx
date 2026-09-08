import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Copy, Check, RefreshCw, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { generateMnemonic, createAccountBackup } from '../../services/accountBackupService';

interface AccountBackupScreenProps {
  onBack?: () => void;
}

export const AccountBackupScreen: React.FC<AccountBackupScreenProps> = () => {
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
    initMnemonic();
  }, []);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--md-on-surface-var, #9f96b3)',
            letterSpacing: '0.05em',
            padding: '0 20px',
            marginBottom: 8,
          }}
        >
          {t('backup.group_title')}
        </div>
        <div
          style={{
            backgroundColor: 'var(--md-surface, #2a253b)',
            borderRadius: 0,
            padding: '20px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: 'rgba(155, 125, 212, 0.16)',
                color: 'var(--accent-color, #9b7dd4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--md-on-surface, #ffffff)' }}>
                {t('backup.title')}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--md-on-surface-var, #9f96b3)', marginTop: 2 }}>
                {t('backup.subtitle')}
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '10px',
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
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--md-on-surface-var, #9f96b3)',
            letterSpacing: '0.05em',
            padding: '0 20px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{t('welcome.phrase_label')}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={initMnemonic}
              disabled={isGenerating || isSaving}
              aria-label={t('backup.regenerate')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-color, #9b7dd4)',
                cursor: isGenerating || isSaving ? 'default' : 'pointer',
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: isGenerating || isSaving ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} className={isGenerating ? 'spin' : ''} />
              <span>{t('backup.regenerate')}</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!mnemonic || isSaving}
              aria-label={t('backup.copy_words')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: hasCopied ? '#22c55e' : '#ffffff',
                cursor: !mnemonic || isSaving ? 'default' : 'pointer',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {hasCopied ? <Check size={13} /> : <Copy size={13} />}
              <span>{hasCopied ? t('backup.copied') : t('backup.copy_words')}</span>
            </button>
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--md-surface, #2a253b)',
            borderRadius: 0,
            padding: '16px 20px',
            margin: 0,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
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
                <span style={{ fontWeight: 600, fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace' }}>
                  {word}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            backgroundColor: 'var(--md-surface, #2a253b)',
            borderRadius: 0,
            padding: '20px',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {isSuccess ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(34, 197, 94, 0.16)',
                  color: '#22c55e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={28} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
                  {t('backup.success_created')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.65)' }}>
                  {t('backup.notice_1')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  setIsConfirmed(false);
                }}
                aria-label={t('backup.create_another')}
                style={{
                  marginTop: '4px',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('backup.create_another')}
              </button>
            </div>
          ) : (
            <>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.9)',
                  userSelect: 'none',
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
                    borderRadius: '8px',
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
                  height: '44px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor:
                    isConfirmed && !isSaving && mnemonic
                      ? 'var(--accent-color, #9b7dd4)'
                      : 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: '14.5px',
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
                    <Loader2 size={18} className="spin" />
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
      </div>
    </motion.div>
  );
};
