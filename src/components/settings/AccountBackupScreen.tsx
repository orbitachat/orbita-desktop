import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Lock,
  Copy,
  Check,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Monitor,
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { generateMnemonic, createAccountBackup } from '../../services/accountBackupService';
import { accountSyncService } from '../../services/accountSyncService';

interface AccountBackupScreenProps {
  onBack?: () => void;
  mode?: 'main' | 'cloud' | 'pc';
  onOpenCloud?: () => void;
  onOpenPc?: () => void;
}

export const AccountBackupScreen: React.FC<AccountBackupScreenProps> = ({
  mode = 'main',
  onOpenCloud,
  onOpenPc,
}) => {
  const { t, i18n } = useTranslation();

  const {
    recoveryKey,
    setRecoveryKey,
    backupEnabled,
    backupFolder,
    lastBackupTime,
    lastSyncTime,
    setBackupConfig,
  } = useAuthStore();

  const masterSeed = useAuthStore((state) => state.masterSeed) || '';
  const configVersion = useAuthStore((state) => state.configVersion) || 0;
  const syncStatus = useAuthStore((state) => state.syncStatus) || 'idle';

  const [isViewingKey, setIsViewingKey] = useState(false);
  const [hasCopiedMaster, setHasCopiedMaster] = useState(false);
  const [hasCopiedRecovery, setHasCopiedRecovery] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isDeletingCloud, setIsDeletingCloud] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isInitialSetup, setIsInitialSetup] = useState(false);

  useEffect(() => {
    accountSyncService.ensureMasterSeed();
  }, []);

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

  const handleCopyMasterKey = async () => {
    const seed = useAuthStore.getState().masterSeed;
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seed);
      setHasCopiedMaster(true);
      setTimeout(() => setHasCopiedMaster(false), 2000);
    } catch {}
  };

  const handleCopyRecoveryKey = async () => {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setHasCopiedRecovery(true);
      setTimeout(() => setHasCopiedRecovery(false), 2000);
    } catch {}
  };

  const handleCloudSync = async () => {
    setIsSyncingCloud(true);
    await accountSyncService.syncNow();
    setIsSyncingCloud(false);
  };

  const handleDeleteCloudBackup = async () => {
    setIsDeletingCloud(true);
    await accountSyncService.deleteCloudConfig();
    setIsDeletingCloud(false);
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
    setIsViewingKey(true);
  };

  const handleKeyModalConfirm = async () => {
    if (isInitialSetup) {
      setIsInitialSetup(false);
      setBackupConfig({ enabled: true });
      await triggerPcBackup();
      setIsViewingKey(false);
    } else {
      setIsViewingKey(false);
    }
  };

  const triggerPcBackup = async () => {
    if (!recoveryKey) return;
    setIsBackingUp(true);

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
    } catch {
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

  if (isViewingKey) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        style={{
          padding: '12px 24px 32px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(155, 125, 212, 0.15)',
            color: 'var(--accent-color, #9b7dd4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '14px',
          }}
        >
          <Lock size={22} />
        </div>

        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 8px', color: '#ffffff' }}>
          {t('backup.your_recovery_key')}
        </h3>

        <p
          style={{
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: 'rgba(255, 255, 255, 0.65)',
            margin: '0 0 18px',
            maxWidth: '360px',
          }}
        >
          {t('backup.key_notice')}
        </p>

        <div
          style={{
            width: '100%',
            maxWidth: '380px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '14px 18px',
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
          onClick={handleCopyRecoveryKey}
          aria-label={t('backup.copy_to_clipboard')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: hasCopiedRecovery ? '#4ade80' : 'var(--accent-color, #9b7dd4)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '8px',
            marginBottom: '24px',
            transition: 'color 0.15s ease',
          }}
        >
          <AnimatePresence mode="wait">
            {hasCopiedRecovery ? (
              <motion.div
                key="check"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <Check size={16} />
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <Copy size={16} />
              </motion.div>
            )}
          </AnimatePresence>
          <span>{hasCopiedRecovery ? t('backup.copied') : t('backup.copy_to_clipboard')}</span>
        </button>

        <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '380px' }}>
          {!isInitialSetup && (
            <button
              type="button"
              onClick={() => setIsViewingKey(false)}
              aria-label={t('common.back', 'Назад')}
              style={{
                flex: 1,
                padding: '9px 16px',
                borderRadius: '18px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: '#ffffff',
                fontSize: '13px',
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
              padding: '9px 16px',
              borderRadius: '18px',
              border: 'none',
              backgroundColor: 'var(--accent-color, #6366f1)',
              color: '#ffffff',
              fontSize: '13px',
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

  if (mode === 'main') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{
          padding: '8px 20px 32px',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'rgba(255, 255, 255, 0.65)',
            margin: 0,
          }}
        >
          {t('backup.main_subtitle')}
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            onClick={onOpenCloud}
            style={{
              backgroundColor: 'var(--md-surface, #2a253b)',
              padding: '16px 18px',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--md-surface-var, #342e47)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--md-surface, #2a253b)')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <RotateCcw size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '3px' }}>
                  {t('backup.cloud_backup_title')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.45 }}>
                  {t('backup.cloud_backup_desc')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '52px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCloud?.();
                }}
                aria-label={configVersion > 0 ? t('backup.manage_btn') : t('backup.setup_btn')}
                style={{
                  padding: '6px 18px',
                  borderRadius: '16px',
                  border: 'none',
                  backgroundColor: 'var(--accent-color, #9b7dd4)',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {configVersion > 0 ? t('backup.manage_btn') : t('backup.setup_btn')}
              </button>
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.65)',
              marginBottom: '12px',
              lineHeight: 1.5,
            }}
          >
            {t('backup.other_methods_title')}
          </div>

          <div
            onClick={onOpenPc}
            style={{
              backgroundColor: 'var(--md-surface, #2a253b)',
              padding: '16px 18px',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--md-surface-var, #342e47)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--md-surface, #2a253b)')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                <Monitor size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '3px' }}>
                  {t('backup.desktop_backup_title')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.45 }}>
                  {t('backup.desktop_backup_subtitle')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: '52px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPc?.();
                }}
                aria-label={backupEnabled ? t('backup.manage_btn') : t('backup.enable_btn')}
                style={{
                  padding: '6px 18px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  backgroundColor: backupEnabled ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = backupEnabled ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.12)')}
              >
                {backupEnabled ? t('backup.manage_btn') : t('backup.enable_btn')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (mode === 'pc') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{
          padding: '8px 24px 32px',
          color: '#ffffff',
        }}
      >
        <p
          style={{
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'rgba(255, 255, 255, 0.65)',
            margin: '0 0 24px',
          }}
        >
          {t('backup.pc_subscreen_desc')}
        </p>

        {!backupEnabled ? (
          <div>
            <button
              type="button"
              onClick={handleEnableBackup}
              aria-label={t('backup.enable_backup')}
              style={{
                padding: '9px 24px',
                borderRadius: '18px',
                border: 'none',
                backgroundColor: 'var(--accent-color, #6366f1)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {t('backup.enable_backup')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>
                {t('backup.last_backup')}
              </div>
              <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '12px' }}>
                {formatBackupDate(lastBackupTime)}
              </div>
              <button
                type="button"
                onClick={triggerPcBackup}
                disabled={isBackingUp}
                aria-label={t('backup.create_backup_btn')}
                style={{
                  padding: '8px 20px',
                  borderRadius: '18px',
                  border: 'none',
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
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
                  if (!isBackingUp) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                }}
              >
                {isBackingUp && <Loader2 size={13} className="spin" />}
                <span>{t('backup.create_backup_btn')}</span>
              </button>
            </div>

            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                {t('backup.backup_folder')}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.75)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  wordBreak: 'break-all',
                  userSelect: 'text',
                  marginBottom: '10px',
                }}
              >
                {backupFolder || '---'}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                {t('backup.recovery_key_row')}
              </div>
              <div style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '10px', lineHeight: 1.45 }}>
                {t('backup.recovery_key_desc')}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsInitialSetup(false);
                  setIsViewingKey(true);
                }}
                aria-label={t('backup.view_key')}
                style={{
                  padding: '6px 16px',
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
                {t('backup.view_key')}
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={handleDisableBackup}
                aria-label={t('backup.disable_btn')}
                style={{
                  padding: '6px 16px',
                  borderRadius: '16px',
                  border: 'none',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  fontSize: '12.5px',
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
        )}

        <div
          style={{
            marginTop: '28px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          {t('backup.pc_subscreen_footer')}
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
        padding: '8px 24px 32px',
        color: '#ffffff',
      }}
    >
      <p
        style={{
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'rgba(255, 255, 255, 0.65)',
          margin: '0 0 20px',
        }}
      >
        {t('backup.cloud_modal_desc')}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          marginBottom: '22px',
          padding: '0 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ color: 'var(--accent-color, #9b7dd4)', marginTop: '2px', flexShrink: 0 }}>
            <Lock size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
              {t('backup.feature_e2ee')}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
              {t('backup.feature_e2ee_desc')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ color: 'var(--accent-color, #9b7dd4)', marginTop: '2px', flexShrink: 0 }}>
            <ShieldCheck size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
              {t('backup.feature_manual')}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
              {t('backup.feature_manual_desc')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ color: 'var(--accent-color, #9b7dd4)', marginTop: '2px', flexShrink: 0 }}>
            <Trash2 size={16} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
              {t('backup.feature_delete')}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
              {t('backup.feature_delete_desc')}
            </div>
          </div>
        </div>
      </div>

      {masterSeed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '20px',
            gap: '10px',
          }}
        >
          <div
            style={{
              fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
              fontSize: '11.5px',
              color: 'rgba(255, 255, 255, 0.85)',
              wordBreak: 'break-all',
              lineHeight: 1.45,
              userSelect: 'all',
              letterSpacing: '0.04em',
              flex: 1,
            }}
          >
            {masterSeed}
          </div>

          <button
            type="button"
            onClick={handleCopyMasterKey}
            aria-label={t('backup.copy_to_clipboard')}
            style={{
              background: 'none',
              border: 'none',
              padding: '6px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: hasCopiedMaster ? '#4ade80' : 'rgba(255, 255, 255, 0.7)',
              flexShrink: 0,
              transition: 'all 0.18s ease',
            }}
          >
            <AnimatePresence mode="wait">
              {hasCopiedMaster ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <Check size={16} />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <Copy size={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      )}

      <div style={{ marginBottom: '22px' }}>
        <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)' }}>
          {configVersion > 0 && lastSyncTime
            ? t('backup.last_backup_created', { date: formatBackupDate(lastSyncTime) })
            : t('backup.never_created')}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          type="button"
          onClick={handleCloudSync}
          disabled={isSyncingCloud || syncStatus === 'syncing'}
          aria-label={configVersion > 0 ? t('backup.update_backup_btn') : t('backup.create_backup_btn')}
          style={{
            width: '100%',
            padding: '10px 18px',
            borderRadius: '18px',
            border: 'none',
            backgroundColor: 'var(--accent-color, #6366f1)',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isSyncingCloud || syncStatus === 'syncing' ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!isSyncingCloud) e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {isSyncingCloud || syncStatus === 'syncing' ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <RotateCcw size={14} />
          )}
          <span>
            {isSyncingCloud || syncStatus === 'syncing'
              ? (configVersion > 0 ? t('backup.updating_backup') : t('backup.zk_syncing'))
              : (configVersion > 0 ? t('backup.update_backup_btn') : t('backup.create_backup_btn'))}
          </span>
        </button>

        {configVersion > 0 && (
          <button
            type="button"
            onClick={handleDeleteCloudBackup}
            disabled={isDeletingCloud}
            aria-label={t('backup.disable_cloud_backup_btn')}
            style={{
              width: '100%',
              padding: '10px 18px',
              borderRadius: '18px',
              border: 'none',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isDeletingCloud ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
          >
            {isDeletingCloud ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
            <span>{t('backup.disable_cloud_backup_btn')}</span>
          </button>
        )}
      </div>
    </motion.div>
  );
};


