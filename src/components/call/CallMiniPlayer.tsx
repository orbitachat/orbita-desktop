import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';

export const CallMiniPlayer = () => {
  const { t } = useTranslation();
  const activeCall = useCallStore((state) => state.activeCall);
  const callState = useCallStore((state) => state.callState);
  const duration = useCallStore((state) => state.duration);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const statusMessage = useCallStore((state) => state.statusMessage);
  const endCall = useCallStore((state) => state.endCall);
  const initiateCall = useCallStore((state) => state.initiateCall);
  const toggleMic = useCallStore((state) => state.toggleMic);
  const setMinimized = useCallStore((state) => state.setMinimized);

  const chat = useChatStore((state) =>
    activeCall ? state.chats.find((c) => c.id === activeCall.chatId) : null
  );
  const otherName = chat?.name || activeCall?.chatId || '';

  if (!activeCall) return null;

  const isPreparing = callState === 'preparing';
  const isConnected = callState === 'connected';

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      onClick={() => setMinimized(false)}
      className="global-call-mini-player flex-shrink-0 flex items-center select-none cursor-pointer transition-colors hover:bg-white/[0.04]"
      style={{
        height: '34px',
        backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.02))',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.05))',
        paddingLeft: '10px',
        paddingRight: '12px',
        position: 'relative',
        zIndex: 10,
        willChange: 'transform',
        transform: 'translateZ(0)',
      }}
    >
      <div className="flex items-center gap-2.5 z-10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          width="16"
          height="16"
          className="flex-shrink-0"
          style={{ color: 'var(--accent-light, #a995ec)' }}
        >
          <path
            fill="currentColor"
            d="M472 432h-48a24 24 0 0 1-24-24V104a24 24 0 0 1 24-24h48a24 24 0 0 1 24 24v304a24 24 0 0 1-24 24m-128 0h-48a24 24 0 0 1-24-24V184a24 24 0 0 1 24-24h48a24 24 0 0 1 24 24v224a24 24 0 0 1-24 24m-128 0h-48a24 24 0 0 1-24-24V248a24 24 0 0 1 24-24h48a24 24 0 0 1 24 24v160a24 24 0 0 1-24 24m-128 0H40a24 24 0 0 1-24-24v-96a24 24 0 0 1 24-24h48a24 24 0 0 1 24 24v96a24 24 0 0 1-24 24"
          />
        </svg>

        {statusMessage ? (
          <span
            className="text-xs font-medium flex-shrink-0"
            style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px' }}
          >
            {statusMessage}
          </span>
        ) : isConnected ? (
          <span
            className="text-xs tabular-nums font-medium flex-shrink-0"
            style={{ color: 'var(--accent-light, #a995ec)', fontSize: '12px' }}
          >
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none max-w-[45%] overflow-hidden"
      >
        <span
          className="truncate font-medium text-xs text-center"
          style={{ color: 'var(--text-main, #ffffff)', fontSize: '12px' }}
        >
          {otherName}
        </span>
      </div>

      <div className="flex items-center gap-3 ml-auto flex-shrink-0 z-10">
        <button
          type="button"
          aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
          onClick={(e) => {
            e.stopPropagation();
            toggleMic();
          }}
          className="flex items-center justify-center cursor-pointer border-0 outline-none"
          style={{
            background: 'none',
            padding: 0,
            color: isMicEnabled ? 'var(--accent-light, #a995ec)' : 'var(--text-dim, #8a96a3)',
          }}
        >
          {isMicEnabled ? <Mic size={16} /> : <MicOff size={16} />}
        </button>

        {isPreparing ? (
          <button
            type="button"
            aria-label={t('call.call')}
            onClick={(e) => {
              e.stopPropagation();
              initiateCall();
            }}
            className="flex items-center justify-center cursor-pointer border-0 outline-none"
            style={{
              background: 'none',
              padding: 0,
              color: 'var(--accent-light, #a995ec)',
            }}
          >
            <Phone size={16} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('call.hang_up')}
            onClick={(e) => {
              e.stopPropagation();
              endCall();
            }}
            className="flex items-center justify-center cursor-pointer border-0 outline-none"
            style={{
              background: 'none',
              padding: 0,
              color: 'var(--accent-light, #a995ec)',
            }}
          >
            <PhoneOff size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
