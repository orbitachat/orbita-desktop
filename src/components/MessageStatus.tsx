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
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        className={className}
        style={{ ...statusStyle, transform: 'translate(-1.5px, -1.5px)', color: checkColor }}
      >
        <style>
          {`
            .clock-hand {
              transform-origin: 12px 12px;
              animation: spin 1.2s linear infinite;
            }

            @keyframes spin {
              from {
                transform: rotate(0deg);
              }
              to {
                transform: rotate(360deg);
              }
            }
          `}
        </style>

        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <line
          x1="12"
          y1="12"
          x2="12"
          y2="6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <line
          className="clock-hand"
          x1="12"
          y1="12"
          x2="16.5"
          y2="12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <circle
          cx="12"
          cy="12"
          r="1.2"
          fill="currentColor"
        />
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