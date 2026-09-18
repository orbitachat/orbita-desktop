import { useState, useMemo } from 'react';

export const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #84cc16, #10b981)',
  'linear-gradient(135deg, #fbbf24, #f97316)',
  'linear-gradient(135deg, #f87171, #ef4444)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #a855f7, #ec4899)',
  'linear-gradient(135deg, #6366f1, #a855f7)',
  'linear-gradient(135deg, #3b82f6, #6366f1)',
  'linear-gradient(135deg, #475569, #1e293b)',
];

export const getAvatarGradient = (seed?: string | null): string => {
  if (!seed || !seed.trim()) {
    const randomIndex = Math.floor(Math.random() * AVATAR_GRADIENTS.length);
    return AVATAR_GRADIENTS[randomIndex];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
};

interface AvatarProps {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Avatar = ({ src, alt = '', className = '', style }: AvatarProps) => {
  const [videoError, setVideoError] = useState(false);

  const cleanSrc = useMemo(() => {
    if (!src || typeof src !== 'string') return null;
    const trimmed = src.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null' || trimmed.startsWith('undefined') || trimmed.startsWith('null')) {
      return null;
    }
    return trimmed;
  }, [src]);

  const cleanAlt = useMemo(() => {
    if (!alt || typeof alt !== 'string') return '';
    const trimmed = alt.trim();
    if (trimmed === 'undefined' || trimmed === 'null') return '';
    return trimmed;
  }, [alt]);

  const isVideo = useMemo(() => {
    if (!cleanSrc || videoError) return false;
    const ext = cleanSrc.split('.').pop()?.toLowerCase();
    return ['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext || '');
  }, [cleanSrc, videoError]);

  const gradient = useMemo(() => getAvatarGradient(cleanAlt), [cleanAlt]);

  const computedFontSize = useMemo(() => {
    if (style?.fontSize) return style.fontSize;
    if (className.includes('w-24') || className.includes('w-[100px]') || className.includes('w-28') || className.includes('w-32')) {
      return '44px';
    }
    if (className.includes('w-16') || className.includes('w-20')) {
      return '28px';
    }
    if (className.includes('w-12')) {
      return '22px';
    }
    if (className.includes('w-10')) {
      return '19px';
    }
    if (className.includes('w-[20px]') || className.includes('w-5')) {
      return '8.5px';
    }
    if (className.includes('w-6') || className.includes('w-[24px]')) {
      return '10px';
    }
    if (className.includes('w-8') || className.includes('w-7')) {
      return '12px';
    }
    return '1.35rem';
  }, [className, style?.fontSize]);

  const noDragStyle: React.CSSProperties = {
    userSelect: 'none',
    WebkitUserSelect: 'none',
    ...({ WebkitUserDrag: 'none' } as any),
  };

  if (!cleanSrc || (isVideo && videoError)) {
    return (
      <div
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`flex items-center justify-center rounded-full flex-shrink-0 select-none ${className}`}
        style={{
          background: gradient,
          color: '#fff',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          borderRadius: '50%',
          overflow: 'hidden',
          transform: 'translateZ(0)',
          ...noDragStyle,
          ...style,
        }}
      >
        <span
          style={{
            fontSize: computedFontSize,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            transform: 'translateY(-0.5px)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {cleanAlt ? cleanAlt.charAt(0).toUpperCase() : '?'}
        </span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <video
        src={cleanSrc}
        autoPlay
        muted
        loop
        playsInline
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className={`object-cover rounded-full flex-shrink-0 select-none ${className}`}
        style={{
          borderRadius: '50%',
          overflow: 'hidden',
          transform: 'translateZ(0)',
          ...noDragStyle,
          ...style,
        }}
        onError={() => setVideoError(true)}
      />
    );
  }

  return (
    <img
      src={cleanSrc}
      alt={cleanAlt}
      decoding="async"
      loading="lazy"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={`object-cover rounded-full flex-shrink-0 select-none ${className}`}
      style={{
        borderRadius: '50%',
        overflow: 'hidden',
        transform: 'translateZ(0)',
        ...noDragStyle,
        ...style,
      }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
};