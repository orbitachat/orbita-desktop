// electron/preload.ts
console.log('[Preload] Script started');

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orbita', {
  pickFile: (extensions: string[]) =>
    ipcRenderer.invoke('orbita:pickFile', extensions),

  uploadToCloudinary: (filePath: string, publicId: string) =>
    ipcRenderer.invoke('orbita:upload', { filePath, publicId }),

  destroyCloudinaryMedia: (publicId: string, resourceType?: string) =>
    ipcRenderer.invoke('orbita:destroyCloudinaryMedia', publicId, resourceType),

  readFileAsDataURL: (filePath: string) =>
    ipcRenderer.invoke('orbita:readFileAsDataURL', filePath),

  writeTempFile: (base64Data: string, extension?: string) =>
    ipcRenderer.invoke('orbita:writeTempFile', base64Data, extension),

  deleteTempFile: (filePath: string) =>
    ipcRenderer.invoke('orbita:deleteTempFile', filePath),

  readClipboardImage: () =>
    ipcRenderer.invoke('orbita:readClipboardImage'),

  getFileSize: (filePath: string) =>
    ipcRenderer.invoke('orbita:getFileSize', filePath),

  getAudioMetadata: (filePath: string) =>
    ipcRenderer.invoke('orbita:getAudioMetadata', filePath),

  fetchUrl: (url: string) =>
    ipcRenderer.invoke('orbita:fetchUrl', url),

  onUploadProgress: (
    callback: (data: { publicId: string; uploadedBytes: number; totalBytes: number }) => void
  ) => {
    const handler = (_event: unknown, data: { publicId: string; uploadedBytes: number; totalBytes: number }) => {
      callback(data);
    };
    ipcRenderer.on('orbita:uploadProgress', handler);
    return () => ipcRenderer.removeListener('orbita:uploadProgress', handler);
  },

  showCustomNotification: (payload: {
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
  }) => {
    ipcRenderer.send('orbita:show-custom-notification', payload);
  },

  clearNotifications: () => {
    ipcRenderer.send('orbita:clear-notifications');
  },

  onOpenChat: (callback: (chatId: string) => void) => {
    const handler = (_event: unknown, chatId: string) => callback(chatId);
    ipcRenderer.on('notification:open-chat', handler);
    return () => ipcRenderer.removeListener('notification:open-chat', handler);
  },

  onDeepLink: (callback: (url: string) => void) => {
    const handler = (_event: unknown, url: string) => callback(url);
    ipcRenderer.on('deep-link', handler);
    return () => ipcRenderer.removeListener('deep-link', handler);
  },

  setThemeForElectron: (themeId: string, themeVars: Record<string, string>) => {
    ipcRenderer.send('orbita:set-current-theme', { themeId, themeVars });
  },

  setFontForElectron: (fontFamily: string) => {
    ipcRenderer.send('orbita:set-current-font', fontFamily);
  },

  getCurrentTheme: () => {
    return ipcRenderer.invoke('orbita:get-current-theme');
  },

  onThemeChanged: (callback: (data: any) => void) => {
    const handler = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('orbita:theme-changed', handler);
    return () => ipcRenderer.removeListener('orbita:theme-changed', handler);
  },

  openCallWindow: (payload?: any) => ipcRenderer.invoke('orbita:open-call-window', payload),
  closeCallWindow: () => ipcRenderer.invoke('orbita:close-call-window'),
  sendCallState: (state: any) => ipcRenderer.send('orbita:send-call-state', state),
  getCallState: () => ipcRenderer.invoke('orbita:get-call-state'),
  onCallState: (callback: (state: any) => void) => {
    const handler = (_event: unknown, state: any) => callback(state);
    ipcRenderer.on('orbita:call-state', handler);
    return () => ipcRenderer.removeListener('orbita:call-state', handler);
  },
  sendCallAction: (action: any) => ipcRenderer.send('orbita:send-call-action', action),
  onCallAction: (callback: (action: any) => void) => {
    const handler = (_event: unknown, action: any) => callback(action);
    ipcRenderer.on('orbita:call-action', handler);
    return () => ipcRenderer.removeListener('orbita:call-action', handler);
  },

  isWindowVisible: () => {
    return ipcRenderer.invoke('orbita:is-window-visible');
  },

  showWindow: () => {
    return ipcRenderer.invoke('orbita:show-window');
  },

  hideWindow: () => {
    return ipcRenderer.invoke('orbita:hide-window');
  },

  setShowInSystemTray: (enabled: boolean) => {
    return ipcRenderer.invoke('orbita:set-show-in-system-tray', enabled);
  },

  getShowInSystemTray: () => {
    return ipcRenderer.invoke('orbita:get-show-in-system-tray');
  },

  setAutoLaunch: (enabled: boolean) => {
    return ipcRenderer.invoke('orbita:set-auto-launch', enabled);
  },

  getAutoLaunchState: () => {
    return ipcRenderer.invoke('orbita:get-auto-launch-state');
  },

  setScreenProtection: (enabled: boolean) => {
    return ipcRenderer.invoke('orbita:set-screen-protection', enabled);
  },

  getScreenProtection: () => {
    return ipcRenderer.invoke('orbita:get-screen-protection');
  },

  setHideMenuBar: (hide: boolean) => {
    return ipcRenderer.invoke('orbita:set-hide-menu-bar', hide);
  },

  getHideMenuBar: () => {
    return ipcRenderer.invoke('orbita:get-hide-menu-bar');
  },

  openOrbitaFromTray: () => {
    ipcRenderer.send('orbita:tray-menu-action', 'open');
  },

  closeOrbitaFromTray: () => {
    ipcRenderer.send('orbita:tray-menu-action', 'quit');
  },

  notificationsEnabled: () => {
    return ipcRenderer.invoke('orbita:notifications-enabled');
  },

  onNotificationsChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_event: unknown, enabled: boolean) => callback(enabled);
    ipcRenderer.on('orbita:notifications-changed', handler);
    return () => ipcRenderer.removeListener('orbita:notifications-changed', handler);
  },

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  isFullScreen: () => ipcRenderer.invoke('window:isFullScreen'),
  setFullScreen: (flag?: boolean) => ipcRenderer.invoke('window:setFullScreen', flag),
  toggleFullScreen: () => ipcRenderer.invoke('window:setFullScreen'),

  onWindowStateChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:state-changed', handler);
    return () => ipcRenderer.removeListener('window:state-changed', handler);
  },

  doubleClickTitleBar: () => ipcRenderer.send('window:double-click'),

  startSyncServer: () => ipcRenderer.invoke('sync:start-server'),
  
  stopSyncServer: () => ipcRenderer.invoke('sync:stop-server'),
  
  getSyncServerUrl: () => ipcRenderer.invoke('sync:get-url'),
  
  getLocalIp: () => ipcRenderer.invoke('sync:get-local-ip'),

  openExternal: (url: string) => ipcRenderer.invoke('orbita:openExternal', url),

  setAppIcon: (iconName: string) => {
    console.log('[Preload] Setting app icon:', iconName);
    ipcRenderer.send('orbita:set-app-icon', iconName);
  },

  setNotificationIcon: (iconName: string) => {
    console.log('[Preload] Setting notification icon:', iconName);
    ipcRenderer.send('orbita:set-notification-icon', iconName);
  },

  getCurrentIcons: () => {
    return ipcRenderer.invoke('orbita:get-current-icons');
  },

  getPlatform: () => ipcRenderer.invoke('orbita:get-platform'),
  getAppVersion: () => ipcRenderer.invoke('orbita:get-app-version'),
  getOsInfo: () => ipcRenderer.invoke('orbita:get-os-info'),

  downloadsSave: (dataBase64: string, fileName: string) =>
    ipcRenderer.invoke('downloads:save', dataBase64, fileName),

  saveFileAs: (data: string | Uint8Array | ArrayBuffer, fileName: string, filters?: Array<{ name: string; extensions: string[] }>) =>
    ipcRenderer.invoke('downloads:save-as', data, fileName, filters),

  selectDirectory: () => ipcRenderer.invoke('orbita:selectDirectory'),
  openFolder: (folderPath: string) => ipcRenderer.invoke('orbita:openFolder', folderPath),
  saveBackupFile: (folderPath: string, fileName: string, data: Uint8Array | ArrayBuffer) =>
    ipcRenderer.invoke('orbita:saveBackupFile', folderPath, fileName, data),

  copyImage: (dataBase64: string) =>
    ipcRenderer.invoke('orbita:copy-image', dataBase64),

  openFile: (data: string | Uint8Array | ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('orbita:open-file', data, fileName),

  mediaGet: (originalUrl: string) =>
    ipcRenderer.invoke('media:get', originalUrl),

  mediaGetBatch: (requests: Array<{ url: string; sharedSecret: string; fileName?: string }>) =>
    ipcRenderer.invoke('media:get-batch', requests),

  mediaSave: (originalUrl: string, dataBase64: string, mimeType: string, chatId: string, messageId: string) =>
    ipcRenderer.invoke('media:save', originalUrl, dataBase64, mimeType, chatId, messageId),

  mediaClear: (categories?: string[]) =>
    ipcRenderer.invoke('media:clear', categories),

  mediaStats: () =>
    ipcRenderer.invoke('media:stats'),

  mediaDetailedStats: () =>
    ipcRenderer.invoke('media:detailed-stats'),

  mediaChatStats: () =>
    ipcRenderer.invoke('media:chat-stats'),

  mediaDeleteByChatId: (chatId: string) =>
    ipcRenderer.invoke('media:delete-by-chat', chatId),

  getDiskSpace: () =>
    ipcRenderer.invoke('system:disk-space'),

  mediaEvictByAge: (ageMs: number) =>
    ipcRenderer.invoke('media:evict-by-age', ageMs),

  mediaEvictBySize: (targetSize: number) =>
    ipcRenderer.invoke('media:evict-by-size', targetSize),

  mediaSetLimit: (type: 'total' | 'media', size: number) =>
    ipcRenderer.invoke('media:set-limit', { type, size }),

  storageGet: (key: string) => ipcRenderer.invoke('storage:get', key),
  storageSet: (key: string, value: string) => ipcRenderer.invoke('storage:set', key, value),
  storageRemove: (key: string) => ipcRenderer.invoke('storage:remove', key),
  storageMigrate: () => ipcRenderer.invoke('storage:migrate'),
  storageGetMessages: (chatId: string, limit?: number, offset?: number) =>
    ipcRenderer.invoke('storage:get-messages', chatId, limit, offset),
  storageAddMessage: (chatId: string, messageId: string, messageData: any) =>
    ipcRenderer.invoke('storage:add-message', chatId, messageId, messageData),
  storageDeleteMessages: (chatId: string) =>
    ipcRenderer.invoke('storage:delete-messages', chatId),
  storageDeleteMessage: (messageId: string) =>
    ipcRenderer.invoke('storage:delete-message', messageId),

  setProxy: (config: { host: string; port: number; username?: string; password?: string; type?: string; proxyCalls?: boolean }) =>
    ipcRenderer.invoke('orbita:setProxy', config),
  clearProxy: () => ipcRenderer.invoke('orbita:clearProxy'),
  setKillSwitchIsolation: (isolate: boolean) =>
    ipcRenderer.invoke('orbita:setKillSwitchIsolation', isolate),
  checkProxyPing: (host: string, port: number, timeoutMs?: number) =>
    ipcRenderer.invoke('orbita:checkProxyPing', host, port, timeoutMs),

  // Native Rust Hardware-Accelerated Cryptography
  rustEncryptFile: (data: Uint8Array | ArrayBuffer, sharedSecretHex: string) =>
    ipcRenderer.invoke('orbita:rustEncryptFile', data, sharedSecretHex),
  rustDecryptFile: (data: Uint8Array | ArrayBuffer, sharedSecretHex: string) =>
    ipcRenderer.invoke('orbita:rustDecryptFile', data, sharedSecretHex),
  rustDeriveSharedSecret: (myPrivateKeyHex: string, otherPublicKeyHex: string) =>
    ipcRenderer.invoke('orbita:rustDeriveSharedSecret', myPrivateKeyHex, otherPublicKeyHex),
  rustDeriveRootKey: (sharedSecretHex: string) =>
    ipcRenderer.invoke('orbita:rustDeriveRootKey', sharedSecretHex),
  rustGenerateKeyPair: () =>
    ipcRenderer.invoke('orbita:rustGenerateKeyPair'),
  rustDerivePublicKey: (privateKeyHex: string) =>
    ipcRenderer.invoke('orbita:rustDerivePublicKey', privateKeyHex),
  rustEncryptMessage: (key: Uint8Array, plaintext: Uint8Array, nonce?: Uint8Array, associatedData?: Uint8Array) =>
    ipcRenderer.invoke('orbita:rustEncryptMessage', key, plaintext, nonce, associatedData),
  rustDecryptMessage: (key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array, associatedData?: Uint8Array) =>
    ipcRenderer.invoke('orbita:rustDecryptMessage', key, ciphertext, nonce, tag, associatedData),
  rustProcessAudioWaveform: (data: Uint8Array | ArrayBuffer, numBars: number) =>
    ipcRenderer.invoke('orbita:rustProcessAudioWaveform', data, numBars),
  rustResizeImage: (data: Uint8Array | ArrayBuffer, maxWidth: number, maxHeight: number, quality?: number) =>
    ipcRenderer.invoke('orbita:rustResizeImage', data, maxWidth, maxHeight, quality),
  rustFastTextSearch: (haystack: string[], query: string) =>
    ipcRenderer.invoke('orbita:rustFastTextSearch', haystack, query),
  rustReadFileFast: (filePath: string) =>
    ipcRenderer.invoke('orbita:rustReadFileFast', filePath),
  getDesktopSources: (opts?: { types?: Array<'screen' | 'window'>; thumbnailWidth?: number; thumbnailHeight?: number; fetchWindowIcons?: boolean }) =>
    ipcRenderer.invoke('orbita:get-desktop-sources', opts),
  checkForUpdates: () => ipcRenderer.invoke('orbita:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('orbita:downloadUpdate'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('orbita:quitAndInstallUpdate'),
  setAutoDownloadUpdates: (autoDownload: boolean) =>
    ipcRenderer.invoke('orbita:setAutoDownloadUpdates', autoDownload),
  onUpdateStatus: (callback: (data: any) => void) => {
    const handler = (_event: unknown, data: any) => callback(data);
    ipcRenderer.on('orbita:updateStatus', handler);
    return () => ipcRenderer.removeListener('orbita:updateStatus', handler);
  },
});

Object.defineProperty(window, '__ELECTRON_RENDERER__', {
  value: true,
  configurable: false,
  writable: false,
});

console.log('[Preload] Script finished, __ELECTRON_RENDERER__ set');