import React from 'react';

type MessageStatusType = 'sent' | 'delivered' | 'read' | 'sending' | 'pending';

interface MessageStatusProps {
  status: MessageStatusType;
  className?: string;
  isOwn?: boolean;
  color?: string;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, className = '', isOwn = false, color }) => {
  const statusStyle: React.CSSProperties = {
    transform: 'translateY(-1px)',
    flexShrink: 0,
  };

  const checkColor = color || (isOwn ? 'rgba(255, 255, 255, 0.95)' : 'var(--text-dim, #808080)');
  const readColor = color || (isOwn ? '#ffffff' : 'var(--text-dim, #808080)');

  if (status === 'sending' || status === 'pending') {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="13"
        height="13"
        className={className}
        style={statusStyle}
      >
        <circle cx="8" cy="8" r="6" stroke={checkColor} strokeWidth="1.3" />
        <path d="M8 4.5V8L10.5 9.5" stroke={checkColor} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === 'sent' || status === 'delivered') {
    return (
      <svg
        viewBox="0 -2 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        className={className}
        style={statusStyle}
      >
        <path
          d="m1 6l2.5 2.5l5-5"
          stroke={checkColor}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (status === 'read') {
    return (
      <svg
        viewBox="0 -2 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="16"
        className={className}
        style={statusStyle}
      >
        <path
          d="m1 6l2.5 2.5l5-5m-2 5l5-5"
          stroke={readColor}
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
};