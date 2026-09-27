import React from 'react';

interface BotAvatarProps {
  className?: string;
  style?: React.CSSProperties;
}

export const BotAvatar: React.FC<BotAvatarProps> = ({ className = '', style }) => {
  return (
    <div
      className={`flex items-center justify-center rounded-full flex-shrink-0 ${className}`}
      style={{
        background: 'linear-gradient(135deg, var(--accent-color, #7C3AED) 0%, #a855f7 100%)',
        color: '#ffffff',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: '56%', height: '56%' }}
      >
        <path d="M12 2v2" />
        <rect x="4" y="6" width="16" height="14" rx="3" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <path d="M9 16h6" />
        <path d="M2 13h2" />
        <path d="M20 13h2" />
      </svg>
    </div>
  );
};
