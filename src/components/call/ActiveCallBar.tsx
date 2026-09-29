import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

interface ActiveCallBarProps {
  className?: string;
  style?: React.CSSProperties;
}

export const ActiveCallBar: React.FC<ActiveCallBarProps> = ({ className = '', style }) => {
  const { t } = useTranslation();
  const activeCall = useCallStore((s) => s.activeCall);
  const callState = useCallStore((s) => s.callState);
  const isMicEnabled = useCallStore((s) => s.isMicEnabled);
  const setMicEnabled = useCallStore((s) => s.setMicEnabled);
  const endCall = useCallStore((s) => s.endCall);

  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chatColor = useChatStore((s) => s.chatColor);

  const isCallActive = !!activeCall && (callState === 'connected' || callState === 'connecting' || callState === 'ringing');

  const currentCallChat = activeCall ? chats.find((c) => c.id === activeCall.chatId) : null;
  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const currentCallName = currentCallChat?.name || (activeCall as any)?.otherName || activeChat?.name || '';
  const currentCallAvatar = currentCallChat?.avatarUrl || (activeCall as any)?.otherAvatar || (currentCallChat?.id === activeChatId ? activeChat?.avatarUrl : null);

  const gradientBackground = useMemo(() => {
    if (chatColor && chatColor.startsWith('linear-gradient')) {
      return chatColor;
    }
    const baseColor = chatColor || 'var(--accent-color, #5c54e5)';
    return `linear-gradient(90deg, color-mix(in srgb, ${baseColor} 75%, black) 0%, ${baseColor} 50%, color-mix(in srgb, ${baseColor} 80%, white) 100%)`;
  }, [chatColor]);

  if (!isCallActive) return null;

  return (
    <div
      className={`active-call-header-bar w-full flex items-center justify-between select-none cursor-pointer relative overflow-hidden flex-shrink-0 ${className}`}
      style={{
        height: '42px',
        background: gradientBackground,
        border: 'none',
        borderBottom: 'none',
        transition: 'background 0.3s ease',
        ...style,
      }}
      onClick={() => {
        try {
          const orb = (window as any).orbita;
          orb?.openCallWindow?.() || orb?.focusCallWindow?.();
        } catch {}
      }}
    >
      <div className="flex items-center gap-2.5 z-10 pl-3">
        <button
          type="button"
          aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
          onClick={(e) => {
            e.stopPropagation();
            const next = !isMicEnabled;
            setMicEnabled(next);
            try {
              (window as any).orbita?.sendCallAction?.({ type: 'toggleMic', payload: next });
              const bc = new BroadcastChannel('orbita-call-channel');
              bc.postMessage({ type: 'CALL_ACTION', action: 'toggleMic', payload: next });
              setTimeout(() => { try { bc.close(); } catch {} }, 300);
            } catch {}
          }}
          className="bg-transparent border-0 outline-none p-0 cursor-pointer flex items-center justify-center text-white transition-opacity hover:opacity-75 flex-shrink-0"
        >
          {isMicEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="21" height="21" className="w-[21px] h-[21px] text-white">
              <g fill="currentColor">
                <path d="M13 5a1 1 0 0 1 1 1a6 6 0 0 1-5.005 5.915Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 2 0a4 4 0 1 0 8 0a1 1 0 0 1 1-1" />
                <path d="M8 1a3 3 0 0 1 3 3v2a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3" />
              </g>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="21" height="21" className="w-[21px] h-[21px] text-white">
              <path fill="currentColor" d="M4.113 6.945a4 4 0 0 0 2.94 2.94L9.069 11.9l-.073.015Q9 11.957 9 12v1h1a1 1 0 1 1 0 2H6a1 1 0 1 1 0-2h1v-1q0-.043.004-.085A6 6 0 0 1 2 6a1 1 0 0 1 .382-.786zM8 1a3 3 0 0 1 3 3v2c0 .978-.47 1.843-1.195 2.39l.712.713A3.99 3.99 0 0 0 12 6a1 1 0 0 1 2 0a5.97 5.97 0 0 1-2.065 4.52l2.772 2.773a1 1 0 1 1-1.414 1.414l-12-12a1 1 0 1 1 1.414-1.414l2.318 2.318A3 3 0 0 1 8 1" />
            </svg>
          )}
        </button>
        <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center">
          <Avatar
            src={currentCallAvatar}
            alt={currentCallName}
            className="w-7 h-7 object-cover"
            style={{ fontSize: '11px' }}
          />
        </div>
      </div>

      <div className="flex items-center ml-auto z-10 pr-4">
        <button
          type="button"
          aria-label={t('call.hang_up')}
          onClick={(e) => {
            e.stopPropagation();
            endCall(false, 0);
            try {
              (window as any).orbita?.sendCallAction?.({ type: 'endCall', payload: { remainingRemotes: 0 } });
              (window as any).orbita?.closeCallWindow?.();
              const bc = new BroadcastChannel('orbita-call-channel');
              bc.postMessage({ type: 'CALL_ACTION', action: 'endCall', payload: { remainingRemotes: 0 } });
              setTimeout(() => { try { bc.close(); } catch {} }, 300);
            } catch {}
          }}
          className="w-9 h-9 bg-transparent border-0 outline-none p-0 cursor-pointer flex items-center justify-center text-white transition-all hover:scale-110 hover:text-red-400 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" className="w-[22px] h-[22px] text-white">
            <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
          </svg>
        </button>
      </div>
    </div>
  );
};
