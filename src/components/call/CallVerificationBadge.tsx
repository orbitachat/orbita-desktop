import React from 'react';

interface CallVerificationBadgeProps {
  emojis: string[];
  className?: string;
  style?: React.CSSProperties;
}

export const CallVerificationBadge: React.FC<CallVerificationBadgeProps> = ({
  emojis,
  className = '',
  style = {},
}) => {
  if (!emojis || emojis.length !== 4) return null;

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none px-4 py-2 rounded-full shadow-md ${className}`}
      style={{
        backgroundColor: 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      <div
        className="flex items-center gap-2.5 select-none"
        style={{
          fontSize: '22px',
          lineHeight: 1,
        }}
      >
        {emojis.map((emoji, idx) => (
          <span key={idx}>{emoji}</span>
        ))}
      </div>
    </div>
  );
};
