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

  const barColor =
    numLevel >= 3
      ? 'var(--emerald-400, #34d399)'
      : numLevel === 2
      ? 'var(--amber-400, #fbbf24)'
      : 'var(--rose-500, #f43f5e)';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block flex-shrink-0 ${className}`}
      style={{ color: barColor, verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M1.5 20v-8h3v8z"
        opacity={numLevel >= 1 ? 1 : 0.22}
      />
      <path
        fill="currentColor"
        d="M7.5 20V9.5h3V20z"
        opacity={numLevel >= 2 ? 1 : 0.22}
      />
      <path
        fill="currentColor"
        d="M13.5 20V7h3V20z"
        opacity={numLevel >= 3 ? 1 : 0.22}
      />
      <path
        fill="currentColor"
        d="M19.5 20V4h3V20z"
        opacity={numLevel >= 4 ? 1 : 0.22}
      />
    </svg>
  );
};
