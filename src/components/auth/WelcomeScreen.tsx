import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, HardDrive, KeyRound, UserPlus, Upload, FileCheck, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { generateRandomCode } from '../../lib/codes';
import { isValidMasterSeedHex } from '../../lib/zkAccountCrypto';
import { accountSyncService } from '../../services/accountSyncService';
import { restoreAccountBackup } from '../../services/accountBackupService';

type StepType = 'menu' | 'register' | 'restore_id' | 'restore_backup_file' | 'restore_backup_phrase';

export const WelcomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const setStep = useAuthStore((state) => state.setStep);
  const setNicknameStore = useAuthStore((state) => state.setNickname);
  const currentTheme = useChatStore((state) => state.currentTheme);

  const [activeStep, setActiveStep] = useState<StepType>('menu');
  const [direction, setDirection] = useState<number>(1);

  const [nickname, setNickname] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [phrase, setPhrase] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLight, setIsLight] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ||
             document.documentElement.getAttribute('data-theme-light') === 'true';
    }
    return false;
  });

  useEffect(() => {
    const updateTheme = () => {
      const isLightMode = document.documentElement.getAttribute('data-theme') === 'light' ||
                          document.documentElement.getAttribute('data-theme-light') === 'true';
      setIsLight(isLightMode);
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-light', 'style'],
    });
    return () => observer.disconnect();
  }, [currentTheme]);

  const navigateTo = useCallback((nextStep: StepType) => {
    setErrorMessage(null);
    setDirection(1);
    setActiveStep(nextStep);
  }, []);

  const navigateBack = useCallback((prevStep: StepType) => {
    setErrorMessage(null);
    setDirection(-1);
    setActiveStep(prevStep);
  }, []);

  const handleRegisterSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 2) return;

    setNicknameStore(trimmed);
    const currentCode = useChatStore.getState().myCode;
    if (!currentCode) {
      useChatStore.getState().setMyCode(generateRandomCode());
    }
    accountSyncService.ensureMasterSeed();
    setStep('main');
  };

  const cleanMasterKey = masterKey.trim();

  const handleIdRestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isValidMasterSeedHex(cleanMasterKey)) {
      setErrorMessage(t('welcome.err_invalid_key'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await accountSyncService.restoreAccountFromCloud(cleanMasterKey);
      if (result.restored) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('orbita:sync-now'));
        }
      }
      setStep('main');
    } catch (err: any) {
      if (err?.message === 'INVALID_KEY_OR_CORRUPT') {
        setErrorMessage(t('welcome.err_key_decrypt'));
      } else if (err?.message?.startsWith('SERVER_ERROR')) {
        setErrorMessage(t('welcome.err_server'));
      } else {
        setErrorMessage(t('welcome.err_key_decrypt'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (file: File) => {
    setErrorMessage(null);
    setSelectedFile(file);
    try {
      const buffer = await file.arrayBuffer();
      setFileBytes(new Uint8Array(buffer));
    } catch {
      setErrorMessage(t('welcome.err_corrupted'));
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const parsedWords = phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const handleBackupPhraseRestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fileBytes) {
      setErrorMessage(t('welcome.err_select_file'));
      return;
    }
    if (parsedWords.length !== 12) {
      setErrorMessage(t('welcome.err_invalid_phrase'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await restoreAccountBackup(fileBytes, phrase);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orbita:sync-now'));
      }
      setStep('main');
    } catch (err: any) {
      if (err?.message === 'INVALID_MNEMONIC') {
        setErrorMessage(t('welcome.err_restore_failed'));
      } else {
        setErrorMessage(t('welcome.err_corrupted'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 60 : -60,
      opacity: 0,
    }),
  };

  const logoColor = isLight ? '#5c54e5' : '#BCC0C3';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary, #14111d)',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
        padding: '24px 20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait" custom={direction}>
          {activeStep === 'menu' && (
            <motion.div
              key="menu"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '130px',
                  height: '130px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                }}
              >
                <svg viewBox="0 0 800 800" width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <defs>
                    <clipPath id="welcome-front-clip">
                      <rect x="-600" y="0" width="1200" height="600" />
                    </clipPath>
                    <mask id="welcome-back-ring-mask">
                      <rect x="0" y="0" width="800" height="800" fill="white" />
                      <circle cx="400" cy="400" r="192" fill="black" />
                    </mask>
                    <mask id="welcome-planet-mask">
                      <rect x="0" y="0" width="800" height="800" fill="white" />
                      <g transform="translate(400, 400) rotate(-26)">
                        <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
                      </g>
                    </mask>
                    <mask id="welcome-ring-hole">
                      <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
                      <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
                    </mask>
                  </defs>
                  <g mask="url(#welcome-back-ring-mask)">
                    <g transform="translate(400, 400) rotate(-26)">
                      <ellipse cx="0" cy="0" rx="360" ry="105" fill={logoColor} mask="url(#welcome-ring-hole)" />
                    </g>
                  </g>
                  <circle cx="400" cy="400" r="175" fill={logoColor} mask="url(#welcome-planet-mask)" />
                  <g transform="translate(400, 400) rotate(-26)">
                    <g clipPath="url(#welcome-front-clip)">
                      <ellipse cx="0" cy="0" rx="360" ry="105" fill={logoColor} mask="url(#welcome-ring-hole)" />
                    </g>
                  </g>
                </svg>
              </div>

              <h1
                style={{
                  margin: '0 0 36px 0',
                  fontSize: '38px',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--text-main, #ffffff)',
                  lineHeight: 1.15,
                }}
              >
                {t('welcome.title', 'Orbita')}
              </h1>

              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => navigateTo('register')}
                  aria-label={t('welcome.register', 'Зарегистрироваться')}
                  style={{
                    width: '100%',
                    height: '52px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #5c54e5)',
                    color: '#ffffff',
                    fontSize: '15.5px',
                    fontWeight: 650,
                    letterSpacing: '0.01em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))',
                    transition: 'transform 0.12s ease, opacity 0.12s ease',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.985)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <UserPlus size={18} />
                  <span>{t('welcome.register', 'Зарегистрироваться')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('restore_id')}
                  aria-label={t('welcome.restore_by_id', 'Восстановить по уникальному ID')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.14))',
                    backgroundColor: 'var(--surface-container-soft, transparent)',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background-color 0.15s ease, transform 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))')}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, transparent)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.985)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <KeyRound size={17} />
                  <span>{t('welcome.restore_by_id', 'Восстановить по уникальному ID')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('restore_backup_file')}
                  aria-label={t('welcome.restore_by_backup', 'Восстановить из локального бэкапа')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.14))',
                    backgroundColor: 'var(--surface-container-soft, transparent)',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'background-color 0.15s ease, transform 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))')}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, transparent)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.985)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <HardDrive size={17} />
                  <span>{t('welcome.restore_by_backup', 'Восстановить из локального бэкапа')}</span>
                </button>
              </div>
            </motion.div>
          )}

          {activeStep === 'register' && (
            <motion.div
              key="register"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={() => navigateBack('menu')}
                aria-label={t('welcome.back', 'Назад')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 0',
                  fontSize: '14px',
                  fontWeight: 500,
                  outline: 'none',
                  marginBottom: '20px',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))')}
              >
                <ArrowLeft size={18} />
                <span>{t('welcome.back', 'Назад')}</span>
              </button>

              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                }}
              >
                {t('nickname.title', 'Придумайте никнейм')}
              </h2>
              <p
                style={{
                  margin: '0 0 28px 0',
                  fontSize: '14px',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  lineHeight: 1.4,
                }}
              >
                {t('nickname.placeholder', 'Как тебя называть?')}
              </p>

              <form onSubmit={handleRegisterSubmit} style={{ width: '100%' }}>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={24}
                  autoFocus
                  placeholder={t('nickname.placeholder', 'Как тебя называть?')}
                  aria-label={t('nickname.title', 'Придумайте никнейм')}
                  style={{
                    width: '100%',
                    height: '50px',
                    padding: '0 16px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.14))',
                    backgroundColor: 'var(--surface-container, rgba(0, 0, 0, 0.25))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '16px',
                    fontWeight: 500,
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: '24px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-color, #5c54e5)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.14))')}
                />

                <button
                  type="submit"
                  disabled={nickname.trim().length < 2}
                  aria-label={t('welcome.continue', 'Продолжить')}
                  style={{
                    width: '100%',
                    height: '50px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: nickname.trim().length >= 2 ? 'var(--accent-color, #5c54e5)' : 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))',
                    color: nickname.trim().length >= 2 ? '#ffffff' : 'var(--text-dim, rgba(255, 255, 255, 0.35))',
                    fontSize: '15.5px',
                    fontWeight: 650,
                    cursor: nickname.trim().length >= 2 ? 'pointer' : 'not-allowed',
                    outline: 'none',
                    boxShadow: nickname.trim().length >= 2 ? '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {t('welcome.continue', 'Продолжить')}
                </button>
              </form>
            </motion.div>
          )}

          {activeStep === 'restore_id' && (
            <motion.div
              key="restore_id"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={() => navigateBack('menu')}
                aria-label={t('welcome.back', 'Назад')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 0',
                  fontSize: '14px',
                  fontWeight: 500,
                  outline: 'none',
                  marginBottom: '20px',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))')}
              >
                <ArrowLeft size={18} />
                <span>{t('welcome.back', 'Назад')}</span>
              </button>

              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                }}
              >
                {t('welcome.unique_id_title', 'Восстановление по ID')}
              </h2>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '13.5px',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  lineHeight: 1.4,
                }}
              >
                {t('welcome.unique_id_desc', 'Введите ваш уникальный 64-значный ID / мастер-ключ аккаунта')}
              </p>

              <form onSubmit={handleIdRestore} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-main, rgba(255, 255, 255, 0.85))',
                    }}
                  >
                    {t('welcome.master_key_label', 'Мастер-ключ аккаунта (64 HEX символа)')}
                  </label>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: cleanMasterKey.length === 64 ? 'var(--accent-color, #5c54e5)' : 'var(--text-dim, rgba(255, 255, 255, 0.45))',
                    }}
                  >
                    {cleanMasterKey.length} / 64
                  </span>
                </div>

                <textarea
                  value={masterKey}
                  onChange={(e) => {
                    setErrorMessage(null);
                    setMasterKey(e.target.value);
                  }}
                  autoFocus
                  placeholder={t('welcome.master_key_placeholder', 'Вставьте 64-значный шестнадцатеричный ключ...')}
                  rows={3}
                  aria-label={t('welcome.master_key_label', 'Мастер-ключ аккаунта')}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.14))',
                    backgroundColor: 'var(--surface-container, rgba(0, 0, 0, 0.25))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    wordBreak: 'break-all',
                    marginBottom: errorMessage ? '10px' : '20px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-color, #5c54e5)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.14))')}
                />

                {errorMessage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#ef4444',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      marginBottom: '20px',
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || cleanMasterKey.length !== 64}
                  aria-label={t('welcome.restore_button', 'Восстановить аккаунт')}
                  style={{
                    width: '100%',
                    height: '50px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: cleanMasterKey.length === 64 && !isLoading ? 'var(--accent-color, #5c54e5)' : 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))',
                    color: cleanMasterKey.length === 64 && !isLoading ? '#ffffff' : 'var(--text-dim, rgba(255, 255, 255, 0.35))',
                    fontSize: '15.5px',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: cleanMasterKey.length === 64 && !isLoading ? 'pointer' : 'not-allowed',
                    outline: 'none',
                    boxShadow: cleanMasterKey.length === 64 && !isLoading ? '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{t('welcome.restoring', 'Восстановление...')}</span>
                    </>
                  ) : (
                    <span>{t('welcome.restore_button', 'Восстановить аккаунт')}</span>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {activeStep === 'restore_backup_file' && (
            <motion.div
              key="restore_backup_file"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={() => navigateBack('menu')}
                aria-label={t('welcome.back', 'Назад')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 0',
                  fontSize: '14px',
                  fontWeight: 500,
                  outline: 'none',
                  marginBottom: '20px',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))')}
              >
                <ArrowLeft size={18} />
                <span>{t('welcome.back', 'Назад')}</span>
              </button>

              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                }}
              >
                {t('welcome.backup_file_title', 'Файл резервной копии')}
              </h2>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '13.5px',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  lineHeight: 1.4,
                }}
              >
                {t('welcome.backup_file_desc', 'Прикрепите локальный файл бэкапа с расширением .orbita')}
              </p>

              <input
                type="file"
                ref={fileInputRef}
                accept=".orbita"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                style={{
                  width: '100%',
                  padding: '28px 16px',
                  borderRadius: '16px',
                  border: `2px dashed ${isDragOver ? 'var(--accent-color, #5c54e5)' : selectedFile ? 'var(--accent-color, #5c54e5)' : 'var(--border-color, rgba(255, 255, 255, 0.16))'}`,
                  backgroundColor: isDragOver
                    ? 'rgba(92, 84, 229, 0.08)'
                    : selectedFile
                    ? 'var(--surface-container-soft, rgba(255, 255, 255, 0.04))'
                    : 'var(--surface-container, rgba(0, 0, 0, 0.2))',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                  marginBottom: errorMessage ? '10px' : '24px',
                  transition: 'all 0.15s ease',
                }}
              >
                {selectedFile ? (
                  <>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--accent-color, #5c54e5)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <FileCheck size={24} />
                    </div>
                    <span
                      style={{
                        fontSize: '14.5px',
                        fontWeight: 650,
                        color: 'var(--text-main, #ffffff)',
                        maxWidth: '280px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedFile.name}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-dim, rgba(255, 255, 255, 0.5))',
                        marginTop: '4px',
                      }}
                    >
                      {formatFileSize(selectedFile.size)} • {t('welcome.change_file', 'Изменить')}
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))',
                        color: 'var(--accent-color, #5c54e5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <Upload size={22} />
                    </div>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-main, #ffffff)',
                        marginBottom: '4px',
                      }}
                    >
                      {t('welcome.select_file', 'Выбрать файл .orbita')}
                    </span>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-dim, rgba(255, 255, 255, 0.5))',
                      }}
                    >
                      {t('welcome.drop_file_here', 'Перетащите файл сюда или нажмите')}
                    </span>
                  </>
                )}
              </div>

              {errorMessage && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    marginBottom: '20px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{errorMessage}</span>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedFile || !fileBytes}
                onClick={() => navigateTo('restore_backup_phrase')}
                aria-label={t('welcome.continue', 'Продолжить')}
                style={{
                  width: '100%',
                  height: '50px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: selectedFile && fileBytes ? 'var(--accent-color, #5c54e5)' : 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))',
                  color: selectedFile && fileBytes ? '#ffffff' : 'var(--text-dim, rgba(255, 255, 255, 0.35))',
                  fontSize: '15.5px',
                  fontWeight: 650,
                  cursor: selectedFile && fileBytes ? 'pointer' : 'not-allowed',
                  outline: 'none',
                  boxShadow: selectedFile && fileBytes ? '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {t('welcome.continue', 'Продолжить')}
              </button>
            </motion.div>
          )}

          {activeStep === 'restore_backup_phrase' && (
            <motion.div
              key="restore_backup_phrase"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <button
                type="button"
                onClick={() => navigateBack('restore_backup_file')}
                aria-label={t('welcome.back', 'Назад')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 0',
                  fontSize: '14px',
                  fontWeight: 500,
                  outline: 'none',
                  marginBottom: '20px',
                  transition: 'color 0.12s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))')}
              >
                <ArrowLeft size={18} />
                <span>{t('welcome.back', 'Назад')}</span>
              </button>

              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                }}
              >
                {t('welcome.backup_phrase_title', 'Секретная фраза')}
              </h2>
              <p
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '13.5px',
                  color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
                  lineHeight: 1.4,
                }}
              >
                {t('welcome.backup_phrase_desc', 'Введите 12 слов для расшифровки локального бэкапа')}
              </p>

              <form onSubmit={handleBackupPhraseRestore} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-main, rgba(255, 255, 255, 0.85))',
                    }}
                  >
                    {t('welcome.phrase_label', 'Секретная фраза (12 слов)')}
                  </label>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: parsedWords.length === 12 ? 'var(--accent-color, #5c54e5)' : 'var(--text-dim, rgba(255, 255, 255, 0.45))',
                    }}
                  >
                    {parsedWords.length} / 12
                  </span>
                </div>

                <textarea
                  value={phrase}
                  onChange={(e) => {
                    setErrorMessage(null);
                    setPhrase(e.target.value);
                  }}
                  autoFocus
                  placeholder={t('welcome.phrase_placeholder', 'Введите или вставьте 12 английских слов через пробел...')}
                  rows={4}
                  aria-label={t('welcome.phrase_label', 'Секретная фраза')}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.14))',
                    backgroundColor: 'var(--surface-container, rgba(0, 0, 0, 0.25))',
                    color: 'var(--text-main, #ffffff)',
                    fontSize: '13.5px',
                    lineHeight: 1.5,
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                    marginBottom: errorMessage ? '10px' : '20px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-color, #5c54e5)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.14))')}
                />

                {errorMessage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      color: '#ef4444',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      marginBottom: '20px',
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || parsedWords.length !== 12}
                  aria-label={t('welcome.restore_button', 'Восстановить аккаунт')}
                  style={{
                    width: '100%',
                    height: '50px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: parsedWords.length === 12 && !isLoading ? 'var(--accent-color, #5c54e5)' : 'var(--surface-container-strong, rgba(255, 255, 255, 0.08))',
                    color: parsedWords.length === 12 && !isLoading ? '#ffffff' : 'var(--text-dim, rgba(255, 255, 255, 0.35))',
                    fontSize: '15.5px',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: parsedWords.length === 12 && !isLoading ? 'pointer' : 'not-allowed',
                    outline: 'none',
                    boxShadow: parsedWords.length === 12 && !isLoading ? '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>{t('welcome.restoring', 'Восстановление...')}</span>
                    </>
                  ) : (
                    <span>{t('welcome.restore_button', 'Восстановить аккаунт')}</span>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};