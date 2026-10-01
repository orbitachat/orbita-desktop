import React from 'react';

interface SignalStrengthIconProps {
  level?: number | string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SignalStrengthIcon: React.FC<SignalStrengthIconProps> = ({
  level = 4,
  size = 13,
  className = '',
  style,
}) => {
  let numLevel = 4;
  if (typeof level === 'number') {
    numLevel = Math.max(1, Math.min(4, Math.round(level)));
  } else if (typeof level === 'string') {
    switch (level.toLowerCase()) {
      case 'excellent':
        numLevel = 4;
        break;
      case 'good':
        numLevel = 3;
        break;
      case 'poor':
        numLevel = 2;
        break;
      case 'lost':
      case 'very_poor':
        numLevel = 1;
        break;
      default:
        numLevel = 4;
    }
  }

  const activeColor = numLevel === 1 ? '#f43f5e' : '#ffffff';
  const dimColor = 'rgba(255,255,255,0.28)';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block flex-shrink-0 ${className}`}
      style={{ verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      <path
        fill={numLevel >= 1 ? activeColor : dimColor}
        d="M1.5 20v-8h3v8z"
      />
      <path
        fill={numLevel >= 2 ? activeColor : dimColor}
        d="M7.5 20V9.5h3V20z"
      />
      <path
        fill={numLevel >= 3 ? activeColor : dimColor}
        d="M13.5 20V7h3V20z"
      />
      <path
        fill={numLevel >= 4 ? activeColor : dimColor}
        d="M19.5 20V4h3V20z"
      />
    </svg>
  );
};
