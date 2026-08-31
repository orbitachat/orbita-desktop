import { getVercelBaseUrl } from './gatewayManager';

class IndexedDBMediaStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private static readonly DB_VERSION = 3;
  private static readonly DB_NAME = 'orbita_media_v3';

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(IndexedDBMediaStorage.DB_NAME, IndexedDBMediaStorage.DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'url' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async get(url: string): Promise<{ data: string; mime: string } | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('media', 'readonly');
        const store = tx.objectStore('media');
        const req = store.get(url);
        req.onsuccess = () => resolve(req.result ? { data: req.result.data, mime: req.result.mime } : null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async save(url: string, data: string, mime: string, chatId?: string, messageId?: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('media', 'readwrite');
      const store = tx.objectStore('media');
      store.put({ url, data, mime, chatId, messageId, savedAt: Date.now() });
    } catch {}
  }
}

const idbMediaStorage = new IndexedDBMediaStorage();

export interface DecryptedMedia {
  id: string;
  blobUrl: string;
  imageBitmap: ImageBitmap | null;
  mimeType: string;
  size: number;
  lastAccessed: number;
  chatId?: string;
  messageId?: string;
}

interface QueuedItem {
  url: string;
  sharedSecret: string;
  fileName?: string;
  chatId: string;
  messageId: string;
  resolve: (media: DecryptedMedia) => void;
  reject: (err: any) => void;
}

const normalizeMediaUrl = (raw: string): string => {
  if (!raw) return '';
  return raw.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
};

class MediaManager {
  private memoryCache = new Map<string, DecryptedMedia>();
  private totalMemorySize = 0;
  private maxMemorySize = 32 * 1024 * 1024;
  private maxItemCount = 40;

  private pendingRequests = new Map<string, Promise<DecryptedMedia>>();
  private downloadQueue: QueuedItem[] = [];
  private activeDownloads = 0;
  private maxConcurrentDownloads = 3;
  private processing = false;
  private fetchAbortControllers = new Map<string, AbortController>();

  private cacheHits = 0;
  private cacheMisses = 0;

  setDirectDecryptedMedia(
    url: string,
    sharedSecret: string,
    blob: Blob,
    mimeType: string,
    chatId?: string,
    messageId?: string
  ): DecryptedMedia {
    const cleanUrl = normalizeMediaUrl(url);
    const cacheKey = `${cleanUrl}::${sharedSecret || 'public'}`;
    const blobUrl = URL.createObjectURL(blob);
    const media: DecryptedMedia = {
      id: cacheKey,
      blobUrl,
      imageBitmap: null,
      mimeType: mimeType || blob.type || 'application/octet-stream',
      size: blob.size,
      lastAccessed: Date.now(),
      chatId,
      messageId,
    };
    this.memoryCache.set(cacheKey, media);

    if (typeof window !== 'undefined' && (window as any).orbita?.mediaSave) {
      blob.arrayBuffer().then((ab) => {
        const base64 = this.arrayBufferToBase64(ab);
        (window as any).orbita.mediaSave(cleanUrl, base64, mimeType || blob.type || 'application/octet-stream', chatId, messageId).catch(() => {});
      }).catch(() => {});
    }

    return media;
  }

