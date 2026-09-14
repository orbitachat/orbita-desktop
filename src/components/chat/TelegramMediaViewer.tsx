import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Download,
  RotateCw,
  MoreVertical,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Share2,
  Trash2,
  Copy,
  ExternalLink,
  Grid,
} from 'lucide-react';
import { useDecryptedMedia } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { arrayBufferToBase64 } from '../../utils/messageUtils';
import { useToastStore } from '../../store/useToastStore';
import { useChatStore } from '../../store/useChatStore';

const formatTelegramDate = (timestamp: number, lang: string = 'ru') => {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const timeStr = d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return lang === 'ru' ? `сегодня в ${timeStr}` : `today at ${timeStr}`;
  }
  if (isYesterday) {
    return lang === 'ru' ? `вчера в ${timeStr}` : `yesterday at ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
  return `${dateStr} в ${timeStr}`;
};

export interface MediaViewerItem {
  id: string;
  url: string;
  type: 'photo' | 'video' | 'gif' | 'image' | 'videos' | 'photos';
  directUrl?: string;
  chatId?: string;
  name?: string;
  mime?: string;
  sender?: string;
  time?: number;
  messageId?: string;
  messageIndex?: number;
  duration?: number;
  width?: number;
  height?: number;
  size?: number | string;
  caption?: string;
  isAlbum?: boolean;
  albumGroupId?: string;
  key?: string;
  sharedSecret?: string;
}

export interface TelegramMediaViewerProps {
  isOpen: boolean;
  items: MediaViewerItem[];
  initialIndex?: number;
  sharedSecret?: string;
  showCarouselAlways?: boolean;
  onClose: () => void;
  onGoToMessage?: (messageId: string) => void;
  onForwardMessage?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onOpenAllMedia?: () => void;
}

const formatVideoTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${pad(remMins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

/**
 * Thumbnail component for the bottom carousel strip
 */
const CarouselThumbnail = React.memo(({
  item,
  sharedSecret,
  isSelected,
  onClick,
}: {
  item: MediaViewerItem;
  sharedSecret?: string;
  isSelected: boolean;
  onClick: () => void;
}) => {
  const isDirect = Boolean(
    item.directUrl ||
    (item.url && (item.url.startsWith('blob:') || item.url.startsWith('data:') || item.url.startsWith('orbita-media:')))
  );
  const directSrc = item.directUrl || (isDirect ? item.url : null);
  const effectiveSecret = item.key || item.sharedSecret || sharedSecret;
  const { blobUrl } = useDecryptedMedia(
    directSrc ? null : item.url,
    effectiveSecret,
    item.name,
    undefined,
    item.chatId,
    item.messageId
  );
  const displaySrc = directSrc || blobUrl;

  const isVideoFormat = Boolean(
    item.type === 'video' ||
    item.type === 'videos' ||
    (displaySrc && (/\.mp4(\?.*)?$/i.test(displaySrc) || /\.webm(\?.*)?$/i.test(displaySrc) || displaySrc.startsWith('data:video/'))) ||
    (/\.mp4(\?.*)?$/i.test(item.url || '')) ||
    (item.mime && item.mime.startsWith('video/'))
  );

  return (
    <div
      onClick={onClick}
      style={{
        width: 48,
        height: 48,
        flexShrink: 0,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        backgroundColor: 'rgba(255,255,255,0.15)',
        outline: 'none',
        border: 'none',
        opacity: isSelected ? 1 : 0.5,
        filter: isSelected ? 'brightness(1)' : 'brightness(0.65)',
        transition: 'opacity 0.2s ease, filter 0.2s ease',
      }}
      className="hover:opacity-100 hover:brightness-100"
    >
      {displaySrc ? (
        isVideoFormat ? (
          <video
            src={displaySrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              try {
                if (e.currentTarget.currentTime === 0) {
                  e.currentTarget.currentTime = 0.001;
                }
              } catch {}
            }}
          />
        ) : (
          <img
            src={displaySrc}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
            draggable={false}
          />
        )
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
      )}
      {item.type !== 'gif' && (item.type === 'video' || item.type === 'videos') && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.25)',
          }}
        >
          <Play size={14} fill="white" color="white" />
        </div>
      )}
    </div>
  );
});

export const TelegramMediaViewer: React.FC<TelegramMediaViewerProps> = ({
  isOpen,
  items,
  initialIndex = 0,
  sharedSecret,
  showCarouselAlways = false,
  onClose,
  onGoToMessage,
  onForwardMessage,
  onDeleteMessage,
  onOpenAllMedia,
}) => {
  const { t, i18n } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [rotation, setRotation] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initPanX: number; initPanY: number } | null>(null);

  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Video Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVideoControlsHovered, setIsVideoControlsHovered] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  const resetIdleTimer = useCallback(() => {
    setAreControlsVisible(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setAreControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(() => {
    if (isOpen) {
      useChatStore.getState().setMediaViewerOpen(true);
      return () => {
        useChatStore.getState().setMediaViewerOpen(false);
      };
    } else {
      useChatStore.getState().setMediaViewerOpen(false);
    }
  }, [isOpen]);

  // Idle mouse detection to auto-hide UI buttons & labels
  useEffect(() => {
    if (!isOpen) return;
    setAreControlsVisible(true);
    resetIdleTimer();

    const handleGlobalMouseMove = () => {
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isOpen, resetIdleTimer]);

  const prevIsOpenRef = useRef(isOpen);
  const prevItemsRef = useRef(items);
  const prevInitialIndexRef = useRef(initialIndex);

  useEffect(() => {
    const isNewOpen = isOpen && !prevIsOpenRef.current;
    const isItemsChanged = items !== prevItemsRef.current;
    const isIndexChangedFromOutside = initialIndex !== prevInitialIndexRef.current;
    if (isOpen && (isNewOpen || isItemsChanged || isIndexChangedFromOutside)) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
      setRotation(0);
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
      setIsDragging(false);
      setShowOptionsMenu(false);
    }
    prevIsOpenRef.current = isOpen;
    prevItemsRef.current = items;
    prevInitialIndexRef.current = initialIndex;
  }, [isOpen, initialIndex, items]);

  // Reset zoom & pan when index changes
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [currentIndex]);

  // Ctrl + Mouse Wheel zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        resetIdleTimer();
        const delta = -e.deltaY * 0.0025;
        setZoomScale((prev) => {
          const next = Math.max(1, Math.min(15, prev + delta * prev));
          if (next <= 1) {
            setPanOffset({ x: 0, y: 0 });
            return 1;
          }
          return next;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen, resetIdleTimer]);

  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (zoomScale > 1 && e.button === 0) {
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initPanX: panOffset.x,
        initPanY: panOffset.y,
      };
    }
  };

  const handleGlobalMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setPanOffset({
        x: dragStartRef.current.initPanX + dx,
        y: dragStartRef.current.initPanY + dy,
      });
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleImageDoubleClick = () => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoomScale(2.5);
    }
  };

  const currentItem: MediaViewerItem | undefined = items[currentIndex];

  const isDirect = Boolean(
    currentItem?.directUrl ||
    (currentItem?.url && (
      currentItem.url.startsWith('blob:') ||
      currentItem.url.startsWith('data:') ||
      currentItem.url.startsWith('orbita-media:')
    ))
  );
  const directSrc = currentItem?.directUrl || (isDirect ? currentItem?.url : null);
  const effectiveSecret = currentItem?.key || currentItem?.sharedSecret || sharedSecret;
  const { blobUrl, blob } = useDecryptedMedia(
    directSrc ? null : (currentItem?.url || null),
    effectiveSecret,
    currentItem?.name,
    undefined,
    currentItem?.chatId,
    currentItem?.messageId
  );
  const displaySrc = directSrc || blobUrl;

  const isVideo = currentItem?.type === 'video' || currentItem?.type === 'videos';
  const isGif = currentItem?.type === 'gif';
  const isPhoto = !isVideo && !isGif;

  const isAlbumItem = Boolean(currentItem?.isAlbum && currentItem?.albumGroupId);
  const carouselItems = useMemo(() => {
    if (showCarouselAlways) return items;
    if (isAlbumItem && currentItem?.albumGroupId) {
      return items.filter((it) => it.albumGroupId === currentItem.albumGroupId);
    }
    return [];
  }, [showCarouselAlways, isAlbumItem, currentItem?.albumGroupId, items]);

  useEffect(() => {
    if (carouselRef.current && carouselItems.length > 0) {
      const activeItemIndex = carouselItems.findIndex((it) => it === currentItem || it.id === currentItem?.id);
      if (activeItemIndex !== -1) {
        const activeChild = carouselRef.current.children[activeItemIndex] as HTMLElement | undefined;
        if (activeChild) {
          activeChild.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }
  }, [currentIndex, carouselItems, currentItem]);

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    const timer = setTimeout(() => {
      const preloadIndices = [
        currentIndex + 1,
        currentIndex + 2,
        currentIndex + 3,
        currentIndex - 1,
        currentIndex - 2,
      ].filter((idx) => idx >= 0 && idx < items.length);

      preloadIndices.forEach((idx) => {
        const item = items[idx];
        const itemSecret = item?.key || item?.sharedSecret || sharedSecret;
        if (item && item.url && !item.url.startsWith('blob:') && !item.url.startsWith('data:')) {
          mediaManager.getMedia(item.url, itemSecret || '', item.name, undefined, item.messageId).catch(() => {});
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, currentIndex, items, sharedSecret]);

  // Keyboard navigation & controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      resetIdleTimer();
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          setCurrentIndex((idx) => idx - 1);
          setRotation(0);
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          setCurrentIndex((idx) => idx + 1);
          setRotation(0);
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        }
      } else if (e.key === ' ' && isVideo && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => { });
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, items.length, isVideo, onClose, resetIdleTimer]);

  // Click outside to close options menu
  useEffect(() => {
    if (!showOptionsMenu) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showOptionsMenu]);

  // Video duration & time listener
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(video.duration);
      }
    };
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [isVideo, displaySrc]);

  const handleDownload = useCallback(async () => {
    if (!displaySrc || !currentItem) return;
    const isAnimation = isGif || Boolean(currentItem.name && (currentItem.name.endsWith('.mp4') || currentItem.name.includes('animation') || currentItem.name.endsWith('.gif')));
    const rawName = currentItem.name || (isVideo || isAnimation ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`);
    const defaultName = isAnimation ? rawName.replace(/\.gif$/i, '.mp4') : rawName;

    const filters = (isVideo || isAnimation)
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mp4v', 'mpg4'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }, { name: 'All Files', extensions: ['*'] }];

    try {
      if (window.orbita && window.orbita.saveFileAs) {
        let arrayBuffer: ArrayBuffer | null = null;
        if (blob) {
          arrayBuffer = await blob.arrayBuffer();
        } else if (displaySrc.startsWith('blob:') || displaySrc.startsWith('data:')) {
          const response = await fetch(displaySrc);
          const fetchedBlob = await response.blob();
          arrayBuffer = await fetchedBlob.arrayBuffer();
        } else {
          const fileSecret = currentItem.key || currentItem.sharedSecret;
          if (fileSecret) {
            const item = await mediaManager.getMedia(displaySrc, fileSecret, defaultName);
            if (item && item.blobUrl) {
              const response = await fetch(item.blobUrl);
              const fetchedBlob = await response.blob();
              arrayBuffer = await fetchedBlob.arrayBuffer();
            }
          }
          if (!arrayBuffer) {
            const response = await fetch(displaySrc);
            const fetchedBlob = await response.blob();
            arrayBuffer = await fetchedBlob.arrayBuffer();
          }
        }
        if (arrayBuffer) {
          const uint8 = new Uint8Array(arrayBuffer);
          await window.orbita.saveFileAs(uint8, defaultName, filters);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to save file:', err);
    }
    const a = document.createElement('a');
    a.href = displaySrc;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [displaySrc, currentItem, isVideo, isGif, blob]);

  const handleCopyImage = useCallback(async () => {
    if (!displaySrc) return;
    try {
      let imageBlob = blob;
      if (!imageBlob) {
        const response = await fetch(displaySrc);
        imageBlob = await response.blob();
      }
      const arrayBuffer = await imageBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      if (window.orbita && window.orbita.copyImage) {
        await window.orbita.copyImage(base64);
        useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ [imageBlob.type || 'image/png']: imageBlob }),
      ]);
      useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  }, [displaySrc, blob, t]);

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => { });
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newTime = Number(e.target.value);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleCycleSpeed = () => {
    if (!videoRef.current) return;
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    videoRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => { });
      setIsFullscreen(false);
    }
  };

  // Pause background videos (no canvas freezing, keep it simple and performant like Signal)
  useEffect(() => {
    if (!isOpen) return;

    document.body.setAttribute('data-media-viewer-open', 'true');
    const pausedVideos = new Set<HTMLVideoElement>();

    const pauseBackgroundVideos = () => {
      const viewerRoot = document.getElementById('telegram-media-viewer-root');
      const allVideos = Array.from(document.querySelectorAll('#root video')) as HTMLVideoElement[];
      allVideos.forEach((v) => {
        if (viewerRoot && viewerRoot.contains(v)) return;
        if (!v.paused) {
          try {
            v.pause();
            pausedVideos.add(v);
          } catch {}
        }
      });
    };

    pauseBackgroundVideos();

    return () => {
      document.body.removeAttribute('data-media-viewer-open');
      pausedVideos.forEach((v) => {
        try {
          v.play().catch(() => {});
        } catch {}
      });
    };
  }, [isOpen]);

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    const orbita = (window as any).orbita;
    const checkMaximized = async () => {
      try {
        if (orbita?.isWindowMaximized) {
          const result = await orbita.isWindowMaximized();
          setIsWindowMaximized(result);
        }
      } catch { }
    };
    checkMaximized();

    let unsubscribe: (() => void) | undefined;
    try {
      if (orbita?.onWindowStateChange) {
        unsubscribe = orbita.onWindowStateChange((maximized: boolean) => {
          setIsWindowMaximized(maximized);
        });
      }
    } catch { }

    return () => {
      unsubscribe?.();
    };
  }, []);  if (!isOpen || !currentItem) return null;

  const typeLabel = isVideo ? t('mediaViewer.video', 'Видео') : isGif ? 'GIF' : t('mediaViewer.photo', 'Фотография');
  const dateStr = currentItem.time ? formatTelegramDate(currentItem.time, i18n.language) : '';
  const senderStr = currentItem.sender || '';

  return typeof document !== 'undefined' && createPortal(
    <div
      id="telegram-media-viewer-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(54, 54, 54, 0.8)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        overflow: 'hidden',
        cursor: areControlsVisible ? (zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default') : 'none',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes tgSpinner {
          to { transform: rotate(360deg); }
        }
        body[data-media-viewer-open="true"] #root * {
          animation-play-state: paused !important;
        }
      `}</style>
      {/* Telegram Media Viewer Window Title Bar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 8px',
          zIndex: 1000,
          background: 'transparent',
          opacity: areControlsVisible ? 1 : 0,
          pointerEvents: areControlsVisible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          // @ts-ignore
          WebkitAppRegion: areControlsVisible ? 'drag' : 'no-drag',
        }}
        onDoubleClick={() => {
          if (areControlsVisible) {
            try { ((window as any).orbita?.doubleClickTitleBar?.()); } catch { }
          }
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            // @ts-ignore
            WebkitAppRegion: 'no-drag',
          }}
        >
          {/* Minimize */}
          <button
            onClick={() => {
              try { ((window as any).orbita?.minimizeWindow?.()); } catch { }
            }}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            className="hover:bg-white/15 hover:text-white"
            aria-label={t('window.minimize', 'Свернуть')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 10H11" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
            </svg>
          </button>

          <button
            onClick={() => {
              try { ((window as any).orbita?.maximizeWindow?.()); } catch { }
            }}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            className="hover:bg-white/15 hover:text-white"
            aria-label={isWindowMaximized ? t('window.restore', 'Восстановить') : t('window.maximize', 'Развернуть')}
          >
            {isWindowMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.5 1.5H10.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
                <rect x="1.5" y="4.5" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>

          <button
            onClick={onClose}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            className="hover:bg-red-500/30 hover:text-red-300"
            aria-label={t('common.close', 'Закрыть')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </div>

      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
              setCurrentIndex((i) => i - 1);
              setRotation(0);
              setZoomScale(1);
              setPanOffset({ x: 0, y: 0 });
            }
          }}
          disabled={currentIndex === 0}
          style={{
            position: 'fixed',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            cursor: currentIndex > 0 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentIndex === 0 ? 0 : (isPhoto || areControlsVisible ? 1 : 0),
            pointerEvents: currentIndex > 0 && (isPhoto || areControlsVisible) ? 'auto' : 'none',
            transition: 'opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease',
            zIndex: 100,
            backgroundColor: 'transparent',
            color: 'rgba(255, 255, 255, 0.65)',
          }}
          onMouseEnter={(e) => {
            if (currentIndex > 0) {
              e.currentTarget.style.backgroundColor = 'rgba(65, 65, 70, 0.85)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
          }}
          aria-label={t('mediaViewer.previousPhoto', 'Предыдущее')}
        >
          <ChevronLeft size={26} strokeWidth={2.2} />
        </button>
      )}

      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (currentIndex < items.length - 1) {
              setCurrentIndex((i) => i + 1);
              setRotation(0);
              setZoomScale(1);
              setPanOffset({ x: 0, y: 0 });
            }
          }}
          disabled={currentIndex === items.length - 1}
          style={{
            position: 'fixed',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            cursor: currentIndex < items.length - 1 ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: currentIndex === items.length - 1 ? 0 : (isPhoto || areControlsVisible ? 1 : 0),
            pointerEvents: currentIndex < items.length - 1 && (isPhoto || areControlsVisible) ? 'auto' : 'none',
            transition: 'opacity 0.2s ease, background-color 0.15s ease, color 0.15s ease',
            zIndex: 100,
            backgroundColor: 'transparent',
            color: 'rgba(255, 255, 255, 0.65)',
          }}
          onMouseEnter={(e) => {
            if (currentIndex < items.length - 1) {
              e.currentTarget.style.backgroundColor = 'rgba(65, 65, 70, 0.85)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
          }}
          aria-label={t('mediaViewer.nextPhoto', 'Следующее')}
        >
          <ChevronRight size={26} strokeWidth={2.2} />
        </button>
      )}

      {/* Main Content Area */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          pointerEvents: 'none',
          padding: '40px 70px 100px 70px',
          boxSizing: 'border-box',
        }}
      >
        {displaySrc ? (
          isVideo ? (
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
                maxWidth: 'calc(100vw - 140px)',
                maxHeight: 'calc(100vh - 160px)',
              }}
              onMouseEnter={() => setIsVideoControlsHovered(true)}
              onMouseLeave={() => setIsVideoControlsHovered(false)}
            >
              <video
                ref={videoRef}
                src={displaySrc}
                autoPlay
                playsInline
                onClick={handleTogglePlay}
                style={{
                  maxWidth: 'calc(100vw - 140px)',
                  maxHeight: 'calc(100vh - 160px)',
                  objectFit: 'contain',
                  borderRadius: 4,
                  backgroundColor: '#000000',
                  cursor: 'pointer',
                  display: 'block',
                }}
              />

              {/* Center Play/Pause Overlay */}
              {(!isPlaying || isVideoControlsHovered) && (
                <button
                  onClick={handleTogglePlay}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.65)',
                    border: 'none',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s, transform 0.15s',
                  }}
                  className="hover:scale-105"
                >
                  {isPlaying ? <Pause size={30} fill="white" /> : <Play size={30} fill="white" style={{ marginLeft: 4 }} />}
                </button>
              )}

              {/* Telegram Desktop Style Video Control Pill Bar */}
              <div
                style={{
                  position: 'fixed',
                  bottom: carouselItems.length > 1 ? 82 : 72,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 'min(420px, calc(100vw - 48px))',
                  padding: '8px 16px',
                  backgroundColor: 'rgba(18, 18, 24, 0.94)',
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  color: '#ffffff',
                  opacity: areControlsVisible && (isVideoControlsHovered || !isPlaying) ? 1 : 0,
                  pointerEvents: areControlsVisible && (isVideoControlsHovered || !isPlaying) ? 'auto' : 'none',
                  transition: 'opacity 0.2s',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                  zIndex: 120,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Top Row: Volume, Progress Bar, Center Play/Pause, Fullscreen, Speed */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                  <button
                    onClick={handleToggleMute}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    style={{
                      flex: 1,
                      height: 4,
                      accentColor: 'var(--accent-color, #7C3AED)',
                      cursor: 'pointer',
                    }}
                  />

                  <button
                    onClick={handleTogglePlay}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    {isPlaying ? <Pause size={17} fill="white" /> : <Play size={17} fill="white" />}
                  </button>

                  <button
                    onClick={handleToggleFullscreen}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>

                  <button
                    onClick={handleCycleSpeed}
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: 3,
                      padding: '1px 5px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {playbackRate}x
                  </button>
                </div>

                {/* Bottom Row: Current time (left) and Remaining time (right) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums', padding: '0 2px' }}>
                  <span>{formatVideoTime(currentTime)}</span>
                  <span>-{formatVideoTime(Math.max(0, duration - currentTime))}</span>
                </div>
              </div>
            </div>
          ) : isGif ? (
            displaySrc && (
              displaySrc.toLowerCase().includes('.mp4') ||
              displaySrc.toLowerCase().includes('.webm') ||
              displaySrc.startsWith('data:video/') ||
              (currentItem?.name && /\.(mp4|webm)$/i.test(currentItem.name)) ||
              (currentItem?.mime && currentItem.mime.startsWith('video/'))
            ) ? (
              <video
                src={displaySrc}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  maxWidth: 'calc(100vw - 140px)',
                  maxHeight: 'calc(100vh - 140px)',
                  objectFit: 'contain',
                  borderRadius: 0,
                  pointerEvents: 'auto',
                  display: 'block',
                }}
              />
            ) : (
              <img
                src={displaySrc}
                alt=""
                style={{
                  maxWidth: 'calc(100vw - 140px)',
                  maxHeight: 'calc(100vh - 140px)',
                  objectFit: 'contain',
                  borderRadius: 0,
                  pointerEvents: 'auto',
                  display: 'block',
                }}
                draggable={false}
              />
            )
          ) : (
            <img
              key={displaySrc}
              src={displaySrc}
              alt=""
              decoding="async"
              loading="eager"
              style={{
                maxWidth: zoomScale > 1 ? 'none' : 'calc(100vw - 140px)',
                maxHeight: zoomScale > 1 ? 'none' : 'calc(100vh - 140px)',
                objectFit: 'contain',
                borderRadius: 0,
                transform: (rotation !== 0 || zoomScale > 1 || panOffset.x !== 0 || panOffset.y !== 0)
                  ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) rotate(${rotation}deg) scale(${zoomScale})`
                  : 'none',
                transition: 'none',
                cursor: areControlsVisible ? (zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default') : 'none',
                pointerEvents: 'auto',
                display: 'block',
                userSelect: 'none',
              }}
              onMouseDown={handleImageMouseDown}
              onDoubleClick={handleImageDoubleClick}
              draggable={false}
            />
          )
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                border: '3px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: '#ffffff',
                animation: 'tgSpinner 0.8s linear infinite',
              }}
            />
          </div>
        )}
      </div>

      {/* Telegram-style Bottom Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 70,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          opacity: areControlsVisible ? 1 : 0,
          pointerEvents: areControlsVisible ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          zIndex: 100,
        }}
      >
        {/* Left Side: Info & Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
            {items.length > 1 ? t('mediaViewer.counter', { type: typeLabel, current: currentIndex + 1, total: items.length }) : typeLabel}
          </span>
          <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.85)' }}>
            {senderStr ? `${senderStr} • ` : ''}{dateStr}
          </span>
        </div>

        {/* Center: Thumbnails Strip Carousel (only for albums or profile gallery) */}
        {carouselItems.length > 1 && (
          <div
            ref={carouselRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              maxWidth: 'min(500px, 50vw)',
              overflowX: 'auto',
              padding: '4px 0',
            }}
            className="no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {carouselItems.map((item) => {
              const globalIdx = items.indexOf(item);
              return (
                <CarouselThumbnail
                  key={item.id}
                  item={item}
                  sharedSecret={sharedSecret}
                  isSelected={globalIdx === currentIndex}
                  onClick={() => {
                    if (globalIdx !== -1) {
                      setCurrentIndex(globalIdx);
                      setRotation(0);
                      setZoomScale(1);
                      setPanOffset({ x: 0, y: 0 });
                    }
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Right Side: Action Icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 200, justifyContent: 'flex-end', position: 'relative' }}>
          {isPhoto && (
            <button
              onClick={handleRotate}
              style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
              className="hover:text-white hover:bg-white/15 transition-colors"
              aria-label={t('mediaViewer.rotate', 'Повернуть')}
            >
              <RotateCw size={19} />
            </button>
          )}

          <button
            onClick={handleDownload}
            style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
            className="hover:text-white hover:bg-white/15 transition-colors"
            aria-label={t('mediaViewer.save', 'Сохранить')}
          >
            <Download size={20} />
          </button>

          {/* More Options Button */}
          <button
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
            style={{ background: 'none', border: 'none', color: '#ffffff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))', cursor: 'pointer', padding: 6, borderRadius: '50%' }}
            className="hover:text-white hover:bg-white/15 transition-colors"
            aria-label={t('mediaViewer.options', 'Опции')}
          >
            <MoreVertical size={20} />
          </button>

          {/* Telegram-style Dropdown Menu */}
          {showOptionsMenu && (
            <div
              ref={optionsMenuRef}
              style={{
                position: 'absolute',
                top: 40,
                right: 0,
                backgroundColor: 'rgba(24, 26, 32, 0.95)',
                backdropFilter: 'blur(10px)',
                borderRadius: 8,
                padding: '4px 0',
                minWidth: 210,
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {currentItem.messageId && onGoToMessage && (
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onClose();
                    onGoToMessage(currentItem.messageId!);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="hover:bg-white/10 transition-colors"
                >
                  <ExternalLink size={16} />
                  <span>{t('mediaViewer.goToMessage', 'Перейти к сообщению')}</span>
                </button>
              )}

              {isPhoto && (
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    handleCopyImage();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="hover:bg-white/10 transition-colors"
                >
                  <Copy size={16} />
                  <span>{t('common.copy')}</span>
                </button>
              )}

              {currentItem.messageId && onForwardMessage && (
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onForwardMessage(currentItem.messageId!);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="hover:bg-white/10 transition-colors"
                >
                  <Share2 size={16} />
                  <span>{t('mediaViewer.forward', 'Переслать')}</span>
                </button>
              )}

              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  handleDownload();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
                className="hover:bg-white/10 transition-colors"
              >
                <Download size={16} />
                <span>{t('mediaViewer.saveAs', 'Сохранить как...')}</span>
              </button>

              {onOpenAllMedia && (
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onClose();
                    onOpenAllMedia();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="hover:bg-white/10 transition-colors"
                >
                  <Grid size={16} />
                  <span>{t('mediaViewer.allPhotos', 'Все фотографии')}</span>
                </button>
              )}

              {currentItem.messageId && onDeleteMessage && (
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onClose();
                    onDeleteMessage(currentItem.messageId!);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '13px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  className="hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 size={16} />
                  <span>{t('mediaViewer.delete', 'Удалить')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
