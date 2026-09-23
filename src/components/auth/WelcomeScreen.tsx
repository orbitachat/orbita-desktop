import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, FileCheck, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { generateRandomCode } from '../../lib/codes';
import { isValidMasterSeedHex } from '../../lib/zkAccountCrypto';
import { accountSyncService } from '../../services/accountSyncService';
import { restoreAccountBackup } from '../../services/accountBackupService';
import packageJson from '../../../package.json';

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
  const [hasInputError, setHasInputError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    isFirstMountRef.current = false;
  }, []);

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
    setHasInputError(false);
    setDirection(1);
    setActiveStep(nextStep);
  }, []);

  const navigateBack = useCallback((prevStep: StepType) => {
    setErrorMessage(null);
    setHasInputError(false);
    setDirection(-1);
    setActiveStep(prevStep);
  }, []);

  const handleRegisterSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length < 1) {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_nickname_format', 'Некорректный формат никнейма. Попробуйте ещё раз.'));
      return;
    }

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
    if (!cleanMasterKey || cleanMasterKey.length !== 64 || !isValidMasterSeedHex(cleanMasterKey)) {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_id_format', 'Некорректный ID. Попробуйте ещё раз.'));
      return;
    }

    setIsLoading(true);
    setHasInputError(false);
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
      setHasInputError(true);
      if (err?.message === 'INVALID_KEY_OR_CORRUPT') {
        setErrorMessage(t('welcome.err_key_decrypt', 'Не удалось восстановить аккаунт. Проверьте ID'));
      } else if (err?.message?.startsWith('SERVER_ERROR')) {
        setErrorMessage(t('welcome.err_server', 'Ошибка сервера'));
      } else {
        setErrorMessage(t('welcome.err_key_decrypt', 'Не удалось восстановить аккаунт. Проверьте ID'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (file: File) => {
    setErrorMessage(null);
    setHasInputError(false);
    setSelectedFile(file);
    try {
      const buffer = await file.arrayBuffer();
      setFileBytes(new Uint8Array(buffer));
    } catch {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_corrupted', 'Файл повреждён или не является бэкапом Orbita'));
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleBackupFileContinue = () => {
    if (!selectedFile || !fileBytes) {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_file_format', 'Выберите файл резервной копии. Попробуйте ещё раз.'));
      return;
    }
    navigateTo('restore_backup_phrase');
  };

  const parsedWords = phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const handleBackupPhraseRestore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fileBytes) {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_file_format', 'Выберите файл резервной копии. Попробуйте ещё раз.'));
      return;
    }
    if (parsedWords.length !== 12) {
      setHasInputError(true);
      setErrorMessage(t('welcome.err_phrase_format', 'Некорректная фраза восстановления. Попробуйте ещё раз.'));
      return;
    }

    setIsLoading(true);
    setHasInputError(false);
    setErrorMessage(null);

    try {
      await restoreAccountBackup(fileBytes, phrase);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orbita:sync-now'));
      }
      setStep('main');
    } catch (err: any) {
      setHasInputError(true);
      if (err?.message === 'INVALID_MNEMONIC') {
        setErrorMessage(t('welcome.err_restore_failed', 'Неверная фраза из 12 слов или повреждённый файл резервной копии'));
      } else {
        setErrorMessage(t('welcome.err_corrupted', 'Файл повреждён или не является бэкапом Orbita'));
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
      x: dir > 0 ? 32 : -32,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 32 : -32,
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
      {activeStep !== 'menu' && (
        <button
          type="button"
          onClick={() => {
            if (activeStep === 'restore_backup_phrase') {
              navigateBack('restore_backup_file');
            } else {
              navigateBack('menu');
            }
          }}
          aria-label={t('welcome.back', 'Назад')}
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            background: 'none',
            border: 'none',
            color: 'var(--text-dim, rgba(255, 255, 255, 0.6))',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            borderRadius: '50%',
            outline: 'none',
            zIndex: 50,
            transition: 'color 0.15s ease, background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-main, #ffffff)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-dim, rgba(255, 255, 255, 0.6))';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <ArrowLeft size={24} />
        </button>
      )}

      <div
        style={{
          width: '100%',
          maxWidth: '330px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          {activeStep === 'menu' && (
            <motion.div
              key="menu"
              custom={direction}
              variants={slideVariants}
              initial={isFirstMountRef.current ? false : 'enter'}
              animate="center"
              exit="exit"
              transition={{ duration: 0.1, ease: 'easeOut' }}
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
                  width: '160px',
                  height: '160px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
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
                  margin: '0 0 30px 0',
                  fontSize: '32px',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: 'var(--text-main, #ffffff)',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                }}
              >
                {t('welcome.title', 'Orbita Desktop')}
              </h1>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => navigateTo('register')}
                  aria-label={t('welcome.register', 'Зарегистрироваться')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color, #5c54e5)',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    cursor: 'pointer',
                    padding: '0',
                    outline: 'none',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {t('welcome.register', 'Зарегистрироваться')}
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('restore_id')}
                  aria-label={t('welcome.restore_by_id', 'Восстановить по уникальному ID')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color, #5c54e5)',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    cursor: 'pointer',
                    padding: '0',
                    outline: 'none',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {t('welcome.restore_by_id', 'Восстановить по уникальному ID')}
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('restore_backup_file')}
                  aria-label={t('welcome.restore_by_backup', 'Восстановить из локального бэкапа')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color, #5c54e5)',
                    fontSize: '14.5px',
                    fontWeight: 600,
                    lineHeight: 1.25,
                    cursor: 'pointer',
                    padding: '0',
                    outline: 'none',
                    textDecoration: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  {t('welcome.restore_by_backup', 'Восстановить из локального бэкапа')}
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
              transition={{ duration: 0.1, ease: 'easeOut' }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                paddingTop: '32px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 28px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {t('nickname.title', 'Придумайте никнейм')}
              </h2>

              <form onSubmit={handleRegisterSubmit} style={{ width: '100%' }}>
                <div style={{ position: 'relative', width: '100%', marginBottom: '42px' }}>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      if (hasInputError) {
                        setHasInputError(false);
                        setErrorMessage(null);
                      }
                    }}
                    maxLength={24}
                    autoFocus
                    aria-label={t('nickname.title', 'Придумайте никнейм')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: '0px',
                      border: 'none',
                      borderBottom: hasInputError
                        ? '1.5px solid #ef4444'
                        : '1.5px solid var(--border-color, rgba(255, 255, 255, 0.2))',
                      backgroundColor: 'transparent',
                      color: 'var(--text-main, #ffffff)',
                      fontSize: '17px',
                      fontWeight: 500,
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!hasInputError && document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                    onFocus={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                  />

                  {hasInputError && errorMessage && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 21px)',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-dim, #8e8e93)',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  aria-label={t('welcome.continue', 'Продолжить')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #5c54e5)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))',
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
              transition={{ duration: 0.1, ease: 'easeOut' }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                paddingTop: '32px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 28px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {t('welcome.unique_id_title', 'Восстановление по ID')}
              </h2>

              <form onSubmit={handleIdRestore} style={{ width: '100%' }}>
                <div style={{ position: 'relative', width: '100%', marginBottom: '42px' }}>
                  <textarea
                    value={masterKey}
                    onChange={(e) => {
                      setMasterKey(e.target.value);
                      if (hasInputError) {
                        setHasInputError(false);
                        setErrorMessage(null);
                      }
                    }}
                    autoFocus
                    rows={2}
                    aria-label={t('welcome.unique_id_title', 'Восстановление по ID')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: '0px',
                      border: 'none',
                      borderBottom: hasInputError
                        ? '1.5px solid #ef4444'
                        : '1.5px solid var(--border-color, rgba(255, 255, 255, 0.2))',
                      backgroundColor: 'transparent',
                      color: 'var(--text-main, #ffffff)',
                      fontSize: '14px',
                      fontFamily: 'monospace',
                      resize: 'none',
                      outline: 'none',
                      boxSizing: 'border-box',
                      wordBreak: 'break-all',
                      transition: 'border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!hasInputError && document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                    onFocus={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                  />

                  {hasInputError && errorMessage && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 21px)',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-dim, #8e8e93)',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  aria-label={t('welcome.restore_button', 'Восстановить аккаунт')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #5c54e5)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: isLoading ? 'default' : 'pointer',
                    outline: 'none',
                    boxShadow: '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))',
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
              transition={{ duration: 0.1, ease: 'easeOut' }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                paddingTop: '32px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 28px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {t('welcome.backup_file_title', 'Файл резервной копии')}
              </h2>

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

              <div style={{ position: 'relative', width: '100%', marginBottom: '42px' }}>
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
                    border: `2px dashed ${
                      hasInputError
                        ? '#ef4444'
                        : isDragOver
                        ? 'var(--accent-color, #5c54e5)'
                        : selectedFile
                        ? 'var(--accent-color, #5c54e5)'
                        : 'var(--border-color, rgba(255, 255, 255, 0.16))'
                    }`,
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
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedFile && !hasInputError) e.currentTarget.style.borderColor = 'var(--accent-color, #5c54e5)';
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedFile && !hasInputError) e.currentTarget.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.16))';
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
                    </>
                  )}
                </div>

                {hasInputError && errorMessage && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 21px)',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      color: 'var(--text-dim, #8e8e93)',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      lineHeight: 1,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {errorMessage}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleBackupFileContinue}
                aria-label={t('welcome.continue', 'Продолжить')}
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: 'var(--accent-color, #5c54e5)',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))',
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
              transition={{ duration: 0.1, ease: 'easeOut' }}
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                paddingTop: '32px',
              }}
            >
              <h2
                style={{
                  margin: '0 0 28px 0',
                  fontSize: '26px',
                  fontWeight: 800,
                  color: 'var(--text-main, #ffffff)',
                  letterSpacing: '-0.02em',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                {t('welcome.backup_phrase_title', 'Секретная фраза')}
              </h2>

              <form onSubmit={handleBackupPhraseRestore} style={{ width: '100%' }}>
                <div style={{ position: 'relative', width: '100%', marginBottom: '42px' }}>
                  <textarea
                    value={phrase}
                    onChange={(e) => {
                      setPhrase(e.target.value);
                      if (hasInputError) {
                        setHasInputError(false);
                        setErrorMessage(null);
                      }
                    }}
                    autoFocus
                    rows={2}
                    aria-label={t('welcome.backup_phrase_title', 'Секретная фраза')}
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      borderRadius: '0px',
                      border: 'none',
                      borderBottom: hasInputError
                        ? '1.5px solid #ef4444'
                        : '1.5px solid var(--border-color, rgba(255, 255, 255, 0.2))',
                      backgroundColor: 'transparent',
                      color: 'var(--text-main, #ffffff)',
                      fontSize: '14.5px',
                      lineHeight: 1.5,
                      resize: 'none',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!hasInputError && document.activeElement !== e.currentTarget) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                    onFocus={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--accent-color, #5c54e5)';
                      }
                    }}
                    onBlur={(e) => {
                      if (!hasInputError) {
                        e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.2))';
                      }
                    }}
                  />

                  {hasInputError && errorMessage && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 21px)',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-dim, #8e8e93)',
                        fontSize: '12.5px',
                        fontWeight: 500,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      {errorMessage}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  aria-label={t('welcome.restore_button', 'Восстановить аккаунт')}
                  style={{
                    width: '100%',
                    height: '48px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: 'var(--accent-color, #5c54e5)',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 650,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: isLoading ? 'default' : 'pointer',
                    outline: 'none',
                    boxShadow: '0 4px 14px var(--accent-glow, rgba(92, 84, 229, 0.35))',
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

      <div
        style={{
          position: 'absolute',
          bottom: '18px',
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            color: 'var(--text-dim, rgba(255, 255, 255, 0.38))',
            letterSpacing: '0.02em',
            fontWeight: 500,
          }}
        >
          {`Orbita Desktop v${packageJson.version} x64`}
        </span>
      </div>
    </div>
  );
};