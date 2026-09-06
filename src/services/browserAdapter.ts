import { getVercelBaseUrl } from './gatewayManager';

const WORKER_URL = getVercelBaseUrl();

export interface BrowserAudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover: string | null;
}

type UploadProgressCallback = (data: { publicId: string; uploadedBytes: number; totalBytes: number }) => void;

class BrowserOrbitaAdapter {
  private fileStore = new Map<string, Blob | File>();
  private progressListeners = new Set<UploadProgressCallback>();

  private setFile(key: string, file: Blob | File) {
    if (this.fileStore.size >= 50) {
      const firstKey = this.fileStore.keys().next().value;
      if (firstKey) this.fileStore.delete(firstKey);
    }
    this.fileStore.set(key, file);
  }

  public init() {
    if (typeof window === 'undefined') return;
    if (window.orbita) {
      console.log('[BrowserAdapter] Native window.orbita already present (Electron environment)');
      return;
    }

    console.log('[BrowserAdapter] Installing Web Browser adapter for window.orbita');
    (window as any).orbita = {
      pickFile: this.pickFile.bind(this),
      uploadToCloudinary: this.uploadToCloudinary.bind(this),
      readFileAsDataURL: this.readFileAsDataURL.bind(this),
      writeTempFile: this.writeTempFile.bind(this),
      deleteTempFile: this.deleteTempFile.bind(this),
      readClipboardImage: this.readClipboardImage.bind(this),
      onUploadProgress: this.onUploadProgress.bind(this),
      getFileSize: this.getFileSize.bind(this),
      getAudioMetadata: this.getAudioMetadata.bind(this),
      showCustomNotification: this.showCustomNotification.bind(this),
      clearNotifications: () => {},
      onOpenChat: () => () => {},
      onDeepLink: () => () => {},
      setThemeForElectron: () => {},
      getCurrentTheme: async () => ({ themeId: 'dark', themeVars: {} }),
      isWindowVisible: async () => true,
      showWindow: async () => {},
      hideWindow: async () => {},
      setShowInSystemTray: async () => true,
      getShowInSystemTray: async () => false,
      setAutoLaunch: async () => false,
      getAutoLaunchState: async () => false,
      setScreenProtection: async () => false,
      getScreenProtection: async () => false,
      setHideMenuBar: async () => false,
      getHideMenuBar: async () => false,
      openOrbitaFromTray: () => {},
      closeOrbitaFromTray: () => {},
      minimizeWindow: async () => {},
      maximizeWindow: async () => {},
      closeWindow: async () => {},
      isWindowMaximized: async () => false,
      toggleFullScreen: async () => {},
      onWindowStateChange: () => () => {},
      doubleClickTitleBar: () => {},
      notificationsEnabled: async () => 'Notification' in window && Notification.permission === 'granted',
      onNotificationsChanged: () => () => {},
      startSyncServer: async () => ({ url: 'http://localhost:5173', port: 5173 }),
      stopSyncServer: async () => ({ success: true }),
      getSyncServerUrl: async () => 'http://localhost:5173',
      getLocalIp: async () => '127.0.0.1',
      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      setAppIcon: () => {},
      setNotificationIcon: () => {},
      downloadsSave: this.downloadsSave.bind(this),
      saveFileAs: this.saveFileAs.bind(this),
      copyImage: this.copyImage.bind(this),
      openFile: this.openFile.bind(this),
      mediaGet: async () => null,
      mediaSave: async () => {},
      mediaClear: async () => ({ deleted: 0 }),
      mediaStats: async () => ({ count: 0, totalSize: 0 }),
      mediaDetailedStats: async () => ({ totalCount: 0, totalSize: 0, byType: {} }),
      mediaEvictByAge: async () => ({ deleted: 0 }),
      mediaEvictBySize: async () => ({ deleted: 0 }),
      mediaSetLimit: async () => ({ deleted: 0 }),
      mediaGetBatch: async () => [],
      mediaDeleteByChatId: async () => ({ deleted: 0 }),
    };
  }

