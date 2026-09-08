import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, Copy, Check, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { generateMnemonic, createAccountBackup } from '../../services/accountBackupService';

interface AccountBackupScreenProps {
  onBack?: () => void;
}

export const AccountBackupScreen: React.FC<AccountBackupScreenProps> = () => {
  const { t, i18n } = useTranslation();

  const {
    recoveryKey,
    setRecoveryKey,
    backupEnabled,
    backupFolder,
    lastBackupTime,
    setBackupConfig,
  } = useAuthStore();

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!recoveryKey) {
      generateMnemonic()
        .then((phrase) => {
          setRecoveryKey(phrase);
        })
        .catch(() => {});
    }
  }, [recoveryKey, setRecoveryKey]);

  const words = (recoveryKey || '').split(' ').filter(Boolean);

  const handleCopyKey = async () => {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
    } catch {}
  };

  const handleEnableBackup = async () => {
    let chosenFolder: string | null = null;
    if (typeof window !== 'undefined' && (window as any).orbita?.selectDirectory) {
      chosenFolder = await (window as any).orbita.selectDirectory();
    } else {
      chosenFolder = 'C:\\OrbitaBackups';
    }

    if (!chosenFolder) return;

    setBackupConfig({ folder: chosenFolder });
    setIsInitialSetup(true);
    setIsKeyModalOpen(true);
  };

  const handleKeyModalConfirm = async () => {
    setIsKeyModalOpen(false);
    if (isInitialSetup) {
      setIsInitialSetup(false);
      setBackupConfig({ enabled: true });
      await triggerBackup();
    }
  };

  const triggerBackup = async () => {
    if (!recoveryKey) return;
    setIsBackingUp(true);
    setFeedbackMessage(null);

    try {
      const backupBytes = await createAccountBackup(recoveryKey);
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const fileName = `orbita_backup_${dateStr}.orbita`;

      if (backupFolder && typeof window !== 'undefined' && (window as any).orbita?.saveBackupFile) {
        const res = await (window as any).orbita.saveBackupFile(backupFolder, fileName, backupBytes);
        if (!res.success) {
          throw new Error(res.error || 'Write error');
        }
      } else if (typeof window !== 'undefined' && (window as any).orbita?.saveFileAs) {
        await (window as any).orbita.saveFileAs(
          backupBytes,
          fileName,
          [{ name: 'Orbita Backup', extensions: ['orbita'] }]
        );
      } else {
        const blob = new Blob([backupBytes as unknown as BlobPart], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setBackupConfig({ lastBackupTime: Date.now() });
      setFeedbackMessage(t('backup.backup_created_success'));
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch {
      setFeedbackMessage(t('backup.err_generate'));
      setTimeout(() => setFeedbackMessage(null), 4000);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleShowInFolder = () => {
    if (!backupFolder) return;
    if (typeof window !== 'undefined' && (window as any).orbita?.openFolder) {
      (window as any).orbita.openFolder(backupFolder);
    }
  };

  const handleChangeFolder = async () => {
    if (typeof window !== 'undefined' && (window as any).orbita?.selectDirectory) {
      const folder = await (window as any).orbita.selectDirectory();
      if (folder) {
        setBackupConfig({ folder });
      }
    }
  };

  const handleDisableBackup = () => {
    setBackupConfig({ enabled: false });
  };

  const formatBackupDate = (timestamp: number | null) => {
    if (!timestamp) return t('backup.never');
    try {
      const date = new Date(timestamp);
      const isRu = i18n.language?.startsWith('ru');
      return date.toLocaleString(isRu ? 'ru-RU' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return t('backup.never');
    }
  };

  if (isKeyModalOpen) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        style={{
          padding: '16px 20px 32px',
          color: '#ffffff',
          fontFamily: 'inherit',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: 'rgba(155, 125, 212, 0.2)',
            color: 'var(--accent-color, #9b7dd4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
          }}
        >
          <Lock size={22} />
        </div>

        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 10px', color: '#ffffff' }}>
          {t('backup.your_recovery_key')}
        </h3>

        <p
          style={{
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: 'rgba(255, 255, 255, 0.7)',
            margin: '0 0 18px',
            maxWidth: '340px',
          }}
        >
          {t('backup.key_notice')}
        </p>

        <div
          style={{
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px 14px',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        >
          {words.map((word, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: '#1a1a1a',
                fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                fontWeight: 650,
              }}
            >
              <span style={{ fontSize: '11px', color: '#888888', minWidth: '18px' }}>
                {idx + 1}.
              </span>
              <span>{word}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCopyKey}
          aria-label={t('backup.copy_to_clipboard')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: hasCopied ? '#22c55e' : 'var(--accent-color, #9b7dd4)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '8px',
            marginBottom: '20px',
            transition: 'color 0.15s ease',
          }}
        >
          {hasCopied ? <Check size={16} /> : <Copy size={16} />}
          <span>{hasCopied ? t('backup.copied') : t('backup.copy_to_clipboard')}</span>
        </button>

        <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
          {!isInitialSetup && (
            <button
              type="button"
              onClick={() => setIsKeyModalOpen(false)}
              aria-label={t('common.back', 'Назад')}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
            >
              {t('common.back', 'Назад')}
            </button>
          )}

          <button
            type="button"
            onClick={handleKeyModalConfirm}
            aria-label={t('backup.continue')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: 'var(--accent-color, #6366f1)',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            {t('backup.continue')}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{
        padding: '16px 24px 36px',
        color: '#ffffff',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px', color: '#ffffff' }}>
          {t('backup.desktop_backup_title')}
        </h2>
        <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.55)', margin: 0, lineHeight: 1.45 }}>
          {t('backup.desktop_backup_subtitle')}
        </p>
      </div>

      {feedbackMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '10px 16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(155, 125, 212, 0.15)',
            border: '1px solid rgba(155, 125, 212, 0.3)',
            color: '#ffffff',
            fontSize: '13px',
            textAlign: 'center',
          }}
        >
          {feedbackMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
        {!backupEnabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                {t('backup.desktop_backup_title')}
              </div>
              <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px', lineHeight: 1.45 }}>
                {t('backup.enable_backup_desc')}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleEnableBackup}
                aria-label={t('backup.enable_backup')}
                style={{
                  padding: '7px 22px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.16)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
              >
                {t('backup.enable_backup')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                  {t('backup.last_backup')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                  {formatBackupDate(lastBackupTime)}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={triggerBackup}
                  disabled={isBackingUp}
                  aria-label={t('backup.create_backup_btn')}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isBackingUp ? 'default' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: isBackingUp ? 0.6 : 1,
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isBackingUp) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.16)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                >
                  {isBackingUp && <Loader2 size={14} className="spin" />}
                  <span>{t('backup.create_backup_btn')}</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                {t('backup.backup_folder')}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.7)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  wordBreak: 'break-all',
                  userSelect: 'text',
                  lineHeight: 1.45,
                }}
              >
                {backupFolder || '---'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                <button
                  type="button"
                  onClick={handleShowInFolder}
                  aria-label={t('backup.show_in_folder')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '16px',
                    border: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.16)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
                >
                  {t('backup.show_in_folder')}
                </button>

                <button
                  type="button"
                  onClick={handleChangeFolder}
                  aria-label={t('backup.change_folder')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '16px',
                    border: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: 'rgba(255, 255, 255, 0.85)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                >
                  {t('backup.change_folder')}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                  {t('backup.recovery_key_row')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px', lineHeight: 1.45 }}>
                  {t('backup.recovery_key_desc')}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsInitialSetup(false);
                    setIsKeyModalOpen(true);
                  }}
                  aria-label={t('backup.view_key')}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.16)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
                >
                  {t('backup.view_key')}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                {t('backup.disable_backup')}
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleDisableBackup}
                  aria-label={t('backup.disable_btn')}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
                >
                  {t('backup.disable_btn')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div
        style={{
          marginTop: '36px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '12.5px',
          lineHeight: 1.5,
          color: 'rgba(255, 255, 255, 0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <p style={{ margin: 0 }}>
          {t('backup.restore_instruction')}
        </p>
        <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.7)' }}>
          {t('backup.local_storage_notice')}
        </p>
      </div>
    </motion.div>
  );
};
