import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { useTranslation } from 'react-i18next';
import { Mic, MicOff } from 'lucide-react';

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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" className="w-4 h-4">
              <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
            </svg>
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" className="w-4 h-4">
              <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
