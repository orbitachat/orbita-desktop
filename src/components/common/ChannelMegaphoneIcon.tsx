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
    <path fill="currentColor" d="M12.31 20.095a1.998 1.998 0 0 1-3.864.88L7 17h5zm7.135-18.058A1 1 0 0 1 21 2.869V18.13a1 1 0 0 1-1.555.832L15 16H7.5a5.5 5.5 0 0 1 0-11H15z" />
  </svg>
);
