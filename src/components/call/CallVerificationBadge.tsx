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
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={style}
    >
      <div
        className="flex items-center gap-2 select-none"
        style={{
          fontSize: '20px',
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
