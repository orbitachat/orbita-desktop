import { useEffect, useRef, useState, useCallback } from 'react';
import { useAudioStore } from '../../store/useAudioStore';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AudioQueueMenu } from './AudioQueueMenu';
import { AudioVolumePopover, AudioOrderPopover, AudioSpeedPopover } from './AudioControlsPopups';

export const GlobalAudioPlayer = () => {
  const { t } = useTranslation();
  const currentTrack = useAudioStore((state) => state.currentTrack);
  const isPlaying = useAudioStore((state) => state.isPlaying);
  const currentTime = useAudioStore((state) => state.currentTime);
  const duration = useAudioStore((state) => state.duration);
  const volume = useAudioStore((state) => state.volume);
  const repeat = useAudioStore((state) => state.repeat);
  const shuffle = useAudioStore((state) => state.shuffle);
  const isReverseOrder = useAudioStore((state) => state.isReverseOrder);
  const playbackRate = useAudioStore((state) => state.playbackRate);

  const seek = useAudioStore((state) => state.seek);
  const setSeeking = useAudioStore((state) => state.setSeeking);
  const pause = useAudioStore((state) => state.pause);
  const play = useAudioStore((state) => state.play);
  const next = useAudioStore((state) => state.next);
  const previous = useAudioStore((state) => state.previous);
  const toggleRepeat = useAudioStore((state) => state.toggleRepeat);
  const clearQueue = useAudioStore((state) => state.clearQueue);

  const progressRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ isDragging: boolean; percent: number; targetTime: number }>({
    isDragging: false,
    percent: 0,
    targetTime: 0,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Popups & Menus
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [isSpeedOpen, setIsSpeedOpen] = useState(false);

  const volumeBtnRef = useRef<HTMLButtonElement>(null);
  const orderBtnRef = useRef<HTMLButtonElement>(null);
  const speedBtnRef = useRef<HTMLButtonElement>(null);
  const volumeOpenTimerRef = useRef<NodeJS.Timeout | null>(null);
  const volumeCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const playerRef = useRef<HTMLDivElement>(null);

  const updateVisualProgress = useCallback((clientX: number) => {
    if (!progressRef.current || !duration || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const rawPercent = (clientX - rect.left) / rect.width;
    const clampedPercent = Math.max(0, Math.min(rawPercent, 1));
    const newTime = clampedPercent * duration;

    dragStateRef.current.percent = clampedPercent;
    dragStateRef.current.targetTime = newTime;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${clampedPercent * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = formatTime(newTime);
      }
    });
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    const newTime = percent * duration;
    seek(newTime);
  }, [duration, seek]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragStateRef.current.isDragging = true;
    setIsDragging(true);
    setSeeking(true);
    updateVisualProgress(e.clientX);
  }, [updateVisualProgress, setSeeking]);

  const handleProgressMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    updateVisualProgress(e.clientX);
  }, [updateVisualProgress]);

  const handleProgressMouseUp = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setSeeking(false);
    seek(dragStateRef.current.targetTime);
  }, [seek, setSeeking]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    e.stopPropagation();
    dragStateRef.current.isDragging = true;
    setIsDragging(true);
    setSeeking(true);
    updateVisualProgress(e.touches[0].clientX);
  }, [updateVisualProgress, setSeeking]);

  const handleProgressTouchMove = useCallback((e: TouchEvent) => {
    if (!dragStateRef.current.isDragging || !e.touches[0]) return;
    updateVisualProgress(e.touches[0].clientX);
  }, [updateVisualProgress]);

  const handleProgressTouchEnd = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setSeeking(false);
    seek(dragStateRef.current.targetTime);
  }, [seek, setSeeking]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleProgressMouseMove, { passive: true });
      window.addEventListener('mouseup', handleProgressMouseUp);
      window.addEventListener('touchmove', handleProgressTouchMove, { passive: true });
      window.addEventListener('touchend', handleProgressTouchEnd);
      window.addEventListener('touchcancel', handleProgressTouchEnd);
    } else {
      window.removeEventListener('mousemove', handleProgressMouseMove);
      window.removeEventListener('mouseup', handleProgressMouseUp);
      window.removeEventListener('touchmove', handleProgressTouchMove);
      window.removeEventListener('touchend', handleProgressTouchEnd);
      window.removeEventListener('touchcancel', handleProgressTouchEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleProgressMouseMove);
      window.removeEventListener('mouseup', handleProgressMouseUp);
      window.removeEventListener('touchmove', handleProgressTouchMove);
      window.removeEventListener('touchend', handleProgressTouchEnd);
      window.removeEventListener('touchcancel', handleProgressTouchEnd);
    };
  }, [isDragging, handleProgressMouseMove, handleProgressMouseUp, handleProgressTouchMove, handleProgressTouchEnd]);

  useEffect(() => {
    if (dragStateRef.current.isDragging) return;
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${pct}%`;
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = formatTime(currentTime);
    }
  }, [currentTime, duration]);

  // Close queue menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInsidePlayer = playerRef.current && playerRef.current.contains(target);
      const isInsideMenu = target.closest('.audio-queue-menu');
      if (isMenuOpen && !isInsidePlayer && !isInsideMenu) {
        setIsMenuOpen(false);
        setMenuPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const clearVolumeTimers = useCallback(() => {
    if (volumeOpenTimerRef.current) {
      clearTimeout(volumeOpenTimerRef.current);
      volumeOpenTimerRef.current = null;
    }
    if (volumeCloseTimerRef.current) {
      clearTimeout(volumeCloseTimerRef.current);
      volumeCloseTimerRef.current = null;
    }
  }, []);

  const handleVolumeMouseEnter = useCallback(() => {
    if (volumeCloseTimerRef.current) {
      clearTimeout(volumeCloseTimerRef.current);
      volumeCloseTimerRef.current = null;
    }
    if (!isVolumeOpen) {
      if (volumeOpenTimerRef.current) {
        clearTimeout(volumeOpenTimerRef.current);
      }
      volumeOpenTimerRef.current = setTimeout(() => {
        setIsVolumeOpen(true);
        setIsOrderOpen(false);
        setIsSpeedOpen(false);
      }, 250);
    }
  }, [isVolumeOpen]);

  const handleVolumeMouseLeave = useCallback(() => {
    if (volumeOpenTimerRef.current) {
      clearTimeout(volumeOpenTimerRef.current);
      volumeOpenTimerRef.current = null;
    }
    if (volumeCloseTimerRef.current) {
      clearTimeout(volumeCloseTimerRef.current);
    }
    volumeCloseTimerRef.current = setTimeout(() => {
      setIsVolumeOpen(false);
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      clearVolumeTimers();
    };
  }, [clearVolumeTimers]);

  if (!currentTrack) return null;

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isExpanded = isHovering || isDragging;

  const isInteractiveElement = (target: HTMLElement): boolean => {
    let el: HTMLElement | null = target;
    while (el && el !== playerRef.current) {
      if (el.tagName === 'BUTTON' || el.classList.contains('player-control')) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  const handleOpenMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (isInteractiveElement(target)) {
      return;
    }
    e.preventDefault();
    if (!playerRef.current) return;
    const rect = playerRef.current.getBoundingClientRect();
    const x = e.clientX;
    const y = rect.bottom + 10;
    setMenuPosition({ x, y });
    setIsMenuOpen(true);
    setIsVolumeOpen(false);
    setIsOrderOpen(false);
    setIsSpeedOpen(false);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (isInteractiveElement(target)) {
      return;
    }
    e.preventDefault();
    if (!playerRef.current) return;
    const rect = playerRef.current.getBoundingClientRect();
    const x = e.clientX;
    const y = rect.bottom + 10;
    setMenuPosition({ x, y });
    setIsMenuOpen(true);
    setIsVolumeOpen(false);
    setIsOrderOpen(false);
    setIsSpeedOpen(false);
  };

  const isOrderActive = isReverseOrder || shuffle;

  const isVoice = Boolean(
    currentTrack?.mediaType === 'voice' ||
    currentTrack?.message?.mediaType === 'voice' ||
    currentTrack?.title === 'Voice Message' ||
    currentTrack?.title === 'Голосовое сообщение' ||
    currentTrack?.title?.startsWith('voice_') ||
    currentTrack?.url?.includes('voice_')
  );

  let displayTitle = currentTrack?.title || '';
  let displayArtist = currentTrack?.artist || '';

  if (isVoice) {
    if (!displayArtist && currentTrack?.message?.sender) {
      displayArtist = currentTrack.message.sender;
    }
    displayTitle = t('chatWindow.voice_message', 'Голосовое сообщение');
  }

  return (
    <div
      ref={playerRef}
      className="global-audio-player flex-shrink-0 flex flex-col select-none"
      onClick={handleOpenMenu}
      onContextMenu={handleContextMenu}
      style={{
        height: '34px',
        backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.02))',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 10,
        willChange: 'transform',
        transform: 'translateZ(0)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <style>{`
        .global-audio-player,
        .global-audio-player * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
        }
      `}</style>
      <div className="flex items-center px-2 py-1 gap-1.5" style={{ height: '32px' }}>
        {/* Previous Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            previous();
          }}
          className="player-control"
          style={{
            width: 20,
            height: 20,
            color: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 8 8">
            <path fill="currentColor" d="M4 1L0 4l4 3zm0 3l4 3V1z"/>
          </svg>
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isPlaying) pause();
            else play();
          }}
          className="player-control"
          style={{
            width: 24,
            height: 24,
            color: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M14 19V5h4v14zm-8 0V5h4v14z"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
              <path fill="currentColor" d="M8 19V5l11 7z"/>
            </svg>
          )}
        </button>

        {/* Next Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          className="player-control"
          style={{
            width: 20,
            height: 20,
            color: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 8 8">
            <path fill="currentColor" d="M0 1v6l4-3zm4 3v3l4-3l-4-3z"/>
          </svg>
        </button>

        {/* Track Title & Artist */}
        <div
          className="flex flex-col min-w-0 flex-1 px-1 overflow-hidden select-none player-text cursor-pointer"
          style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
          <div className="font-medium text-xs truncate" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
            {displayArtist ? (
              <>
                <span style={{ color: 'var(--text-main)' }}>{displayArtist}</span>
                <span style={{ color: 'var(--text-main)' }}> – </span>
              </>
            ) : null}
            <span style={{ color: 'var(--text-main)' }}>{displayTitle}</span>
          </div>
        </div>

        {/* Time Display */}
        <div
          className="flex items-center px-1 text-[11px] tabular-nums select-none player-time"
          style={{ color: 'var(--text-dim)', userSelect: 'none' }}
        >
          <span ref={timeDisplayRef}>{formatTime(currentTime)}</span>
        </div>

        {/* Volume Button */}
        <button
          ref={volumeBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            clearVolumeTimers();
            setIsVolumeOpen(!isVolumeOpen);
            setIsOrderOpen(false);
            setIsSpeedOpen(false);
          }}
          className="player-control"
          style={{
            width: 22,
            height: 22,
            color: isVolumeOpen ? 'var(--accent-light)' : 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: isVolumeOpen ? 1 : 0.75,
            transition: 'color 0.15s, opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
            handleVolumeMouseEnter();
          }}
          onMouseLeave={(e) => {
            if (!isVolumeOpen) e.currentTarget.style.opacity = '0.75';
            handleVolumeMouseLeave();
          }}
        >
          {volume === 0 ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <line x1="23" y1="9" x2="17" y2="15"/>
              <line x1="17" y1="9" x2="23" y2="15"/>
            </svg>
          ) : volume < 0.5 ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          )}
        </button>

        {/* Playback Order Button */}
        <button
          ref={orderBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setIsOrderOpen(!isOrderOpen);
            setIsVolumeOpen(false);
            setIsSpeedOpen(false);
          }}
          className="player-control"
          style={{
            width: 22,
            height: 22,
            color: isOrderActive || isOrderOpen ? 'var(--accent-light)' : 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: isOrderActive || isOrderOpen ? 1 : 0.75,
            transition: 'color 0.15s, opacity 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { if (!isOrderActive && !isOrderOpen) e.currentTarget.style.opacity = '0.75'; }}
        >
          {shuffle ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 3 21 7 17 11"/>
              <line x1="21" y1="7" x2="9" y2="7"/>
              <polyline points="7 21 3 17 7 13"/>
              <line x1="3" y1="17" x2="15" y2="17"/>
            </svg>
          )}
        </button>

        {/* Repeat Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleRepeat();
          }}
          className="player-control"
          style={{
            width: 22,
            height: 22,
            color: repeat !== 'none' ? 'var(--accent-light)' : 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: repeat !== 'none' ? 1 : 0.6,
            transition: 'color 0.15s, opacity 0.15s',
            position: 'relative',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { if (repeat === 'none') e.currentTarget.style.opacity = '0.6'; }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          {repeat === 'one' && (
            <span
              style={{
                position: 'absolute',
                top: '0px',
                right: '1px',
                fontSize: '9px',
                fontWeight: 700,
                lineHeight: 1,
                color: 'var(--accent-light)',
                textShadow: '0 0 2px rgba(0,0,0,0.8)',
              }}
            >
              1
            </span>
          )}
        </button>

        {/* Playback Speed Button */}
        <button
          ref={speedBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setIsSpeedOpen(!isSpeedOpen);
            setIsVolumeOpen(false);
            setIsOrderOpen(false);
          }}
          className="player-control"
          style={{
            height: '18px',
            padding: '0 2px',
            borderTop: `1px dashed ${playbackRate !== 1 || isSpeedOpen ? 'var(--accent-light)' : 'var(--text-dim)'}`,
            borderBottom: `1px dashed ${playbackRate !== 1 || isSpeedOpen ? 'var(--accent-light)' : 'var(--text-dim)'}`,
            borderLeft: 'none',
            borderRight: 'none',
            background: 'none',
            color: playbackRate !== 1 || isSpeedOpen ? 'var(--accent-light)' : 'var(--text-dim)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '-0.2px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: playbackRate !== 1 || isSpeedOpen ? 1 : 0.75,
            transition: 'color 0.15s, opacity 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { if (playbackRate === 1 && !isSpeedOpen) e.currentTarget.style.opacity = '0.75'; }}
        >
          {playbackRate === 1 ? '1X' : `${playbackRate.toFixed(1)}X`}
        </button>

        {/* Close / Clear Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearQueue();
          }}
          className="player-control"
          style={{
            width: 20,
            height: 20,
            color: 'var(--text-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M6.4 19L5 17.6l5.6-5.6L5 6.4L6.4 5l5.6 5.6L17.6 5L19 6.4L13.4 12l5.6 5.6l-1.4 1.4l-5.6-5.6z"/>
          </svg>
        </button>
      </div>

      {/* Progress Bar Hover / Drag Area */}
      <div
        ref={progressRef}
        onClick={handleProgressClick}
        onMouseDown={handleProgressMouseDown}
        onTouchStart={handleProgressTouchStart}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '7px',
          display: 'flex',
          alignItems: 'flex-end',
          cursor: 'pointer',
          zIndex: 5,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: isExpanded ? '7px' : '2px',
            backgroundColor: 'var(--surface-muted)',
            transition: 'height 0.18s ease-out',
            borderRadius: 0,
            willChange: isExpanded ? 'height' : 'auto',
          }}
        >
          <div
            ref={progressFillRef}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '100%',
              width: `${progress}%`,
              backgroundColor: 'var(--accent-color)',
              transition: 'none',
              borderRadius: 0,
              willChange: 'width',
            }}
          />
        </div>
      </div>

      {/* Volume Popover */}
      {isVolumeOpen && (
        <AudioVolumePopover
          anchorRect={volumeBtnRef.current?.getBoundingClientRect() || null}
          onClose={() => {
            clearVolumeTimers();
            setIsVolumeOpen(false);
          }}
          onMouseEnter={handleVolumeMouseEnter}
          onMouseLeave={handleVolumeMouseLeave}
        />
      )}

      {/* Order Popover */}
      {isOrderOpen && (
        <AudioOrderPopover
          anchorRect={orderBtnRef.current?.getBoundingClientRect() || null}
          onClose={() => setIsOrderOpen(false)}
        />
      )}

      {/* Speed Popover */}
      {isSpeedOpen && (
        <AudioSpeedPopover
          anchorRect={speedBtnRef.current?.getBoundingClientRect() || null}
          onClose={() => setIsSpeedOpen(false)}
        />
      )}

      {/* Queue Menu Portal */}
      {isMenuOpen && menuPosition && createPortal(
        <AudioQueueMenu
          position={menuPosition}
          onClose={() => {
            setIsMenuOpen(false);
            setMenuPosition(null);
          }}
        />,
        document.body
      )}
    </div>
  );
};