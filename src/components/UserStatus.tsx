// src/components/UserStatus.tsx
import React from 'react';
import { useUserStatus } from '../hooks/useUserStatus';
import { useConnectionStore } from '../store/useConnectionStore';

interface UserStatusProps {
  userId: string;
  className?: string;
}

export const UserStatus: React.FC<UserStatusProps> = ({ userId, className = '' }) => {
  const { isOnline, text } = useUserStatus(userId);
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);

  const displayText = !isServerConnected ? 'соединение...' : text;
  const displayOnline = isServerConnected && isOnline;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          !isServerConnected
            ? 'bg-amber-400 animate-pulse'
            : displayOnline
            ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
            : 'bg-gray-500'
        }`}
      />
      <span className="text-sm text-gray-400">{displayText}</span>
    </div>
  );
};