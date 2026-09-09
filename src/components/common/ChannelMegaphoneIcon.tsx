import React from 'react';

export const ChannelMegaphoneIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 15,
  className = '',
  style = {},
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.5 4.5c-.28 0-.55.07-.79.22L12 8.63V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1.5v3.5a1.5 1.5 0 0 0 2.45 1.16L12 17.37v-2.01l6.71 3.91c.24.15.51.23.79.23.83 0 1.5-.67 1.5-1.5V6c0-.83-.67-1.5-1.5-1.5z" />
  </svg>
);
