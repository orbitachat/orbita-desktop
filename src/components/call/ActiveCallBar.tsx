import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

const CALL_GRADIENTS = [
  'linear-gradient(90deg, var(--accent-color, #7C3AED) 0%, #2563eb 50%, #06b6d4 100%)',
  'linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
  'linear-gradient(90deg, #0284c7 0%, #2563eb 50%, #7c3aed 100%)',
  'linear-gradient(90deg, #0d9488 0%, #0284c7 50%, #6366f1 100%)',
  'linear-gradient(90deg, #6366f1 0%, #9333ea 50%, #e11d48 100%)',
  'linear-gradient(90deg, #059669 0%, #0d9488 50%, #2563eb 100%)',
  'linear-gradient(90deg, #8b5cf6 0%, #ec4899 50%, #f43f5e 100%)',
  'linear-gradient(90deg, #2563eb 0%, #06b6d4 50%, #10b981 100%)',
  'linear-gradient(90deg, #6d28d9 0%, #3b82f6 50%, #14b8a6 100%)',
  'linear-gradient(90deg, #4338ca 0%, #6d28d9 50%, #0284c7 100%)',
  'linear-gradient(90deg, #a21caf 0%, #c026d3 50%, #7c3aed 100%)',
  'linear-gradient(90deg, #ea580c 0%, #f43f5e 50%, #9333ea 100%)',
  'linear-gradient(90deg, #7c3aed 0%, #ec4899 50%, #f43f5e 100%)',
  'linear-gradient(90deg, #be123c 0%, #e11d48 50%, #f97316 100%)',
  'linear-gradient(90deg, #1d4ed8 0%, #6366f1 50%, #d946ef 100%)',
  'linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%)',
  'linear-gradient(90deg, #581c87 0%, #7e22ce 50%, #a855f7 100%)',
  'linear-gradient(90deg, #d97706 0%, #ea580c 50%, #e11d48 100%)',
  'linear-gradient(90deg, #312e81 0%, #2563eb 50%, #0d9488 100%)',
  'linear-gradient(90deg, #831843 0%, #be185d 50%, #6b21a8 100%)',
  'linear-gradient(90deg, #0284c7 0%, #06b6d4 50%, #4f46e5 100%)',
  'linear-gradient(90deg, #9333ea 0%, #3b82f6 50%, #06b6d4 100%)',
  'linear-gradient(90deg, #e11d48 0%, #c026d3 50%, #4c1d95 100%)',
  'linear-gradient(90deg, #047857 0%, #10b981 50%, #0e7490 100%)',
  'linear-gradient(90deg, #6b21a8 0%, #8b5cf6 50%, #2563eb 100%)',
  'linear-gradient(90deg, #9f1239 0%, #d946ef 50%, #0284c7 100%)',
  'linear-gradient(90deg, #1e40af 0%, #2563eb 50%, #38bdf8 100%)',
  'linear-gradient(90deg, #581c87 0%, #be123c 50%, #ea580c 100%)',
];

let sharedCurrentGradient = CALL_GRADIENTS[0];
let sharedLayer1 = CALL_GRADIENTS[0];
let sharedLayer2 = CALL_GRADIENTS[1];
let sharedActiveLayer: 0 | 1 = 0;

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

  const isCallActive = !!activeCall && (callState === 'connected' || callState === 'connecting' || callState === 'ringing');

  const [callBgLayer1, setCallBgLayer1] = useState(sharedLayer1);
  const [callBgLayer2, setCallBgLayer2] = useState(sharedLayer2);
  const [activeCallBgLayer, setActiveCallBgLayer] = useState<0 | 1>(sharedActiveLayer);

  const currentCallChat = activeCall ? chats.find((c) => c.id === activeCall.chatId) : null;
  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const currentCallName = currentCallChat?.name || (activeCall as any)?.otherName || activeChat?.name || '';
  const currentCallAvatar = currentCallChat?.avatarUrl || (activeCall as any)?.otherAvatar || (currentCallChat?.id === activeChatId ? activeChat?.avatarUrl : null);

  useEffect(() => {
    if (!isCallActive) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextChange = () => {
      timeoutId = setTimeout(() => {
        const available = CALL_GRADIENTS.filter((g) => g !== sharedCurrentGradient);
        const nextGrad = available[Math.floor(Math.random() * available.length)] || CALL_GRADIENTS[0];
        sharedCurrentGradient = nextGrad;

        if (sharedActiveLayer === 0) {
          sharedLayer2 = nextGrad;
          sharedActiveLayer = 1;
          setCallBgLayer2(nextGrad);
          setActiveCallBgLayer(1);
        } else {
          sharedLayer1 = nextGrad;
          sharedActiveLayer = 0;
          setCallBgLayer1(nextGrad);
          setActiveCallBgLayer(0);
        }

        scheduleNextChange();
      }, 30000);
    };

    scheduleNextChange();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isCallActive]);

  if (!isCallActive) return null;

  return (
    <div
      className={`active-call-header-bar w-full flex items-center justify-between select-none cursor-pointer relative shadow-sm overflow-hidden flex-shrink-0 ${className}`}
      style={{
        height: '42px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
        ...style,
      }}
      onClick={() => {
        try {
          const orb = (window as any).orbita;
          orb?.openCallWindow?.() || orb?.focusCallWindow?.();
        } catch {}
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: callBgLayer1,
          opacity: activeCallBgLayer === 0 ? 1 : 0,
          transition: 'opacity 3.5s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: callBgLayer2,
          opacity: activeCallBgLayer === 1 ? 1 : 0,
          transition: 'opacity 3.5s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: 'none',
        }}
      />
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
            endCall();
            try {
              (window as any).orbita?.sendCallAction?.({ type: 'endCall' });
              (window as any).orbita?.closeCallWindow?.();
              const bc = new BroadcastChannel('orbita-call-channel');
              bc.postMessage({ type: 'CALL_ACTION', action: 'endCall' });
              setTimeout(() => { try { bc.close(); } catch {} }, 300);
            } catch {}
          }}
          className="w-9 h-9 bg-transparent border-0 outline-none p-0 cursor-pointer flex items-center justify-center text-white transition-all hover:scale-110 hover:text-red-400 flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" className="w-[22px] h-[22px] text-white">
            <path fill="currentColor" d="M12 8q2.95 0 5.813 1.188T22.9 12.75q.3.3.3.7t-.3.7l-2.3 2.25q-.275.275-.638.3t-.662-.2l-2.9-2.2q-.2-.15-.3-.35t-.1-.45v-2.85q-.95-.3-1.95-.475T12 10t-2.05.175T8 10.65v2.85q0 .25-.1.45t-.3.35l-2.9 2.2q-.3.225-.663.2t-.637-.3l-2.3-2.25q-.3-.3-.3-.7t.3-.7q2.2-2.375 5.075-3.562T12 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};
