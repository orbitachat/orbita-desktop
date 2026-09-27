import React from 'react';

export const VerifiedBadge: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 15,
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <path
      d="M10.27 2.45a2.4 2.4 0 0 1 3.46 0l.73.74c.4.4.95.63 1.51.63h1.05a2.4 2.4 0 0 1 2.4 2.4v1.05c0 .56.23 1.11.63 1.51l.74.73a2.4 2.4 0 0 1 0 3.46l-.74.73c-.4.4-.63.95-.63 1.51v1.05a2.4 2.4 0 0 1-2.4 2.4h-1.05a2.4 2.4 0 0 0-1.51.63l-.73.74a2.4 2.4 0 0 1-3.46 0l-.73-.74a2.4 2.4 0 0 0-1.51-.63H7.78a2.4 2.4 0 0 1-2.4-2.4v-1.05c0-.56-.23-1.11-.63-1.51l-.74-.73a2.4 2.4 0 0 1 0-3.46l.74-.73c.4-.4.63-.95.63-1.51V6.22a2.4 2.4 0 0 1 2.4-2.4h1.05c.56 0 1.11-.23 1.51-.63l.73-.74Z"
      fill="var(--accent-color, #3390ec)"
    />
    <path
      d="m8.5 12 2.5 2.5 5-5"
      stroke="#ffffff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
