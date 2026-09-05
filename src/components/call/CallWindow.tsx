import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { liveKitService } from '../../services/livekitService';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff, ChevronLeft, Video, VideoOff, X } from 'lucide-react';
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
  const isVideoEnabled = useCallStore((state) => state.isVideoEnabled);
  const statusMessage = useCallStore((state) => state.statusMessage);
  const endCall = useCallStore((state) => state.endCall);
  const initiateCall = useCallStore((state) => state.initiateCall);
  const toggleMic = useCallStore((state) => state.toggleMic);
  const toggleVideo = useCallStore((state) => state.toggleVideo);
  const myNickname = useCallStore((state) => state.myNickname);

  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState<boolean>(false);
  const [isLocalVideoActive, setIsLocalVideoActive] = useState<boolean>(false);

  const chat = useChatStore((state) =>
    activeCall ? state.chats.find((c) => c.id === activeCall.chatId) : null
  );
  const otherName = chat?.name || activeCall?.chatId || '';
  const otherAvatar = chat?.avatarUrl || null;

  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const attachedElements = useRef<Map<string, HTMLMediaElement>>(new Map());

  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isConnected = callState === 'connected';
  const isEnded = callState === 'ended';

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack, identity: string) => {
      if (track.kind === 'audio') {
        const el = track.attach();
        el.autoplay = true;
        el.style.display = 'none';
        remoteAudioContainerRef.current?.appendChild(el);
        attachedElements.current.set(`${identity}:${track.sid}`, el);
      } else if (track.kind === 'video') {
        if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          setIsRemoteVideoActive(true);
        }
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack, identity: string) => {
      if (track.kind === 'audio') {
        const key = `${identity}:${track.sid}`;
        const el = attachedElements.current.get(key);
        if (el) {
          track.detach(el as HTMLAudioElement);
          el.remove();
          attachedElements.current.delete(key);
        } else {
          track.detach().forEach((detachedEl) => detachedEl.remove());
        }
      } else if (track.kind === 'video') {
        if (remoteVideoRef.current) {
          track.detach(remoteVideoRef.current);
        }
        setIsRemoteVideoActive(false);
      }
    };

    const handleTrackMuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      setIsRemoteVideoActive(!!(track && !track.isMuted));
    };

    const handleTrackUnmuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      if (track && remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
        setIsRemoteVideoActive(true);
      }
    };

    liveKitService.on('trackSubscribed', handleTrackSubscribed);
    liveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);
    liveKitService.on('trackMuted', handleTrackMuted);
    liveKitService.on('trackUnmuted', handleTrackUnmuted);

    return () => {
      liveKitService.off('trackSubscribed', handleTrackSubscribed);
      liveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      liveKitService.off('trackMuted', handleTrackMuted);
      liveKitService.off('trackUnmuted', handleTrackUnmuted);
      attachedElements.current.forEach((el) => el.remove());
      attachedElements.current.clear();
      if (remoteVideoRef.current) {
        const track = liveKitService.getRemoteVideoTrack();
        if (track) {
          track.detach(remoteVideoRef.current);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setIsRemoteVideoActive(false);
      return;
    }
    const track = liveKitService.getRemoteVideoTrack();
    if (track && !track.isMuted && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      setIsRemoteVideoActive(true);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    const attachLocal = () => {
      if (isVideoEnabled) {
        const track = liveKitService.getLocalVideoTrack();
        if (track && localVideoRef.current) {
          track.attach(localVideoRef.current);
          setIsLocalVideoActive(true);
        } else {
          setIsLocalVideoActive(false);
        }
      } else {
        const track = liveKitService.getLocalVideoTrack();
        if (track && localVideoRef.current) {
          track.detach(localVideoRef.current);
        }
        setIsLocalVideoActive(false);
      }
    };
    attachLocal();
    liveKitService.on('cameraChanged', attachLocal);
    return () => {
      liveKitService.off('cameraChanged', attachLocal);
      const track = liveKitService.getLocalVideoTrack();
      if (track && localVideoRef.current) {
        track.detach(localVideoRef.current);
      }
    };
  }, [isConnected, isVideoEnabled]);

  useEffect(() => {
    if (isConnected) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      return;
    }
    if (!isVideoEnabled) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      setIsLocalVideoActive(false);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
        setIsLocalVideoActive(true);
      })
      .catch(() => {
        setIsLocalVideoActive(false);
      });

    return () => {
      cancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, [isConnected, isVideoEnabled]);

  if (!activeCall) return null;

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
            <h2 className="mt-4 text-xl font-bold tracking-tight text-center" style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>
            <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim)' }}>
              {activeCall.callType === 'video' ? t('call.incoming_video_call') : t('call.incoming_audio_call')}
            </p>
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
                {activeCall.callType === 'video' ? <Video size={24} color="#ffffff" /> : <Phone size={24} color="#ffffff" />}
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

      <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover transition-opacity duration-300"
          style={{
            display: isRemoteVideoActive ? 'block' : 'none',
          }}
        />

        {isRemoteVideoActive && (
          <>
            <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none z-10" />
            <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none z-10" />
          </>
        )}
      </div>

      <AnimatePresence>
        {isLocalVideoActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            drag
            dragConstraints={{ top: 10, left: -600, right: 10, bottom: 400 }}
            dragElastic={0.05}
            className="absolute top-16 right-6 z-40 w-36 h-52 sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-black/60 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
              {t('call.you') || 'Вы'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isRemoteVideoActive ? (
        <div className="relative z-30 flex flex-col items-center pt-8 pb-4 pointer-events-none select-none">
          <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-md">
            {otherName}
          </h2>
          {isConnected && (
            <p className="text-sm font-semibold tabular-nums text-white/90 drop-shadow-sm mt-0.5">
              {formatDuration(duration)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 relative z-10 p-6">
          <div className="relative w-[120px] h-[120px] flex items-center justify-center select-none">
            {isConnected && (
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-20 pointer-events-none"
                style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
              />
            )}
            <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-xl pointer-events-none border-2 border-white/10 relative z-10">
              <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '48px' }} />
            </div>
          </div>

          <h2 className="mt-5 text-2xl font-bold tracking-tight text-center px-4" style={{ color: 'var(--text-main)' }}>
            {otherName}
          </h2>

          {isPreparing ? (
            <p className="mt-1.5 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim)' }}>
              {t('call.video_call_hint')}
            </p>
          ) : isConnected ? (
            <p className="mt-1.5 text-sm tabular-nums text-center" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
              {formatDuration(duration)}
            </p>
          ) : statusMessage ? (
            <p className="mt-1.5 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
              {statusMessage}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-center gap-6 pb-9 pt-2 relative z-30">
        {isPreparing ? (
          <>
            <button
              type="button"
              onClick={toggleVideo}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled ? <Video size={24} color="#ffffff" /> : <VideoOff size={24} color="#ffffff" />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.enable_video')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.cancel')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95" style={rejectButtonStyle}>
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
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                style={accentButtonStyle}
              >
                {isVideoEnabled ? <Video size={24} color="#ffffff" /> : <Phone size={24} color="#ffffff" />}
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
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95"
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
              onClick={toggleVideo}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95"
                style={neutralButtonStyle(isVideoEnabled)}
              >
                {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.hang_up')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95" style={rejectButtonStyle}>
                <PhoneOff size={24} color="#ffffff" />
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
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95" style={rejectButtonStyle}>
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
