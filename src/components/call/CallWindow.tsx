import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { liveKitService } from '../../services/livekitService';
import { useTranslation } from 'react-i18next';
import { Phone, Mic, MicOff, ChevronLeft, Video, X } from 'lucide-react';
import type { RemoteTrack } from 'livekit-client';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';

const accentButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent-color), var(--accent-dark))',
  color: 'var(--settings-on-primary, #ffffff)',
};

const rejectButtonStyle: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, rgba(255, 255, 255, 0.16))',
  color: 'var(--text-main, #ffffff)',
};

const neutralButtonStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? 'var(--surface-container-strong)' : 'var(--surface-muted)',
  color: active ? 'var(--accent-color)' : 'var(--text-dim)',
});

const StaticBackground = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      backgroundColor: 'var(--bg-primary)',
    }}
  />
);

export const CallWindow = () => {
  const { t } = useTranslation();
  const activeCall = useCallStore((state) => state.activeCall);
  const callState = useCallStore((state) => state.callState);
  const isMinimized = useCallStore((state) => state.isMinimized);
  const setMinimized = useCallStore((state) => state.setMinimized);
  const duration = useCallStore((state) => state.duration);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const statusMessage = useCallStore((state) => state.statusMessage);
  const endCall = useCallStore((state) => state.endCall);
  const initiateCall = useCallStore((state) => state.initiateCall);
  const toggleMic = useCallStore((state) => state.toggleMic);
  const myNickname = useCallStore((state) => state.myNickname);

  const chat = useChatStore((state) =>
    activeCall ? state.chats.find((c) => c.id === activeCall.chatId) : null
  );
  const otherName = chat?.name || activeCall?.chatId || '';
  const otherAvatar = chat?.avatarUrl || null;

  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);
  const attachedElements = useRef<Map<string, HTMLMediaElement>>(new Map());

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack, identity: string) => {
      if (track.kind !== 'audio') return;
      const el = track.attach();
      el.autoplay = true;
      el.style.display = 'none';
      remoteAudioContainerRef.current?.appendChild(el);
      attachedElements.current.set(`${identity}:${track.sid}`, el);
    };

    const handleTrackUnsubscribed = (track: RemoteTrack, identity: string) => {
      if (track.kind !== 'audio') return;
      const key = `${identity}:${track.sid}`;
      const el = attachedElements.current.get(key);
      if (el) {
        track.detach(el as HTMLAudioElement);
        el.remove();
        attachedElements.current.delete(key);
      } else {
        track.detach().forEach((detachedEl) => detachedEl.remove());
      }
    };

    liveKitService.on('trackSubscribed', handleTrackSubscribed);
    liveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);

    return () => {
      liveKitService.off('trackSubscribed', handleTrackSubscribed);
      liveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      attachedElements.current.forEach((el) => el.remove());
      attachedElements.current.clear();
    };
  }, []);

  if (!activeCall) return null;

  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isConnected = callState === 'connected';
  const isEnded = callState === 'ended';

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCancel = () => {
    endCall();
  };

  const handleCall = () => {
    initiateCall();
  };

  if (callState === 'ringing' && activeCall.direction === 'incoming') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex flex-col justify-between overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-primary)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <StaticBackground />

          <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

          <div ref={remoteAudioContainerRef} style={{ display: 'none' }} />
          <div className="flex flex-col items-center justify-center flex-1 relative z-10 p-6">
            <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
              <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '48px' }} />
            </div>
            <h2 className="mt-4 text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>
          </div>

          <div className="flex items-center justify-center gap-6 pb-8 pt-2 relative z-10">
            <button
              type="button"
              onClick={() => useCallStore.getState().rejectCall()}
              aria-label={t('call.reject')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white shadow-md">
                <X size={24} color="#000000" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => useCallStore.getState().answerCall(myNickname!)}
              aria-label={t('call.answer')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                <Phone size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.answer') || 'Принять'}
              </span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col justify-between overflow-hidden select-none"
      style={{
        display: isMinimized ? 'none' : 'flex',
        backgroundColor: 'var(--bg-primary)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <StaticBackground />

      <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

      <button
        type="button"
        onClick={() => setMinimized(true)}
        aria-label={t('call.close')}
        className="absolute z-50 p-0 bg-transparent border-0 outline-none transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
        style={{
          top: '53px',
          left: '24px',
          width: '24px',
          height: '24px',
          minWidth: '24px',
          minHeight: '24px',
          color: 'var(--text-dim, #8a96a3)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main, #ffffff)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim, #8a96a3)')}
      >
        <ChevronLeft size={24} className="flex-shrink-0" />
      </button>

      <div ref={remoteAudioContainerRef} style={{ display: 'none' }} />

      {isConnected && activeCall?.verificationEmojis && activeCall.verificationEmojis.length === 4 && (
        <div
          className="select-none"
          style={{
            position: 'absolute',
            top: '55px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
          }}
        >
          <CallVerificationBadge emojis={activeCall.verificationEmojis} />
        </div>
      )}

      <div className="flex flex-col items-center justify-center flex-1 relative z-10 p-6">
        <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
          <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '48px' }} />
        </div>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-center px-4" style={{ color: 'var(--text-main)' }}>
          {otherName}
        </h2>

        {isPreparing ? (
          <p className="mt-1 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim)' }}>
            {t('call.video_call_hint')}
          </p>
        ) : isConnected ? (
          <p className="mt-1 text-sm tabular-nums text-center" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
            {formatDuration(duration)}
          </p>
        ) : statusMessage ? (
          <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
            {statusMessage}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-6 pb-8 pt-2 relative z-10">
        {isPreparing ? (
          <>
            <button
              type="button"
              disabled
              aria-label={t('call.enable_video')}
              className="flex flex-col items-center gap-2 opacity-50 cursor-default pointer-events-none select-none bg-transparent border-0 p-0 outline-none"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-md"
                style={accentButtonStyle}
              >
                <Video size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.enable_video')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.cancel')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCall}
              aria-label={t('call.call')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-md"
                style={accentButtonStyle}
              >
                <Phone size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.call')}
              </span>
            </button>
          </>
        ) : (isRinging || isConnecting || isConnected) ? (
          <>
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-md"
                style={neutralButtonStyle(isMicEnabled)}
              >
                {isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.hang_up')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.hang_up')}
              </span>
            </button>
          </>
        ) : isEnded ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('call.close')}
            className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
              <X size={24} color="#ffffff" />
            </div>
            <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
              {t('call.close')}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
};