  getCachedMedia(url: string | null | undefined, sharedSecret: string): DecryptedMedia | undefined {
    if (!url || typeof url !== 'string' || !url.trim()) return undefined;
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) return undefined;
    const cacheKey = `${cleanUrl}::${sharedSecret || 'public'}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      return cached;
    }
    return undefined;
  }

  async getMedia(
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string
  ): Promise<DecryptedMedia> {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid media URL');
    }
    const cleanUrl = normalizeMediaUrl(url);
    if (!cleanUrl) {
      throw new Error('Invalid media URL after normalization');
    }
    const cacheKey = `${cleanUrl}::${sharedSecret || 'public'}`;

    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      cached.lastAccessed = Date.now();
      this.cacheHits++;
      return cached;
    }

    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    const promise: Promise<DecryptedMedia> = this.createLoadPromise(cacheKey, cleanUrl, sharedSecret, fileName, chatId, messageId);
    this.pendingRequests.set(cacheKey, promise);
    return promise;
  }

  private createLoadPromise(
    cacheKey: string,
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string
  ): Promise<DecryptedMedia> {
    return new Promise<DecryptedMedia>((resolve, reject) => {
      const item: QueuedItem = {
        url,
        sharedSecret,
        fileName,
        chatId: chatId || '',
        messageId: messageId || '',
        resolve,
        reject,
      };
      this.downloadQueue.push(item);
      this.processQueue();
    }).finally(() => {
      this.pendingRequests.delete(cacheKey);
    });
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.downloadQueue.length > 0 && this.activeDownloads < this.maxConcurrentDownloads) {
      const item = this.downloadQueue.shift()!;
      this.activeDownloads++;
      this.processItem(item).finally(() => {
        this.activeDownloads--;
        this.processing = false;
        this.processQueue();
      });
    }
    this.processing = false;
  }

  private async processItem(item: QueuedItem) {
    const cacheKey = `${item.url}::${item.sharedSecret || 'public'}`;
    try {
      const media = await this.fetchAndDecrypt(item.url, item.sharedSecret, item.fileName, item.chatId, item.messageId);
      this.addToMemoryCache(cacheKey, media);
      item.resolve(media);
    } catch (err) {
      item.reject(err);
    }
  }

  private async requestServerMediaDelete(url: string): Promise<void> {
    if (!url || typeof url !== 'string') return;
    try {
      const match = url.match(/\/v\d+\/([^\.\?]+)/) || url.match(/\/([^\/\?]+)\.[a-zA-Z0-9]+$/);
      const publicId = match ? match[1] : null;
      if (publicId) {
        if (window.orbita?.destroyCloudinaryMedia) {
          window.orbita.destroyCloudinaryMedia(publicId).catch(() => {});
        } else {
          const workerUrl = getVercelBaseUrl();
          fetch(`${workerUrl}/cloudinary/destroy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_id: publicId, url }),
          }).catch(() => {});
        }
      }
    } catch {}
  }

  private async fetchAndDecrypt(
    url: string,
    sharedSecret: string,
    fileName?: string,
    chatId?: string,
    messageId?: string
  ): Promise<DecryptedMedia> {
    const cacheKey = `${url}::${sharedSecret || 'public'}`;

    let diskCache: { data: string | Uint8Array | ArrayBuffer | null; mime: string | null } | null = null;
    if (window.orbita?.mediaGet) {
      diskCache = await window.orbita.mediaGet(url);
    } else {
      diskCache = await idbMediaStorage.get(url);
    }

    let decryptedData: ArrayBuffer;
    let mime: string;

    if (diskCache && diskCache.data) {
      let rawBytes: ArrayBuffer;
      if (diskCache.data instanceof Uint8Array) {
        rawBytes = diskCache.data.buffer.slice(diskCache.data.byteOffset, diskCache.data.byteOffset + diskCache.data.byteLength) as ArrayBuffer;
      } else if (diskCache.data instanceof ArrayBuffer) {
        rawBytes = diskCache.data;
      } else if (typeof diskCache.data === 'string') {
        const bin = atob(diskCache.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        rawBytes = bytes.buffer as ArrayBuffer;
      } else {
        const raw = diskCache.data as any;
        rawBytes = (raw.buffer || raw) as ArrayBuffer;
      }

      const cachedMime = diskCache.mime || '';
      const needsRedecrypt = !cachedMime || cachedMime === 'application/octet-stream';

      if (!needsRedecrypt) {
        decryptedData = rawBytes;
        mime = cachedMime;
      } else {
        if (sharedSecret && sharedSecret.trim()) {
          try {
            decryptedData = await this.decryptFile(rawBytes, sharedSecret);
            mime = this.detectMime(new Uint8Array(decryptedData.slice(0, 16)), fileName);
            const b64 = this.arrayBufferToBase64(decryptedData);
            if (!window.orbita?.mediaSave) {
              idbMediaStorage.save(url, b64, mime, chatId, messageId).catch(() => {});
            }
          } catch {
            decryptedData = rawBytes;
            mime = 'application/octet-stream';
          }
        } else {
          decryptedData = rawBytes;
          mime = this.detectMime(new Uint8Array(rawBytes.slice(0, 16)), fileName);
        }
      }
    } else {
      const response = await fetch(url, { signal: this.getAbortSignal(cacheKey) });
      if (!response.ok) {
        throw new Error(`Media fetch failed with status ${response.status}`);
      }
      const encryptedBuffer = await response.arrayBuffer();

      if (sharedSecret && sharedSecret.trim()) {
        try {
          decryptedData = await this.decryptFile(encryptedBuffer, sharedSecret);
        } catch {
          throw new Error('Media decryption failed');
        }
      } else {
        decryptedData = encryptedBuffer;
      }

      mime = this.detectMime(new Uint8Array(decryptedData.slice(0, 16)), fileName);

      const b64 = this.arrayBufferToBase64(decryptedData);
      if (window.orbita?.mediaSave) {
        try {
          window.orbita.mediaSave(url, b64, mime, chatId || '', messageId || '').catch(() => {});
        } catch (_) {}
      } else {
        idbMediaStorage.save(url, b64, mime, chatId, messageId).catch(() => {});
      }

      this.requestServerMediaDelete(url).catch(() => {});
    }

    const blob = new Blob([decryptedData], { type: mime });
    const blobUrl = URL.createObjectURL(blob);

    return {
      id: url,
      blobUrl,
      imageBitmap: null,
      mimeType: mime,
      size: blob.size,
      lastAccessed: Date.now(),
      chatId,
      messageId,
    };
  }

  private async decryptFile(encryptedData: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
    if (window.orbita?.rustDecryptFile) {
      try {
        const decrypted = await window.orbita.rustDecryptFile(encryptedData, keyHex);
        if (decrypted) {
          return (decrypted.buffer as ArrayBuffer).slice(
            decrypted.byteOffset,
            decrypted.byteOffset + decrypted.byteLength
          );
        }
      } catch {}
    }
    if (encryptedData.byteLength < 28) return encryptedData;
    const iv = new Uint8Array(encryptedData.slice(0, 12));
    const data = encryptedData.slice(12);

    const cleanHex = keyHex.trim().toLowerCase();
    const len = Math.floor(cleanHex.length / 2);
    const raw = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }

    if (raw.length === 32) {
      try {
        const directKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
        return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, directKey, data);
      } catch {}
    }

    try {
      const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode('orbita-file-key'),
          info: new TextEncoder().encode('file-encryption'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, derivedKey, data);
    } catch {
      return encryptedData;
    }
  }

  private isDangerousExecutable(bytes: Uint8Array): boolean {
    if (!bytes || bytes.length < 2) return false;
    if (bytes[0] === 0x4D && bytes[1] === 0x5A) return true;
    if (bytes.length >= 4 && bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) return true;
    if (bytes[0] === 0x23 && bytes[1] === 0x21) return true;
    return false;
  }

  private detectMime(bytes: Uint8Array, fileName?: string): string {
    if (this.isDangerousExecutable(bytes)) {
      return 'application/octet-stream';
    }
    let mime = 'application/octet-stream';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) mime = 'image/jpeg';
    else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) mime = 'image/png';
    else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) mime = 'image/gif';
    else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        mime = 'image/webp';
      } else if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
        mime = 'audio/wav';
      } else {
        mime = 'image/webp';
      }
    }
    else if (bytes[4] === 0x66 && bytes[5] === 0x74) mime = 'video/mp4';
    else if (bytes[0] === 0x1A && bytes[1] === 0x45) mime = 'video/webm';
    else if (bytes[0] === 0x25 && bytes[1] === 0x50) mime = 'application/pdf';
    else if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) mime = 'audio/mpeg';
    else if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) mime = 'audio/mpeg';
    else if (bytes[0] === 0x66 && bytes[1] === 0x4C && bytes[2] === 0x61 && bytes[3] === 0x43) mime = 'audio/flac';
    else if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) mime = 'audio/ogg';

    if (mime === 'application/octet-stream' && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const imageExts: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        svg: 'image/svg+xml',
        avif: 'image/avif',
        bmp: 'image/bmp',
      };
      const audioExts: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        flac: 'audio/flac',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
        m4a: 'audio/mp4',
        opus: 'audio/ogg',
        wma: 'audio/x-ms-wma',
      };
      const videoExts: Record<string, string> = {
        mp4: 'video/mp4',
        webm: 'video/webm',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        mkv: 'video/x-matroska',
        m4v: 'video/x-m4v',
      };
      const fileExts: Record<string, string> = {
        pdf: 'application/pdf',
        zip: 'application/zip',
        rar: 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain',
        json: 'application/json',
      };
      if (ext && imageExts[ext]) mime = imageExts[ext];
      else if (ext && videoExts[ext]) mime = videoExts[ext];
      else if (ext && audioExts[ext]) mime = audioExts[ext];
      else if (ext && fileExts[ext]) mime = fileExts[ext];
    }
    return mime;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private getAbortSignal(cacheKey: string): AbortSignal {
    const controller = new AbortController();
    this.fetchAbortControllers.set(cacheKey, controller);
    return controller.signal;
  }

  private addToMemoryCache(key: string, media: DecryptedMedia) {
    while (this.totalMemorySize + media.size > this.maxMemorySize || this.memoryCache.size >= this.maxItemCount) {
      this.evictLRU();
    }
    this.memoryCache.set(key, media);
    this.totalMemorySize += media.size;
  }

  private evictLRU() {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, media] of this.memoryCache) {
      if (media.lastAccessed < oldestTime) {
        oldestTime = media.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const media = this.memoryCache.get(oldestKey)!;
      try {
        URL.revokeObjectURL(media.blobUrl);
      } catch {}
      media.imageBitmap?.close();
      this.totalMemorySize -= media.size;
      this.memoryCache.delete(oldestKey);
    }
  }

  public async deleteByChatId(chatId: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const [key, media] of this.memoryCache) {
      if (media.chatId === chatId) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      const media = this.memoryCache.get(key)!;
      try {
        URL.revokeObjectURL(media.blobUrl);
      } catch {}
      media.imageBitmap?.close();
      this.totalMemorySize -= media.size;
      this.memoryCache.delete(key);
    }
    if (window.orbita?.mediaDeleteByChatId) {
      await window.orbita?.mediaDeleteByChatId(chatId);
    }
  }

  public clearMemoryCache() {
    for (const media of this.memoryCache.values()) {
      try {
        URL.revokeObjectURL(media.blobUrl);
      } catch {}
      media.imageBitmap?.close();
    }
    this.memoryCache.clear();
    this.totalMemorySize = 0;
  }

  public getStats() {
    return {
      memory: {
        count: this.memoryCache.size,
        totalSize: this.totalMemorySize,
        maxSize: this.maxMemorySize,
      },
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      pendingRequests: this.pendingRequests.size,
      activeDownloads: this.activeDownloads,
      queueLength: this.downloadQueue.length,
    };
  }
}

export const mediaManager = new MediaManager();