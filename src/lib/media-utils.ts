import { useMemo, useEffect, useState, useCallback } from 'react';
import { mediaManager } from '../services/mediaManager';

export async function deriveFileKey(sharedSecret: string): Promise<CryptoKey> {
  const cleanHex = sharedSecret.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('orbita-file-key'),
      info: new TextEncoder().encode('file-encryption'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function decryptFile(encryptedData: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
  if (window.orbita?.rustDecryptFile) {
    try {
      const decrypted = await window.orbita.rustDecryptFile(encryptedData, keyHex);
      if (decrypted) {
        return (decrypted.buffer as ArrayBuffer).slice(
          decrypted.byteOffset,
          decrypted.byteOffset + decrypted.byteLength
        );
      }
    } catch (e) {
      console.warn('[media-utils] Rust decryptFile fallback:', e);
    }
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
    const key = await deriveFileKey(keyHex);
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    return encryptedData;
  }
}

export function getOrbitaMediaUrl(
  url: string | null,
  sharedSecret?: string,
  chatId?: string,
  messageId?: string,
  fileName?: string,
  mime?: string
): string | null {
  if (!url || typeof url !== 'string') return null;
  const clean = url.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
  if (!clean || clean === 'undefined' || clean === 'null' || clean.startsWith('undefined') || clean.startsWith('null')) {
    return null;
  }
  if (clean.startsWith('blob:') || clean.startsWith('data:') || clean.startsWith('orbita-media:')) {
    return clean;
  }

  const isElectron = typeof window !== 'undefined' && (Boolean((window as any).__ELECTRON_RENDERER__) || Boolean((window as any).orbita));
  if (isElectron) {
    const params = new URLSearchParams();
    params.set('url', clean);
    if (sharedSecret) params.set('secret', sharedSecret);
    if (chatId) params.set('chatId', chatId);
    if (messageId) params.set('messageId', messageId);
    if (fileName) params.set('filename', fileName);
    if (mime) params.set('mime', mime);
    return `orbita-media://media?${params.toString()}`;
  }

  const cached = mediaManager.getCachedMedia(clean, sharedSecret || '');
  if (cached?.blobUrl) {
    return cached.blobUrl;
  }

  return null;
}

export function useDecryptedMedia(
  url: string | null,
  sharedSecret: string | undefined,
  hintFileName?: string,
  _forcedMime?: string,
  chatId?: string,
  messageId?: string
): { blobUrl: string | null; blob: Blob | null; load: () => Promise<void> } {
  const cleanUrl = useMemo(() => {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.replace(/^\[(?:Photo|GIF|Sticker|Video|Audio|File)\]\s*/i, '').trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.startsWith('undefined') || trimmed.startsWith('null')) {
      return null;
    }
    return trimmed;
  }, [url]);

  const streamUrl = useMemo(() => {
    if (!cleanUrl) return null;
    if (cleanUrl.startsWith('blob:') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('orbita-media:')) return cleanUrl;
    return getOrbitaMediaUrl(cleanUrl, sharedSecret, chatId, messageId, hintFileName, _forcedMime);
  }, [cleanUrl, sharedSecret, chatId, messageId, hintFileName, _forcedMime]);

  const [result, setResult] = useState<{ blobUrl: string | null; blob: Blob | null; load: () => Promise<void> }>(() => ({
    blobUrl: streamUrl && (streamUrl.startsWith('orbita-media:') || streamUrl.startsWith('blob:') || streamUrl.startsWith('data:'))
      ? streamUrl
      : (cleanUrl ? mediaManager.getCachedMedia(cleanUrl, sharedSecret || '')?.blobUrl || null : null),
    blob: null,
    load: async () => {},
  }));

  const loadMedia = useCallback(async () => {
    if (!cleanUrl) {
      setResult({ blobUrl: null, blob: null, load: async () => {} });
      return;
    }

    if (streamUrl && streamUrl.startsWith('orbita-media:')) {
      setResult({ blobUrl: streamUrl, blob: null, load: async () => {} });
      return;
    }

    try {
      const media = await mediaManager.getMedia(cleanUrl, sharedSecret || '', hintFileName, chatId, messageId);
      setResult({ blobUrl: media.blobUrl, blob: null, load: loadMedia });
    } catch {
      setResult({ blobUrl: null, blob: null, load: loadMedia });
    }
  }, [cleanUrl, streamUrl, sharedSecret, hintFileName, chatId, messageId]);

  useEffect(() => {
    if (!cleanUrl) {
      setResult({ blobUrl: null, blob: null, load: async () => {} });
      return;
    }

    if (streamUrl && streamUrl.startsWith('orbita-media:')) {
      setResult({ blobUrl: streamUrl, blob: null, load: async () => {} });
      return;
    }

    loadMedia();
  }, [cleanUrl, streamUrl, loadMedia]);

  return result;
}