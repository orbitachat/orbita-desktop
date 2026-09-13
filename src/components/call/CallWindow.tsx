import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { liveKitService } from '../../services/livekitService';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff, ChevronLeft, Video, VideoOff, X, ScreenShare, ScreenShareOff, Maximize2, Minimize2, Volume2, Volume1, VolumeX, Zap } from 'lucide-react';
import type { RemoteTrack } from 'livekit-client';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';
import { ScreenSharePickerModal } from './ScreenSharePickerModal';

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
  const isScreenSharing = useCallStore((state) => state.isScreenSharing);
  const statusMessage = useCallStore((state) => state.statusMessage);
  const endCall = useCallStore((state) => state.endCall);
  const initiateCall = useCallStore((state) => state.initiateCall);
  const toggleMic = useCallStore((state) => state.toggleMic);
  const toggleVideo = useCallStore((state) => state.toggleVideo);
  const toggleScreenShare = useCallStore((state) => state.toggleScreenShare);
  const myNickname = useCallStore((state) => state.myNickname);
  const remoteScreenShareTrack = useCallStore((state) => state.remoteScreenShareTrack);

  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState<boolean>(false);
  const [isLocalVideoActive, setIsLocalVideoActive] = useState<boolean>(false);
  const [isRemoteScreenShareActive, setIsRemoteScreenShareActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const peerVolume = useCallStore((state) => state.peerVolume);
  const micVolume = useCallStore((state) => state.micVolume);
  const setPeerVolume = useCallStore((state) => state.setPeerVolume);
  const setMicVolume = useCallStore((state) => state.setMicVolume);
  const noiseSuppressionMode = useChatStore((state) => state.noiseSuppressionMode);
  const setNoiseSuppressionMode = useChatStore((state) => state.setNoiseSuppressionMode);
  const selectedMicrophoneId = useChatStore((state) => state.selectedMicrophoneId);
  const setSelectedMicrophoneId = useChatStore((state) => state.setSelectedMicrophoneId);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [isVolumeOpen, setIsVolumeOpen] = useState<boolean>(false);
  const volumeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVolumeOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(e.target as Node)) {
        setIsVolumeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isVolumeOpen]);

  useEffect(() => {
    const checkDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setHasCamera(false);
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        const audioIn = devices.filter((d) => d.kind === 'audioinput');
        setHasCamera(videoInputs.length > 0);
        setAudioInputs(audioIn);
      } catch {
        setHasCamera(false);
      }
    };

    checkDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', checkDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', checkDevices);
    };
  }, []);

  const chat = useChatStore((state) =>
    activeCall ? state.chats.find((c) => c.id === activeCall.chatId) : null
  );
  const otherName = chat?.name || activeCall?.chatId || '';
  const otherAvatar = chat?.avatarUrl || null;

  const remoteAudioContainerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const attachedElements = useRef<Map<string, HTMLMediaElement>>(new Map());

  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isConnected = callState === 'connected';
  const isEnded = callState === 'ended';

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      callContainerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          if (remoteScreenShareRef.current) {
            track.attach(remoteScreenShareRef.current);
            setIsRemoteScreenShareActive(true);
          }
        } else if (remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          setIsRemoteVideoActive(true);
        }
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          if (remoteScreenShareRef.current) {
            track.detach(remoteScreenShareRef.current);
          }
          setIsRemoteScreenShareActive(false);
        } else {
          if (remoteVideoRef.current) {
            track.detach(remoteVideoRef.current);
          }
          setIsRemoteVideoActive(false);
        }
      }
    };

    const handleTrackMuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      setIsRemoteVideoActive(!!(track && !track.isMuted));
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      setIsRemoteScreenShareActive(!!(sTrack && !sTrack.isMuted));
    };

    const handleTrackUnmuted = () => {
      const track = liveKitService.getRemoteVideoTrack();
      if (track && remoteVideoRef.current) {
        track.attach(remoteVideoRef.current);
        setIsRemoteVideoActive(true);
      }
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && remoteScreenShareRef.current) {
        sTrack.attach(remoteScreenShareRef.current);
        setIsRemoteScreenShareActive(true);
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
      if (remoteScreenShareRef.current) {
        const sTrack = liveKitService.getRemoteScreenShareTrack();
        if (sTrack) {
          sTrack.detach(remoteScreenShareRef.current);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!isConnected) {
      setIsRemoteVideoActive(false);
      setIsRemoteScreenShareActive(false);
      return;
    }
    const track = liveKitService.getRemoteVideoTrack();
    if (track && !track.isMuted && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      setIsRemoteVideoActive(true);
    }
    const sTrack = liveKitService.getRemoteScreenShareTrack();
    if (sTrack && !sTrack.isMuted && remoteScreenShareRef.current) {
      sTrack.attach(remoteScreenShareRef.current);
      setIsRemoteScreenShareActive(true);
    }
  }, [isConnected]);

  useEffect(() => {
    if (remoteScreenShareTrack && remoteScreenShareRef.current) {
      remoteScreenShareTrack.attach(remoteScreenShareRef.current);
      setIsRemoteScreenShareActive(true);
    } else if (!remoteScreenShareTrack && remoteScreenShareRef.current) {
      setIsRemoteScreenShareActive(false);
    }
  }, [remoteScreenShareTrack]);

  useEffect(() => {
    if (!isConnected || !isScreenSharing) {
      if (localScreenShareRef.current) {
        const track = liveKitService.getScreenShareTrack();
        if (track) track.detach(localScreenShareRef.current);
      }
      return;
    }
    const track = liveKitService.getScreenShareTrack();
    if (track && localScreenShareRef.current) {
      track.attach(localScreenShareRef.current);
    }
    const onScreenChanged = (enabled: boolean, tr: any) => {
      if (enabled && tr && localScreenShareRef.current) {
        tr.attach(localScreenShareRef.current);
      } else if (!enabled && localScreenShareRef.current) {
        tr?.detach(localScreenShareRef.current);
      }
    };
    liveKitService.on('screenShareChanged', onScreenChanged);
    return () => {
      liveKitService.off('screenShareChanged', onScreenChanged);
      if (localScreenShareRef.current && track) {
        track.detach(localScreenShareRef.current);
      }
    };
  }, [isConnected, isScreenSharing]);

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
    if (isConnected || isPreparing) {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (isPreparing) {
        setIsLocalVideoActive(false);
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
  }, [isConnected, isPreparing, isVideoEnabled]);

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

      <div
        ref={callContainerRef}
        className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center bg-[#09080e]"
      >
        <video
          ref={remoteScreenShareRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain transition-opacity duration-300"
          style={{
            display: isRemoteScreenShareActive ? 'block' : 'none',
          }}
        />

        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover transition-opacity duration-300"
          style={{
            display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none',
          }}
        />

        {isScreenSharing && !isRemoteScreenShareActive && !isRemoteVideoActive && (
          <video
            ref={localScreenShareRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain opacity-75"
          />
        )}

        {(isRemoteVideoActive || isRemoteScreenShareActive) && (
          <>
            <div className="absolute top-0 inset-x-0 h-36 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none z-10" />
            <div className="absolute bottom-0 inset-x-0 h-44 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none z-10" />
          </>
        )}
      </div>

      {isRemoteScreenShareActive && (
        <div className="absolute top-14 left-16 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg select-none">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[12px] font-medium text-white/90">
            {t('call.screen_of', { name: otherName })}
          </span>
          <button
            type="button"
            onClick={handleToggleFullscreen}
            aria-label={isFullscreen ? t('call.exit_fullscreen') : t('call.fullscreen')}
            className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer ml-1"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      )}

      {isScreenSharing && (
        <div className="absolute top-14 left-16 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg select-none">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[12px] font-medium text-white/90">
            {t('call.sharing_your_screen')}
          </span>
          <button
            type="button"
            onClick={toggleScreenShare}
            aria-label={t('call.stop_screen_share')}
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors border-0 cursor-pointer ml-1"
          >
            {t('call.stop_screen_share')}
          </button>
        </div>
      )}

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
              disabled={!hasCamera}
              onClick={hasCamera ? toggleVideo : undefined}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none"
              style={{
                pointerEvents: hasCamera ? 'auto' : 'none',
                opacity: hasCamera ? 1 : 0.35,
                cursor: hasCamera ? 'pointer' : 'default',
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
                style={isVideoEnabled && hasCamera ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled && hasCamera ? <Video size={24} color="#ffffff" /> : <VideoOff size={24} color="#ffffff" />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled && hasCamera ? t('call.camera_off') : t('call.enable_video')}
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
              disabled={!hasCamera}
              onClick={hasCamera ? toggleVideo : undefined}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none"
              style={{
                pointerEvents: hasCamera ? 'auto' : 'none',
                opacity: hasCamera ? 1 : 0.35,
                cursor: hasCamera ? 'pointer' : 'default',
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95"
                style={neutralButtonStyle(isVideoEnabled && hasCamera)}
              >
                {isVideoEnabled && hasCamera ? <Video size={24} /> : <VideoOff size={24} />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled && hasCamera ? t('call.camera_off') : t('call.camera')}
              </span>
            </button>

            {isConnected && (
              <button
                type="button"
                onClick={toggleScreenShare}
                aria-label={isScreenSharing ? t('call.stop_screen_share') : t('call.screen_share')}
                className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95"
                  style={neutralButtonStyle(isScreenSharing)}
                >
                  {isScreenSharing ? <ScreenShareOff size={24} /> : <ScreenShare size={24} />}
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                  {isScreenSharing ? t('call.stop_screen_share') : t('call.screen_share')}
                </span>
              </button>
            )}

            {isConnected && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsVolumeOpen(!isVolumeOpen)}
                  aria-label={t('call.volume_settings')}
                  className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95"
                    style={neutralButtonStyle(isVolumeOpen)}
                  >
                    <Volume2 size={24} />
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
                    {t('call.volume')}
                  </span>
                </button>

                <AnimatePresence>
                  {isVolumeOpen && (
                    <motion.div
                      ref={volumeMenuRef}
                      initial={{ opacity: 0, y: 16, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 16, scale: 0.95 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      className="absolute bottom-20 left-1/2 -translate-x-1/2 w-80 p-4 rounded-3xl shadow-2xl flex flex-col gap-3.5 z-50 select-none"
                      style={{
                        backgroundColor: 'rgba(24, 24, 30, 0.94)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                      }}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-xl flex items-center justify-center shadow-inner"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 22%, transparent)',
                              color: 'var(--accent-color, #7C3AED)',
                            }}
                          >
                            <Volume2 size={16} />
                          </div>
                          <div>
                            <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-main, #ffffff)' }}>
                              {t('call.volume_settings', 'Громкость звонка')}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsVolumeOpen(false)}
                          aria-label={t('call.close', 'Закрыть')}
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div
                        className="flex flex-col gap-2 p-3 rounded-2xl transition-colors"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.035)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPeerVolume(peerVolume > 0 ? 0 : 100)}
                              aria-label={t('call.peer_volume')}
                              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer flex items-center justify-center"
                            >
                              {peerVolume === 0 ? (
                                <VolumeX size={16} className="text-red-400" />
                              ) : peerVolume < 60 ? (
                                <Volume1 size={16} style={{ color: 'var(--accent-color, #7C3AED)' }} />
                              ) : (
                                <Volume2 size={16} style={{ color: 'var(--accent-color, #7C3AED)' }} />
                              )}
                            </button>
                            <span className="text-xs font-medium" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                              {t('call.peer_volume', 'Собеседник')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {peerVolume > 100 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Zap size={10} />
                                Boost {peerVolume}%
                              </span>
                            )}
                            {peerVolume <= 100 && (
                              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-main, #ffffff)' }}>
                                {peerVolume}%
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="relative flex items-center py-1">
                          <input
                            type="range"
                            min="0"
                            max="200"
                            step="1"
                            value={peerVolume}
                            onChange={(e) => setPeerVolume(Number(e.target.value))}
                            aria-label={t('call.peer_volume')}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, ${peerVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)'} 0%, ${peerVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)'} ${(peerVolume / 200) * 100}%, rgba(255,255,255,0.12) ${(peerVolume / 200) * 100}%, rgba(255,255,255,0.12) 100%)`,
                              accentColor: peerVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)',
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          {[0, 50, 100, 150, 200].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setPeerVolume(val)}
                              aria-label={`${val}%`}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors border-0 cursor-pointer"
                              style={{
                                backgroundColor: peerVolume === val
                                  ? (val > 100 ? 'rgba(245, 158, 11, 0.25)' : 'color-mix(in srgb, var(--accent-color, #7C3AED) 25%, transparent)')
                                  : 'rgba(255, 255, 255, 0.05)',
                                color: peerVolume === val
                                  ? (val > 100 ? '#fbbf24' : 'var(--accent-color, #7C3AED)')
                                  : 'var(--text-dim, #8a96a3)',
                              }}
                            >
                              {val === 0 ? '0%' : `${val}%`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className="flex flex-col gap-2 p-3 rounded-2xl transition-colors"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.035)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setMicVolume(micVolume > 0 ? 0 : 100)}
                              aria-label={t('call.mic_volume')}
                              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer flex items-center justify-center"
                            >
                              {micVolume === 0 ? (
                                <MicOff size={16} className="text-red-400" />
                              ) : (
                                <Mic size={16} style={{ color: 'var(--accent-color, #7C3AED)' }} />
                              )}
                            </button>
                            <span className="text-xs font-medium" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                              {t('call.mic_volume', 'Микрофон')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {micVolume > 100 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Zap size={10} />
                                Boost {micVolume}%
                              </span>
                            )}
                            {micVolume <= 100 && (
                              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--text-main, #ffffff)' }}>
                                {micVolume}%
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="relative flex items-center py-1">
                          <input
                            type="range"
                            min="0"
                            max="200"
                            step="1"
                            value={micVolume}
                            onChange={(e) => setMicVolume(Number(e.target.value))}
                            aria-label={t('call.mic_volume')}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, ${micVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)'} 0%, ${micVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)'} ${(micVolume / 200) * 100}%, rgba(255,255,255,0.12) ${(micVolume / 200) * 100}%, rgba(255,255,255,0.12) 100%)`,
                              accentColor: micVolume > 100 ? '#f59e0b' : 'var(--accent-color, #7C3AED)',
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          {[0, 50, 100, 150, 200].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setMicVolume(val)}
                              aria-label={`${val}%`}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors border-0 cursor-pointer"
                              style={{
                                backgroundColor: micVolume === val
                                  ? (val > 100 ? 'rgba(245, 158, 11, 0.25)' : 'color-mix(in srgb, var(--accent-color, #7C3AED) 25%, transparent)')
                                  : 'rgba(255, 255, 255, 0.05)',
                                color: micVolume === val
                                  ? (val > 100 ? '#fbbf24' : 'var(--accent-color, #7C3AED)')
                                  : 'var(--text-dim, #8a96a3)',
                              }}
                            >
                              {val === 0 ? '0%' : `${val}%`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className="flex flex-col gap-2 p-3 rounded-2xl transition-colors"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.035)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                            {t('settings.noise_suppression_title')}
                          </span>
                          <span className="text-xs font-bold" style={{ color: 'var(--text-main, #ffffff)' }}>
                            {noiseSuppressionMode === 'krisp'
                              ? t('settings.noise_suppression_krisp')
                              : noiseSuppressionMode === 'standard'
                              ? t('settings.noise_suppression_standard')
                              : t('settings.noise_suppression_none')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 pt-0.5">
                          {(['none', 'standard', 'krisp'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setNoiseSuppressionMode(mode);
                                liveKitService.setNoiseSuppressionMode(mode);
                              }}
                              aria-label={t(`settings.noise_suppression_${mode}`)}
                              className="flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition-colors border-0 cursor-pointer"
                              style={{
                                backgroundColor: noiseSuppressionMode === mode
                                  ? 'color-mix(in srgb, var(--accent-color, #7C3AED) 25%, transparent)'
                                  : 'rgba(255, 255, 255, 0.05)',
                                color: noiseSuppressionMode === mode
                                  ? 'var(--accent-color, #7C3AED)'
                                  : 'var(--text-dim, #8a96a3)',
                              }}
                            >
                              {t(`settings.noise_suppression_${mode}`)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {audioInputs.length > 1 && (
                        <div
                          className="flex flex-col gap-1.5 p-3 rounded-2xl transition-colors"
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.035)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                          }}
                        >
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                            {t('settings.microphone_device')}
                          </span>
                          <select
                            value={selectedMicrophoneId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedMicrophoneId(id);
                              liveKitService.switchDevice('audioinput', id);
                            }}
                            aria-label={t('settings.microphone_device')}
                            className="w-full text-xs p-1.5 rounded-lg bg-white/5 border border-white/10 text-white outline-none cursor-pointer"
                          >
                            <option value="" className="bg-neutral-900 text-white">
                              {t('settings.default_device')}
                            </option>
                            {audioInputs.map((d) => (
                              <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900 text-white">
                                {d.label || `${t('settings.microphone_device')} ${d.deviceId.slice(0, 4)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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

      <ScreenSharePickerModal />
    </div>
  );
};
