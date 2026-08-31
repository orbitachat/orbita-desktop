import React from 'react';

type MessageStatusType = 'sent' | 'delivered' | 'read';

interface MessageStatusProps {
  status: MessageStatusType;
  className?: string;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, className = '' }) => {
  const statusStyle: React.CSSProperties = {
    transform: 'translateY(-1px)',
    flexShrink: 0,
  };

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
          stroke="var(--text-dim, #9ca3af)"
          strokeWidth="1.2"
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
          stroke="var(--accent-color, #7C3AED)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
};