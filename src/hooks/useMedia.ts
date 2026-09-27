// src/hooks/useMedia.ts
import { useEffect, useState, useRef } from 'react';
import { mediaManager } from '../services/mediaManager';

export function useMedia(
  url: string | null,
  sharedSecret: string | undefined,
  fileName?: string,
  chatId?: string,
  messageId?: string
) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imageBitmap, setImageBitmap] = useState<ImageBitmap | null>(null);
  const [loading, setLoading] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!url || !sharedSecret) {
      setBlobUrl(null);
      setImageBitmap(null);
      return;
    }

    cancelledRef.current = false;

    const loadMedia = async () => {
      if (cancelledRef.current) return;
      setLoading(true);
      try {
        const media = await mediaManager.getMedia(url, sharedSecret, fileName, chatId, messageId);
        if (cancelledRef.current) return;
        setBlobUrl(media.blobUrl);
        setImageBitmap(media.imageBitmap);
      } catch (err) {
        console.error('Failed to load media:', err);
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    };

    if (elementRef.current) {
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadMedia();
          observerRef.current?.disconnect();
        }
      }, { threshold: 0.1 });
      observerRef.current.observe(elementRef.current);
    } else {
      loadMedia();
    }

    return () => {
      cancelledRef.current = true;
      observerRef.current?.disconnect();
    };
  }, [url, sharedSecret, fileName, chatId, messageId]);

  return { blobUrl, imageBitmap, loading, ref: elementRef };
}