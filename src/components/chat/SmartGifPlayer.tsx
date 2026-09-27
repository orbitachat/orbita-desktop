import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { useAppVisibility } from '../../utils/appVisibility';

interface SmartGifPlayerProps {
  blobUrl: string | null;
  width?: number;
  height?: number;
  clampedAspect?: number;
  bubbleRadius?: string | number;
  timeNode?: React.ReactNode;
  isPaused?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent, blobUrl: string) => void;
}

class LruPosterMap {
  private max = 30;
  private map = new Map<string, string>();
  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }
  set(key: string, val: string) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first) this.map.delete(first);
    }
    this.map.set(key, val);
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
}

const isGifImage = (url: string | null): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith('data:image/gif') || lower.includes('image/gif')) return true;
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('video/')) return false;
  if (lower.includes('.gif')) return true;
  return false;
};

const gifPosterCache = new LruPosterMap();

export const SmartGifPlayer = memo(({
  blobUrl,
  width: msgWidth,
  clampedAspect = 1.333,
  bubbleRadius = '12px',
  timeNode,
  isPaused = false,
  onClick,
  onContextMenu,
}: SmartGifPlayerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(() => (blobUrl && gifPosterCache.get(blobUrl)) || null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (!blobUrl) {
      setPosterUrl(null);
      return;
    }

    if (gifPosterCache.has(blobUrl)) {
      setPosterUrl(gifPosterCache.get(blobUrl)!);
      return;
    }

    let isCancelled = false;
    const isExplicitImg = isGifImage(blobUrl);

    if (isExplicitImg) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = blobUrl;

      img.onload = () => {
        if (isCancelled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(img.naturalWidth || 300, 600);
          canvas.height = Math.min(img.naturalHeight || 200, 600);
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            gifPosterCache.set(blobUrl, dataUrl);
            if (!isCancelled) {
              setPosterUrl(dataUrl);
            }
          }
        } catch {
        }
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [blobUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isVideo = useMemo(() => {
    if (!blobUrl) return true;
    if (isGifImage(blobUrl)) {
      return false;
    }
    return true;
  }, [blobUrl]);

  const isMediaViewerOpen = useChatStore((s) => s.isMediaViewerOpen);
  const isAppVisible = useAppVisibility();
  const shouldAnimate = inView && !isPaused && !isMediaViewerOpen && !!blobUrl && isAppVisible;

  const containerWidth = msgWidth && msgWidth > 0 ? `${Math.min(msgWidth, 440)}px` : '320px';

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        if (blobUrl) onContextMenu?.(e, blobUrl);
      }}
      style={{
        width: containerWidth,
        maxWidth: '100%',
        minWidth: '220px',
        aspectRatio: `${clampedAspect}`,
        maxHeight: '380px',
        borderRadius: bubbleRadius,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {shouldAnimate ? (
        isVideo ? (
          <video
            src={blobUrl!}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ display: 'block', pointerEvents: 'none' }}
          />
        ) : (
          <img
            src={blobUrl!}
            alt="GIF"
            className="w-full h-full object-cover"
            draggable={false}
            style={{ display: 'block' }}
          />
        )
      ) : isVideo ? (
        <video
          src={blobUrl || undefined}
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ display: 'block', pointerEvents: 'none' }}
        />
      ) : (
        <img
          src={posterUrl || blobUrl || undefined}
          alt="GIF"
          className="w-full h-full object-cover"
          draggable={false}
          style={{ display: 'block', opacity: (posterUrl || blobUrl) ? 1 : 0, transition: 'opacity 0.15s' }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: '1.2',
          zIndex: 2,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        GIF
      </div>

      {timeNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '6px',
            padding: '2px 6px',
            color: '#ffffff',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            lineHeight: 1,
            zIndex: 2,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {timeNode}
        </div>
      )}
    </div>
  );
});
