import { useState, useEffect, Component, ReactNode } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import md3Theme, { applyThemeToRoot, themePalettes } from './theme';
import { useAuthStore } from './store/useAuthStore';
import { useChatStore } from './store/useChatStore';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { NicknameScreen } from './components/auth/NicknameScreen';
import { MainLayout } from './components/layout/MainLayout';
import { CenterToast } from './components/common/CenterToast';
import { TitleBar, isElectronApp } from './components/layout/TitleBar';
import { AppLockScreen } from './components/auth/AppLockScreen';
import { securityService } from './services/securityService';
import { ablyService } from './services/ablyService';
import './App.css';
import './i18n';
import { useTranslation } from 'react-i18next';
import { FONT_MAP } from './store/useChatStore';
import { useConnectionStore } from './store/useConnectionStore';
import { gatewayManager } from './services/gatewayManager';
import { requestNotificationPermission } from './utils/notification';
import { initAutoBackupListener } from './services/accountBackupService';
import { accountSyncService } from './services/accountSyncService';

class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

function App() {
  const isElectron = isElectronApp();
  const [isHydrated, setIsHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    document.documentElement.style.setProperty('--titlebar-height', isElectron ? '30px' : '0px');
  }, [isElectron]);

  useEffect(() => {
    if (isHydrated) return;
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });
    return unsub;
  }, [isHydrated]);

  const step = useAuthStore((state) => state.step);

  useEffect(() => {
    initAutoBackupListener();
  }, []);

  useEffect(() => {
    if (isHydrated && step === 'main') {
      accountSyncService.init();
    }
  }, [isHydrated, step]);

  const nickname = useAuthStore((state) => state.nickname);
  const currentTheme = useChatStore((state) => state.currentTheme);
  const setProxyActive = useChatStore((state) => state.setProxyActive);
  const fontFamily = useChatStore((state) => state.fontFamily);
  const textScaleRaw = useChatStore((state) => state.textScale);
  const textScale = Number.isFinite(textScaleRaw) && textScaleRaw > 0 ? textScaleRaw : 100;
  const { i18n } = useTranslation();
  const setLanguage = useChatStore((state) => state.setLanguage);
  const language = useChatStore((state) => state.language);
  const appIcon = useChatStore((state) => state.appIcon);
  const notificationIcon = useChatStore((state) => state.notificationIcon);
  const showInSystemTray = useChatStore((state) => state.showInSystemTray);
  const autoLaunch = useChatStore((state) => state.autoLaunch);
  const setShowInSystemTray = useChatStore((state) => state.setShowInSystemTray);
  const setAutoLaunch = useChatStore((state) => state.setAutoLaunch);

  const [isAppLocked, setIsAppLocked] = useState(() => securityService.isPasswordSet());

  useEffect(() => {
    console.log('[App] Requesting notification permission...');
    requestNotificationPermission()
      .then((granted) => {
        console.log('[App] Notification permission result:', granted);
      })
      .catch((err) => {
        console.error('[App] Error requesting notification permission:', err);
      });

    useConnectionStore.getState().initConnection();
    gatewayManager.selectFastestGateway().catch(() => {});
  }, []);

  const chatColor = useChatStore((state) => state.chatColor);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.setThemeForElectron) {
      try {
        const themeDefinition = themePalettes[currentTheme] || themePalettes.dark;
        window.orbita.setThemeForElectron(currentTheme, themeDefinition.vars || {});
      } catch (err) {}
    }
  }, [currentTheme]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.setAppIcon) {
      try {
        window.orbita.setAppIcon(appIcon);
        console.log('[App] App icon sent to Electron:', appIcon);
      } catch (err) {
        console.warn('[App] Could not send app icon to Electron:', err);
      }
    }
  }, [appIcon]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.setNotificationIcon) {
      try {
        window.orbita.setNotificationIcon(notificationIcon);
        console.log('[App] Notification icon sent to Electron:', notificationIcon);
      } catch (err) {
        console.warn('[App] Could not send notification icon to Electron:', err);
      }
    }
  }, [notificationIcon]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.setShowInSystemTray) {
      window.orbita.setShowInSystemTray(showInSystemTray).catch((err) => {
        console.warn('[App] Could not sync tray setting:', err);
      });
    }
  }, [showInSystemTray]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.setAutoLaunch) {
      window.orbita.setAutoLaunch(autoLaunch).catch((err) => {
        console.warn('[App] Could not sync auto-launch setting:', err);
      });
    }
  }, [autoLaunch]);

  useEffect(() => {
    const blockMiddleClickOutsideChat = (e: MouseEvent) => {
      if (e.button === 1) {
        const target = e.target as HTMLElement | null;
        if (!target || !target.closest('.chat-list-scrollbar')) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('auxclick', blockMiddleClickOutsideChat, true);
    window.addEventListener('mousedown', blockMiddleClickOutsideChat, true);
    return () => {
      window.removeEventListener('auxclick', blockMiddleClickOutsideChat, true);
      window.removeEventListener('mousedown', blockMiddleClickOutsideChat, true);
    };
  }, []);

  useEffect(() => {
    const syncSystemIntegration = async () => {
      try {
        if (typeof window !== 'undefined' && window.orbita?.getAutoLaunchState) {
          const currentAutoLaunch = await window.orbita.getAutoLaunchState();
          if (typeof currentAutoLaunch === 'boolean' && currentAutoLaunch !== autoLaunch) {
            setAutoLaunch(currentAutoLaunch);
          }
        }

        if (typeof window !== 'undefined' && window.orbita?.getShowInSystemTray) {
          const currentTraySetting = await window.orbita.getShowInSystemTray();
          if (typeof currentTraySetting === 'boolean' && currentTraySetting !== showInSystemTray) {
            setShowInSystemTray(currentTraySetting);
          }
        }
      } catch (err) {
        console.warn('[App] Could not sync system integration state:', err);
      }
    };

    syncSystemIntegration();
  }, []);



  useEffect(() => {
    if (language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  useEffect(() => {
    if (language !== null) {
      console.log('[App] Язык уже выбран:', language);
      return;
    }
    const systemLang = navigator.language || 'en';
    let lang: 'ru' | 'en' | 'zh' | 'de' | 'fr' = 'en';
    if (systemLang.startsWith('ru')) lang = 'ru';
    else if (systemLang.startsWith('zh')) lang = 'zh';
    else if (systemLang.startsWith('de')) lang = 'de';
    else if (systemLang.startsWith('fr')) lang = 'fr';
    else lang = 'en';
    console.log('[App] Системный язык определен как:', lang);
    setLanguage(lang);
    i18n.changeLanguage(lang);
  }, [setLanguage, i18n, language]);

  useEffect(() => {
    applyThemeToRoot(currentTheme, chatColor);
  }, [currentTheme, chatColor]);

  useEffect(() => {
    setProxyActive(false);
  }, [setProxyActive]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--main-font', FONT_MAP[fontFamily] || FONT_MAP['system']);
    try {
      if (typeof window !== 'undefined' && (window as any).orbita?.setFontForElectron) {
        (window as any).orbita.setFontForElectron(fontFamily);
      }
    } catch (e) {}
  }, [fontFamily]);

  useEffect(() => {
    const root = document.documentElement;
    const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 100;
    root.style.setProperty('--text-scale', String(scale / 100));
    root.style.removeProperty('font-size');
  }, [textScale]);

  const myCode = useChatStore((state) => state.myCode);
  const userId = useAuthStore((state) => state.userId);

  useEffect(() => {
    const clientId = myCode || userId;
    if (step === 'main' && clientId) {
      ablyService.connect(clientId).catch((error) => {
        console.error('[App] Failed to connect to Ably:', error);
      });
    }
    return () => {
      const activeId = myCode || userId;
      if (activeId) {
        ablyService.setOffline(activeId);
      }
      ablyService.disconnect();
    };
  }, [step, userId, myCode]);

  useEffect(() => {
    const handleUnload = () => {
      const clientId = myCode || userId;
      if (clientId) {
        ablyService.setOffline(clientId);
      }
      ablyService.disconnect();
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [myCode, nickname]);

  if (!isHydrated) {
    return (
      <ThemeProvider theme={md3Theme}>
        <CssBaseline />
        <div className="h-screen w-screen bg-[var(--bg-primary)]" style={{ paddingTop: isElectron ? '30px' : '0px', boxSizing: 'border-box' }}>
          {isElectron && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999999 }}>
              <TitleBar />
            </div>
          )}
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={md3Theme}>
      <CssBaseline />
      <div className="h-screen w-screen overflow-hidden bg-[var(--bg-primary)]" style={{ paddingTop: isElectron ? '30px' : '0px', boxSizing: 'border-box' }}>
        {isElectron && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999999 }}>
            <TitleBar />
          </div>
        )}
        <CenterToast />

        {isAppLocked && (
          <AppLockScreen onUnlocked={() => setIsAppLocked(false)} />
        )}

        <ErrorBoundary fallback={
          <div className="flex items-center justify-center h-full text-red-400" style={{ height: isElectron ? 'calc(100vh - 30px)' : '100vh' }}>
            <div className="text-center p-6 border border-red-500/30 rounded-xl bg-red-500/10">
              <h2 className="text-xl font-bold mb-2">Произошла ошибка</h2>
              <p className="text-sm opacity-70">Попробуй перезагрузить приложение</p>
            </div>
          </div>
        }>
          <div className="h-full w-full overflow-hidden relative">
            {step !== 'main' ? (
              <>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    variants={pageVariants}
                    initial={false}
                    animate="animate"
                    exit="exit"
                    style={{ height: '100%', position: 'relative', zIndex: 1 }}
                  >
                    {step === 'welcome' && <WelcomeScreen />}
                    {step === 'nickname' && <NicknameScreen />}
                  </motion.div>
                </AnimatePresence>
              </>
            ) : (
              <MainLayout />
            )}
          </div>
        </ErrorBoundary>
      </div>
    </ThemeProvider>
  );
}

export default App;