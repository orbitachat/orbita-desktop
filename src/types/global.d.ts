// src/types/global.d.ts

interface SyncServerResult {
  url: string;
  port: number;
}

interface OrbitaCustomNotificationPayload {
  title: string;
  body: string;
  chatId?: string;
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right';
  theme: 'dark' | 'light';
  hideContent: boolean;
  maxCount: number;
  soundEnabled?: boolean;
  volume?: number;
  flashTaskbar?: boolean;
  fontFamily?: string;
  avatarUrl?: string;
  colors?: {
    accent?: string;
    accentLight?: string;
    bg?: string;
    text?: string;
    textDim?: string;
  };
}

interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover: string | null;
}

declare global {
  interface Window {
    jsmediatags: any;
    __ELECTRON_RENDERER__?: boolean;
    __orbitaPusher?: any;
    typingTimeout?: ReturnType<typeof setTimeout>;

    orbita: {
      pickFile: (extensions: string[]) => Promise<string | string[] | null>;
      uploadToCloudinary: (filePath: string, publicId: string) => Promise<{
        success: boolean;
        secure_url: string;
        error?: string;
        bytes?: number;
      }>;
      readFileAsDataURL: (filePath: string) => Promise<string | null>;
      writeTempFile: (base64Data: string, extension?: string) => Promise<string | null>;
      deleteTempFile: (filePath: string) => Promise<void>;
      readClipboardImage?: () => Promise<string | null>;
      onUploadProgress: (
        callback: (data: { publicId: string; uploadedBytes: number; totalBytes: number }) => void
      ) => () => void;
      getFileSize: (filePath: string) => Promise<number>;
      getAudioMetadata: (filePath: string) => Promise<AudioMetadata>;
      showCustomNotification: (payload: OrbitaCustomNotificationPayload) => void;
      clearNotifications: () => void;
      onOpenChat: (callback: (chatId: string) => void) => () => void;
      onDeepLink?: (callback: (url: string) => void) => () => void;
      setThemeForElectron: (themeId: string, themeVars: Record<string, string>) => void;
      getCurrentTheme: () => Promise<{ themeId: string; themeVars: Record<string, string> }>;
      isWindowVisible: () => Promise<boolean>;
      showWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      setShowInSystemTray: (enabled: boolean) => Promise<boolean>;
      getShowInSystemTray: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<boolean>;
      getAutoLaunchState: () => Promise<boolean>;
      setScreenProtection: (enabled: boolean) => Promise<boolean>;
      getScreenProtection: () => Promise<boolean>;
      setHideMenuBar: (hide: boolean) => Promise<boolean>;
      getHideMenuBar: () => Promise<boolean>;
      openOrbitaFromTray: () => void;
      closeOrbitaFromTray: () => void;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      isWindowMaximized: () => Promise<boolean>;
      toggleFullScreen: () => Promise<void>;
      onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
      doubleClickTitleBar: () => void;
      notificationsEnabled: () => Promise<boolean>;
      onNotificationsChanged: (callback: (enabled: boolean) => void) => () => void;
      startSyncServer: () => Promise<SyncServerResult>;
      stopSyncServer: () => Promise<{ success: boolean }>;
      getSyncServerUrl: () => Promise<string>;
      getLocalIp: () => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      setAppIcon: (iconName: string) => void;
      setNotificationIcon: (iconName: string) => void;
      downloadsSave: (dataBase64: string, fileName: string) => Promise<{ path: string }>;
      saveFileAs: (data: string | Uint8Array | ArrayBuffer, fileName: string, filters?: Array<{ name: string; extensions: string[] }>) => Promise<{ success?: boolean; canceled?: boolean; path?: string; error?: string }>;
      copyImage: (dataBase64: string) => Promise<{ success: boolean; error?: string }>;
      openFile: (data: string | Uint8Array | ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
      mediaGet: (originalUrl: string) => Promise<{ data: string | Uint8Array | ArrayBuffer; mime: string } | null>;
      mediaSave: (originalUrl: string, dataBase64: string, mimeType: string, chatId: string, messageId: string) => Promise<void>;
      mediaClear: (categories?: string[]) => Promise<{ deleted: number }>;
      mediaStats: () => Promise<{ count: number; totalSize: number }>;
      mediaDetailedStats: () => Promise<{
        totalCount: number;
        totalSize: number;
        byType: Record<string, { count: number; size: number }>;
      }>;
      mediaChatStats: () => Promise<Array<{ chat_id: string; count: number; size: number }>>;
      getDiskSpace: () => Promise<{ total: number; free: number; used: number }>;
      mediaEvictByAge: (ageMs: number) => Promise<{ deleted: number }>;
      mediaEvictBySize: (targetSize: number) => Promise<{ deleted: number }>;
      mediaSetLimit: (type: 'total' | 'media', size: number) => Promise<{ deleted: number }>;
      mediaGetBatch: (requests: Array<{ url: string; sharedSecret: string; fileName?: string }>) => Promise<Array<{ url: string; data: string | null; mime: string | null }>>;
      mediaDeleteByChatId?: (chatId: string) => Promise<{ deleted: number }>;
      destroyCloudinaryMedia?: (publicId: string, resourceType?: string) => Promise<{ success: boolean }>;
      setProxy?: (config: { host: string; port: number; username?: string; password?: string; type?: string; proxyCalls?: boolean }) => Promise<{ success: boolean; error?: string }>;
      clearProxy?: () => Promise<{ success: boolean; error?: string }>;
      setKillSwitchIsolation?: (isolate: boolean) => Promise<{ success: boolean; error?: string }>;
      checkProxyPing?: (host: string, port: number, timeoutMs?: number) => Promise<{ success: boolean; ping?: number; error?: string }>;

      // Native Rust Hardware-Accelerated Cryptography
      rustEncryptFile?: (data: Uint8Array | ArrayBuffer, sharedSecretHex: string) => Promise<Uint8Array | null>;
      rustDecryptFile?: (data: Uint8Array | ArrayBuffer, sharedSecretHex: string) => Promise<Uint8Array | null>;
      rustDeriveSharedSecret?: (myPrivateKeyHex: string, otherPublicKeyHex: string) => Promise<string | null>;
      rustDeriveRootKey?: (sharedSecretHex: string) => Promise<string | null>;
      rustGenerateKeyPair?: () => Promise<{ public_key: string; private_key: string } | null>;
      rustDerivePublicKey?: (privateKeyHex: string) => Promise<string | null>;
      rustEncryptMessage?: (key: Uint8Array, plaintext: Uint8Array, nonce?: Uint8Array, associatedData?: Uint8Array) => Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array } | null>;
      rustDecryptMessage?: (key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array, associatedData?: Uint8Array) => Promise<Uint8Array | null>;
      rustProcessAudioWaveform?: (data: Uint8Array | ArrayBuffer, numBars: number) => Promise<number[] | null>;
      rustResizeImage?: (data: Uint8Array | ArrayBuffer, maxWidth: number, maxHeight: number, quality?: number) => Promise<Uint8Array | null>;
      rustFastTextSearch?: (haystack: string[], query: string) => Promise<number[] | null>;
      rustReadFileFast?: (filePath: string) => Promise<Uint8Array | null>;
      checkForUpdates?: () => Promise<any>;
      downloadUpdate?: () => Promise<any>;
      quitAndInstallUpdate?: () => Promise<void>;
      getAppVersion?: () => Promise<string>;
      setAutoDownloadUpdates?: (autoDownload: boolean) => Promise<boolean>;
      onUpdateStatus?: (callback: (data: {
        status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
        version?: string;
        percent?: number;
        transferred?: number;
        total?: number;
        bytesPerSecond?: number;
        error?: string;
        releaseNotes?: string;
      }) => void) => () => void;
    };
  }

  interface MediaMetadataInit {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: MediaImage[];
  }
  interface MediaImage {
    src: string;
    sizes?: string;
    type?: string;
  }
  interface MediaPositionState {
    duration?: number;
    playbackRate?: number;
    position?: number;
  }
  interface MediaSession {
    metadata: MediaMetadata | null;
    playbackState: 'none' | 'paused' | 'playing';
    setActionHandler(
      action: 'play' | 'pause' | 'previoustrack' | 'nexttrack' | 'seekto' | 'stop' | 'seekbackward' | 'seekforward',
      handler: ((details: { seekTime?: number; seekOffset?: number; fastSeek?: boolean }) => void) | null
    ): void;
    setPositionState(state?: MediaPositionState): void;
  }
  class MediaMetadata {
    constructor(init?: MediaMetadataInit);
    title: string;
    artist: string;
    album: string;
    artwork: MediaImage[];
  }
  interface Navigator {
    mediaSession: MediaSession;
  }
}

export {};