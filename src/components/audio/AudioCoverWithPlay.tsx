import React from 'react';
import { Play, Pause, ArrowDown, X } from 'lucide-react';

export type AudioCoverState = 'play' | 'pause' | 'download' | 'downloading' | 'uploading' | 'file';

interface AudioCoverWithPlayProps {
  cover: string | null;
  isPlayingTrack?: boolean;
  size?: number;
  onClick?: () => void;
  onCancel?: () => void;
  state?: AudioCoverState;
  progress?: number;
  customIcon?: React.ReactNode;
  isOwn?: boolean;
  ariaLabel?: string;
}

export const AudioCoverWithPlay: React.FC<AudioCoverWithPlayProps> = ({
  cover,
  isPlayingTrack,
  size = 40,
  onClick,
  onCancel,
  state = 'play',
  progress,
  customIcon,
  isOwn = false,
  ariaLabel,
}) => {
  const iconSize = Math.round(size * 0.42);
  const strokeW = size >= 48 ? 3 : 2.5;
  const radius = Math.max(2, size / 2 - 4.5);
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0.04, Math.min(1, typeof progress === 'number' && isFinite(progress) ? progress : 0.08));
  const dashOffset = circumference * (1 - clampedProgress);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'uploading' || state === 'downloading') {
      if (onCancel) {
        onCancel();
        return;
      }
    }
    if (onClick) {
      onClick();
    }
  };

  const renderContent = () => {
    if (state === 'uploading' || state === 'downloading') {
      return (
        <>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transform: 'rotate(-90deg)',
            }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth={strokeW}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#ffffff"
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{
                willChange: 'stroke-dashoffset',
                transform: 'translateZ(0)',
                transition: 'stroke-dashoffset 0.16s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <X size={Math.round(size * 0.38)} strokeWidth={2.4} />
          </div>
        </>
      );
    }

    if (state === 'download') {
      return (
        <>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.32)"
              strokeWidth={2}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <ArrowDown size={Math.round(size * 0.44)} strokeWidth={2.3} />
          </div>
        </>
      );
    }

    if (customIcon) return customIcon;

    if (state === 'file') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={iconSize} height={iconSize}>
          <path fill="currentColor" d="M9 5.5A1.5 1.5 0 0 0 10.5 7H14v5.25A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2H9zm1-3.42c.27.083.517.23.72.433l2.767 2.767c.203.203.35.45.434.72H10.5a.5.5 0 0 1-.5-.5z"/>
        </svg>
      );
    }

    if (isPlayingTrack || state === 'pause') {
      return <Pause size={iconSize} fill="currentColor" strokeWidth={0} />;
    }

    return <Play size={iconSize} fill="currentColor" strokeWidth={0} style={{ transform: 'translateX(1px)' }} />;
  };

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      onClick={handleClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        backgroundColor: cover ? 'transparent' : (isOwn ? 'rgba(255, 255, 255, 0.22)' : 'var(--accent-color, #7C3AED)'),
        cursor: 'pointer',
      }}
    >
      {cover ? (
        <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {renderContent()}
        </div>
      )}
      {cover && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            color: '#fff',
          }}
        >
          {renderContent()}
        </div>
      )}
    </div>
  );
};