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
      className={`relative inline-flex items-center justify-center select-none px-3 py-1.5 rounded-2xl shadow-md ${className}`}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, rgba(255, 255, 255, 0.16))',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        ...style,
      }}
    >
      <div
        className="flex items-center gap-2 select-none"
        style={{
          fontSize: '18px',
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