  public async pickFile(extensions?: string[]): Promise<string[] | null> {
    return new Promise<string[] | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;

      if (extensions && extensions.length > 0) {
        input.accept = extensions
          .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`))
          .join(',');
      }

      let settled = false;

      const finish = (result: string[] | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(result);
      };

      input.onchange = () => {
        if (!input.files || input.files.length === 0) {
          finish(null);
          return;
        }

        const virtualPaths: string[] = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          const virtualPath = `browser_file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${file.name}`;
          this.setFile(virtualPath, file);
          virtualPaths.push(virtualPath);
        }

        finish(virtualPaths);
      };

      // If user cancels without choosing a file
      const onFocus = () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            finish(null);
          }
        }, 500);
      };

      window.addEventListener('focus', onFocus, { once: true });
      input.click();
    });
  }

  public async readFileAsDataURL(filePath: string): Promise<string | null> {
    if (!filePath) return null;
    if (filePath.startsWith('data:') || filePath.startsWith('blob:')) {
      return filePath;
    }

    const item = this.fileStore.get(filePath);
    if (!item) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file as data URL'));
      reader.readAsDataURL(item);
    });
  }

  public async getFileSize(filePath: string): Promise<number> {
    const item = this.fileStore.get(filePath);
    if (item) return item.size;
    if (filePath.startsWith('data:')) {
      const base64 = filePath.split(',')[1] || '';
      return Math.floor((base64.length * 3) / 4);
    }
    return 0;
  }

  public async writeTempFile(base64Data: string, extension?: string): Promise<string | null> {
    try {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      let mime = 'application/octet-stream';
      if (extension === 'png') mime = 'image/png';
      else if (extension === 'jpg' || extension === 'jpeg') mime = 'image/jpeg';
      else if (extension === 'ogg') mime = 'audio/ogg';
      else if (extension === 'webm') mime = 'audio/webm';
      else if (extension === 'm4a' || extension === 'mp4') mime = 'audio/mp4';

      const blob = new Blob([bytes], { type: mime });
      const virtualPath = `browser_file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${extension ? '.' + extension : ''}`;
      
      this.setFile(virtualPath, blob);
      return virtualPath;
    } catch (err) {
      return null;
    }
  }

  public async deleteTempFile(filePath: string): Promise<void> {
    this.fileStore.delete(filePath);
  }

  public async readClipboardImage(): Promise<string | null> {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          }
        }
      }
    } catch (e) {
      console.warn('[BrowserAdapter] Clipboard image read not supported or permission denied:', e);
    }
    return null;
  }

  public onUploadProgress(callback: UploadProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  private notifyProgress(publicId: string, uploadedBytes: number, totalBytes: number) {
    this.progressListeners.forEach((cb) => {
      try {
        cb({ publicId, uploadedBytes, totalBytes });
      } catch (err) {
        console.error('[BrowserAdapter] Error in progress listener:', err);
      }
    });
  }

  public async uploadToCloudinary(
    filePath: string,
    publicId: string
  ): Promise<{ success: boolean; secure_url: string; error?: string; bytes?: number }> {
    try {
      let fileBlob: Blob | undefined;

      if (this.fileStore.has(filePath)) {
        fileBlob = this.fileStore.get(filePath)!;
      } else if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
        const res = await fetch(filePath);
        fileBlob = await res.blob();
      }

      if (!fileBlob) {
        return { success: false, secure_url: '', error: 'File data not found in browser store' };
      }


      const signResp = await fetch(`${WORKER_URL}/cloudinary/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });

      if (!signResp.ok) {
        throw new Error(`Worker signing failed: ${signResp.statusText}`);
      }

      const signed = await signResp.json();
      const uploadUrl = signed.uploadUrl || `https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`;

      const formData = new FormData();
      formData.append('file', fileBlob, publicId);
      formData.append('public_id', publicId);
      formData.append('timestamp', String(signed.timestamp));
      formData.append('api_key', signed.apiKey);
      formData.append('signature', signed.signature);


      const result = await new Promise<{ success: boolean; secure_url: string; bytes?: number; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            this.notifyProgress(publicId, e.loaded, e.total);
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status === 200 && data.secure_url) {
              resolve({ success: true, secure_url: data.secure_url, bytes: data.bytes });
            } else {
              resolve({ success: false, secure_url: '', error: data.error?.message || `HTTP ${xhr.status}` });
            }
          } catch (parseErr: any) {
            resolve({ success: false, secure_url: '', error: parseErr?.message || 'JSON parse error' });
          }
        };

        xhr.onerror = () => {
          resolve({ success: false, secure_url: '', error: 'Network error during upload' });
        };

        xhr.send(formData);
      });

      return result;
    } catch (err: any) {
      console.error('[BrowserAdapter] Cloudinary upload error:', err);
      return { success: false, secure_url: '', error: err?.message || String(err) };
    }
  }

  public async getAudioMetadata(filePath: string): Promise<BrowserAudioMetadata> {
    const fileName = filePath.split(/[\\/]/).pop()?.replace(/^browser_file_\d+_[a-z0-9]+_/, '') || 'audio';
    const cleanTitle = fileName.replace(/\.[^.]+$/, '');

    try {
      const dataUrl = await this.readFileAsDataURL(filePath);
      if (!dataUrl) {
        return { title: cleanTitle, artist: '', duration: 0, size: 0, cover: null };
      }

      const size = await this.getFileSize(filePath);

      const duration = await new Promise<number>((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => resolve(audio.duration || 0);
        audio.onerror = () => resolve(0);
        audio.src = dataUrl;
      });

      return {
        title: cleanTitle,
        artist: '',
        duration: Math.round(duration),
        size,
        cover: null,
      };
    } catch (err) {
      console.warn('[BrowserAdapter] Failed to get audio metadata:', err);
      return { title: cleanTitle, artist: '', duration: 0, size: 0, cover: null };
    }
  }

  public async downloadsSave(dataBase64: string, fileName: string): Promise<{ path: string }> {
    const a = document.createElement('a');
    a.href = dataBase64.startsWith('data:') ? dataBase64 : `data:application/octet-stream;base64,${dataBase64}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    return { path: fileName };
  }

  public async saveFileAs(dataBase64: string, fileName: string): Promise<{ success?: boolean; canceled?: boolean; path?: string }> {
    const a = document.createElement('a');
    a.href = dataBase64.startsWith('data:') ? dataBase64 : `data:application/octet-stream;base64,${dataBase64}`;
    a.download = fileName || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 100);
    return { success: true, path: fileName };
  }

  public async copyImage(dataBase64: string): Promise<{ success: boolean }> {
    try {
      const cleanBase64 = dataBase64.replace(/^data:image\/\w+;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  public async openFile(dataBase64: string, fileName: string): Promise<{ success: boolean; path?: string }> {
    try {
      const cleanBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray]);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      return { success: true, path: fileName };
    } catch {
      return { success: false };
    }
  }

  public showCustomNotification(payload: { title: string; body: string; avatarUrl?: string }) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(payload.title, {
          body: payload.body,
          icon: payload.avatarUrl || '/icon.png',
        });
      } catch {}
    }
  }
}

export const browserOrbitaAdapter = new BrowserOrbitaAdapter();
browserOrbitaAdapter.init();
