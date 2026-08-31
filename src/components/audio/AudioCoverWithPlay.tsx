// src/components/audio/AudioCoverWithPlay.tsx
import React from 'react';
import { Play, Pause, Download } from 'lucide-react';

interface AudioCoverWithPlayProps {
  cover: string | null;
  isPlayingTrack: boolean;
  size?: number;
  onClick?: () => void;
  state?: 'play' | 'pause' | 'download' | 'file';
  customIcon?: React.ReactNode;
}

export const AudioCoverWithPlay: React.FC<AudioCoverWithPlayProps> = ({
  cover,
  isPlayingTrack,
  size = 40,
  onClick,
  state = 'play',
  customIcon,
}) => {
  const iconSize = size * 0.5;

  const renderIcon = () => {
    if (customIcon) return customIcon;
    if (state === 'file') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={iconSize} height={iconSize}>
          <path fill="currentColor" d="M9 5.5A1.5 1.5 0 0 0 10.5 7H14v5.25A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2H9zm1-3.42c.27.083.517.23.72.433l2.767 2.767c.203.203.35.45.434.72H10.5a.5.5 0 0 1-.5-.5z"/>
        </svg>
      );
    }
    if (state === 'download') {
      return <Download size={iconSize} />;
    }
    if (isPlayingTrack) {
      return <Pause size={iconSize} fill="currentColor" strokeWidth={0} />;
    }
    return <Play size={iconSize} fill="currentColor" strokeWidth={0} style={{ transform: 'translateX(1px)' }} />;
  };

  return (
    <div
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        backgroundColor: cover ? 'transparent' : 'var(--accent-color)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {cover ? (
        <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {renderIcon()}
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
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#fff',
            pointerEvents: 'none',
          }}
        >
          {renderIcon()}
        </div>
      )}
    </div>
  );
};