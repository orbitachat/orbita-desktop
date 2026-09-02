// src/components/audio/AudioControlsPopups.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAudioStore } from '../../store/useAudioStore';
import { useTranslation } from 'react-i18next';

interface PopupProps {
  anchorRect: DOMRect | null;
  onClose: () => void;
}

// ----------------------------------------------------
interface AudioVolumePopoverProps extends PopupProps {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const AudioVolumePopover: React.FC<AudioVolumePopoverProps> = ({ anchorRect, onClose, onMouseEnter, onMouseLeave }) => {
  const volume = useAudioStore((s) => s.volume);
  const setVolume = useAudioStore((s) => s.setVolume);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isMouseInsideRef = useRef(false);

  // Close on outside click
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  const updateVolumeFromY = useCallback((clientY: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const height = rect.height;
    const diff = rect.bottom - clientY;
    const newVol = Math.max(0, Math.min(1, diff / height));
    setVolume(newVol);
  }, [setVolume]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateVolumeFromY(e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    setIsDragging(true);
    updateVolumeFromY(e.touches[0].clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateVolumeFromY(e.clientY);
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      if (!isMouseInsideRef.current) {
        onMouseLeave?.();
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) updateVolumeFromY(e.touches[0].clientY);
    };
    const handleTouchEnd = () => {
      setIsDragging(false);
      if (!isMouseInsideRef.current) {
        onMouseLeave?.();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, updateVolumeFromY, onMouseLeave]);

  if (!anchorRect) return null;

  const left = anchorRect.left + anchorRect.width / 2 - 16;
  const top = anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={popoverRef}
      className="audio-controls-popover select-none"
      onMouseEnter={() => {
        isMouseInsideRef.current = true;
        onMouseEnter?.();
      }}
      onMouseLeave={() => {
        isMouseInsideRef.current = false;
        if (!isDragging) {
          onMouseLeave?.();
        }
      }}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: '32px',
        height: '110px',
        backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        .audio-controls-popover,
        .audio-controls-popover * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
        }
      `}</style>
      <div
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          position: 'relative',
          width: '4px',
          height: '84px',
          backgroundColor: 'var(--surface-muted, rgba(255,255,255,0.15))',
          borderRadius: '2px',
          cursor: 'pointer',
        }}
      >
        {/* Fill */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: `${volume * 100}%`,
            backgroundColor: 'var(--accent-color, #7C3AED)',
            borderRadius: '2px',
          }}
        />
        {/* Thumb */}
        <div
          style={{
            position: 'absolute',
            bottom: `calc(${volume * 100}% - 5px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-light, #a995ec)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}
        />
      </div>
    </div>,
    document.body
  );
};

// ----------------------------------------------------
// 2. ORDER / SHUFFLE POPOVER
// ----------------------------------------------------
export const AudioOrderPopover: React.FC<PopupProps> = ({ anchorRect, onClose }) => {
  const { t } = useTranslation();
  const isReverseOrder = useAudioStore((s) => s.isReverseOrder);
  const shuffle = useAudioStore((s) => s.shuffle);
  const toggleReverseOrder = useAudioStore((s) => s.toggleReverseOrder);
  const toggleShuffle = useAudioStore((s) => s.toggleShuffle);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  if (!anchorRect) return null;

  const width = 150;
  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
  if (left < 10) left = 10;
  const top = anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={popoverRef}
      className="audio-controls-popover select-none"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        border: 'none',
        padding: '4px 0',
        zIndex: 1000,
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Reverse order */}
      <button
        onClick={() => {
          toggleReverseOrder();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '7px 12px',
          borderRadius: 0,
          backgroundColor: isReverseOrder ? 'var(--surface-container-soft, rgba(255,255,255,0.06))' : 'transparent',
          border: 'none',
          color: isReverseOrder ? 'var(--accent-light, #a995ec)' : 'var(--text-main)',
          fontSize: '13px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!isReverseOrder) e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255,255,255,0.04))';
        }}
        onMouseLeave={(e) => {
          if (!isReverseOrder) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="17 3 21 7 17 11"/>
          <line x1="21" y1="7" x2="9" y2="7"/>
          <polyline points="7 21 3 17 7 13"/>
          <line x1="3" y1="17" x2="15" y2="17"/>
        </svg>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('audioPlayer.reverse_order', 'Обратный')}
        </span>
        {isReverseOrder && (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>

      {/* Shuffle */}
      <button
        onClick={() => {
          toggleShuffle();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '7px 12px',
          borderRadius: 0,
          backgroundColor: shuffle ? 'var(--surface-container-soft, rgba(255,255,255,0.06))' : 'transparent',
          border: 'none',
          color: shuffle ? 'var(--accent-light, #a995ec)' : 'var(--text-main)',
          fontSize: '13px',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          transition: 'background 0.15s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!shuffle) e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255,255,255,0.04))';
        }}
        onMouseLeave={(e) => {
          if (!shuffle) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="16 3 21 3 21 8"/>
          <line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/>
          <line x1="15" y1="15" x2="21" y2="21"/>
          <line x1="4" y1="4" x2="9" y2="9"/>
        </svg>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t('audioPlayer.shuffle', 'Случайный')}
        </span>
        {shuffle && (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>
    </div>,
    document.body
  );
};

// ----------------------------------------------------
// 3. PLAYBACK SPEED POPOVER
// ----------------------------------------------------
const SPEED_PRESETS = [
  { rate: 0.5, labelKey: 'audioPlayer.speed_slow', defaultLabel: 'Медленно', display: '0.5x' },
  { rate: 1.0, labelKey: 'audioPlayer.speed_default', defaultLabel: 'По умолчанию', display: '1.0x' },
  { rate: 1.2, labelKey: 'audioPlayer.speed_accelerated', defaultLabel: 'Ускоренно', display: '1.2x' },
  { rate: 1.5, labelKey: 'audioPlayer.speed_fast', defaultLabel: 'Быстро', display: '1.5x' },
  { rate: 1.7, labelKey: 'audioPlayer.speed_very_fast', defaultLabel: 'Очень быстро', display: '1.7x' },
  { rate: 2.0, labelKey: 'audioPlayer.speed_super_fast', defaultLabel: 'Сверхбыстро', display: '2x' },
];

export const AudioSpeedPopover: React.FC<PopupProps> = ({ anchorRect, onClose }) => {
  const { t } = useTranslation();
  const playbackRate = useAudioStore((s) => s.playbackRate);
  const setPlaybackRate = useAudioStore((s) => s.setPlaybackRate);

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  if (!anchorRect) return null;

  const width = 200;
  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
  if (left < 10) left = 10;
  const top = anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={popoverRef}
      className="audio-controls-popover select-none"
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        border: 'none',
        padding: '10px 0 4px 0',
        zIndex: 1000,
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Slider Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 10px 12px', gap: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '32px', color: 'var(--text-main)' }}>
          {playbackRate.toFixed(1)}x
        </span>
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--accent-color, #7C3AED)',
              cursor: 'pointer',
              height: '4px',
              borderRadius: '2px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--border-color, rgba(255,255,255,0.06))', margin: '0 0 4px 0' }} />

      {/* Presets with edge-to-edge highlight */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {SPEED_PRESETS.map((preset) => {
          const isActive = Math.abs(playbackRate - preset.rate) < 0.04;
          return (
            <button
              key={preset.rate}
              onClick={() => {
                setPlaybackRate(preset.rate);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderRadius: 0,
                backgroundColor: isActive ? 'var(--surface-container-soft, rgba(255,255,255,0.06))' : 'transparent',
                border: 'none',
                color: isActive ? 'var(--accent-light, #a995ec)' : 'var(--text-main)',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-container-soft, rgba(255,255,255,0.04))';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ width: '36px', fontSize: '12px', color: 'var(--text-dim)' }}>
                {preset.display}
              </span>
              <span style={{ flex: 1, fontWeight: isActive ? 500 : 400 }}>
                {t(preset.labelKey, preset.defaultLabel)}
              </span>
              {isActive && (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
