import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { liveKitService } from '../../services/livekitService';
import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, X, ScreenShare, ScreenShareOff, Maximize2, Minimize2 } from 'lucide-react';
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
  const [expandedShare, setExpandedShare] = useState<'remote' | 'local' | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  useEffect(() => {
    const checkDevices = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setHasCamera(false);
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasCamera(videoInputs.length > 0);
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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const callContainerRef = useRef<HTMLDivElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const attachedElements = useRef<Map<string, HTMLMediaElement>>(new Map());

  const attachRemoteScreenShare = useCallback((el: HTMLVideoElement | null) => {
    remoteScreenShareRef.current = el;
    if (el) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachLocalScreenShare = useCallback((el: HTMLVideoElement | null) => {
    localScreenShareRef.current = el;
    if (el) {
      const track = liveKitService.getScreenShareTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localVideoRef.current = el;
    if (el) {
      const track = liveKitService.getLocalVideoTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteVideoRef.current = el;
    if (el) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) track.attach(el);
    }
  }, []);

  const attachBgVideo = useCallback((el: HTMLVideoElement | null) => {
    bgVideoRef.current = el;
    if (el) {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && !sTrack.isMuted) {
        sTrack.attach(el);
      } else {
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) {
          rTrack.attach(el);
        }
      }
    }
  }, []);

  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isConnected = callState === 'connected';
  const isEnded = callState === 'ended';

  const hasLocalScreenShare = (isConnected || isConnecting) && isScreenSharing;
  const hasRemoteStream = isRemoteVideoActive || isRemoteScreenShareActive;
  const isDualStream = hasRemoteStream && hasLocalScreenShare;
  const hasAnyActiveStream = hasRemoteStream || hasLocalScreenShare;

  const currentRoomName = activeCall?.roomName;
  const prevRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentRoomName !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomName || null;
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsRemoteScreenShareActive(false);
      setIsFullscreen(false);
      setExpandedShare(null);
      setLocalDuration(0);
    }
  }, [currentRoomName]);

  useEffect(() => {
    if (!isConnected && !isConnecting) {
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsRemoteScreenShareActive(false);
      setIsFullscreen(false);
      setExpandedShare(null);
    }
  }, [isConnected, isConnecting]);

  const [localDuration, setLocalDuration] = useState<number>(0);

  useEffect(() => {
    if (!isConnected) {
      setLocalDuration(duration);
      return;
    }
    const start = activeCall?.startTime && activeCall.startTime > 0 ? activeCall.startTime : Date.now();
    const tick = () => {
      setLocalDuration(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isConnected, activeCall?.startTime, duration]);

  useEffect(() => {
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) {
        track.attach(remoteScreenShareRef.current);
      }
    }
  }, [isRemoteScreenShareActive]);

  useEffect(() => {
    if (isRemoteVideoActive && remoteVideoRef.current) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) {
        track.attach(remoteVideoRef.current);
        if (bgVideoRef.current) {
          track.attach(bgVideoRef.current);
        }
      }
    }
  }, [isRemoteVideoActive]);

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
          setIsRemoteScreenShareActive(true);
          if (remoteScreenShareRef.current) {
            track.attach(remoteScreenShareRef.current);
          }
        } else {
          setIsRemoteVideoActive(true);
          if (remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (bgVideoRef.current) {
            track.attach(bgVideoRef.current);
          }
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
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
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
        if (bgVideoRef.current) {
          track.attach(bgVideoRef.current);
        }
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
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
          }
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
    const sTrack = liveKitService.getRemoteScreenShareTrack();
    if (sTrack && !sTrack.isMuted && remoteScreenShareRef.current) {
      sTrack.attach(remoteScreenShareRef.current);
      if (bgVideoRef.current) sTrack.attach(bgVideoRef.current);
      setIsRemoteScreenShareActive(true);
    }
    const track = liveKitService.getRemoteVideoTrack();
    if (track && !track.isMuted && remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
      if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) {
        track.attach(bgVideoRef.current);
      }
      setIsRemoteVideoActive(true);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!bgVideoRef.current) return;
    if (isRemoteScreenShareActive) {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack) {
        if (remoteScreenShareRef.current) sTrack.attach(remoteScreenShareRef.current);
        sTrack.attach(bgVideoRef.current);
      }
    } else if (isRemoteVideoActive) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) {
        if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
        track.attach(bgVideoRef.current);
      }
    }
  }, [isRemoteScreenShareActive, isRemoteVideoActive]);

  useEffect(() => {
    if (remoteScreenShareTrack) {
      if (remoteScreenShareRef.current) remoteScreenShareTrack.attach(remoteScreenShareRef.current);
      if (bgVideoRef.current) remoteScreenShareTrack.attach(bgVideoRef.current);
      setIsRemoteScreenShareActive(true);
    } else {
      setIsRemoteScreenShareActive(false);
      if (bgVideoRef.current) {
        bgVideoRef.current.srcObject = null;
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) rTrack.attach(bgVideoRef.current);
      }
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
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) track.attach(remoteScreenShareRef.current);
    }
    if (hasLocalScreenShare && localScreenShareRef.current) {
      const track = liveKitService.getScreenShareTrack();
      if (track) track.attach(localScreenShareRef.current);
    }
    if (isLocalVideoActive && localVideoRef.current) {
      const track = liveKitService.getLocalVideoTrack();
      if (track) track.attach(localVideoRef.current);
    }
    if (isRemoteVideoActive && remoteVideoRef.current) {
      const track = liveKitService.getRemoteVideoTrack();
      if (track) track.attach(remoteVideoRef.current);
    }
  }, [isRemoteScreenShareActive, hasLocalScreenShare, isLocalVideoActive, isRemoteVideoActive, isDualStream, expandedShare]);

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
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: 'user' },
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
            <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
              <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
            </div>
            <h2 className="mt-7 text-xl font-bold tracking-tight text-center" style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>
            <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim)' }}>
              {activeCall.callType === 'video' ? t('call.incoming_video_call') : t('call.incoming_audio_call')}
            </p>
          </div>

          <div className="flex items-center justify-center gap-5 pb-5 pt-1 relative z-10">
            <button
              type="button"
              onClick={() => useCallStore.getState().rejectCall()}
              aria-label={t('call.reject')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-md">
                <X size={20} color="#000000" />
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => useCallStore.getState().answerCall(myNickname!)}
              aria-label={t('call.answer')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                {activeCall.callType === 'video' ? <Video size={20} color="#ffffff" /> : <Phone size={20} color="#ffffff" />}
              </div>
              <span style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
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
      ref={callContainerRef}
      className="fixed inset-0 z-[400] flex flex-col justify-between overflow-hidden select-none"
      style={{
        display: isMinimized ? 'none' : 'flex',
        backgroundColor: 'var(--bg-primary)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {(isRemoteVideoActive || isRemoteScreenShareActive) && (
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
          style={{ contain: 'strict' }}
        >
          <video
            ref={attachBgVideo}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover pointer-events-none"
            style={{
              filter: 'blur(30px)',
              transform: 'scale(1.15) translate3d(0, 0, 0)',
              willChange: 'transform',
              opacity: 0.35,
              backfaceVisibility: 'hidden',
            }}
          />
          <div className="absolute inset-0 bg-black/45 pointer-events-none" />
        </div>
      )}

      <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

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

      {isRemoteScreenShareActive && (
        <div className="absolute top-14 left-16 z-30 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg select-none">
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


      <AnimatePresence>
        {(isRemoteVideoActive || isRemoteScreenShareActive) && isLocalVideoActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            drag
            dragConstraints={{ top: 10, left: -600, right: 10, bottom: 400 }}
            dragElastic={0.05}
            className="absolute top-16 right-6 z-40 w-36 h-52 sm:w-44 sm:h-64 rounded-2xl overflow-hidden shadow-2xl border-0 bg-black/70 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
          >
            <video
              ref={attachLocalVideo}
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
        {isVideoEnabled && !hasCamera && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-16 right-6 z-40 w-48 h-36 rounded-2xl shadow-2xl bg-black/80 backdrop-blur-md p-4 flex flex-col items-center justify-center text-center border-0 select-none"
          >
            <VideoOff size={28} className="text-amber-400 mb-2" />
            <span className="text-[13px] font-medium text-white/90 leading-snug">
              {t('call.no_camera_available')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full px-4 min-h-0 overflow-hidden">
        {isDualStream ? (
          expandedShare === 'remote' ? (
            <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5">
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={attachRemoteScreenShare}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
                />
                <video
                  ref={attachRemoteVideo}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
                />
                <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-[12px] font-semibold text-white/90 select-none pointer-events-none">
                  {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedShare(null)}
                  aria-label={t('call.exit_fullscreen')}
                  className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
                >
                  <Minimize2 size={20} />
                </button>

                <div
                  onClick={() => setExpandedShare('local')}
                  className="absolute bottom-6 right-6 z-50 w-52 aspect-video rounded-2xl overflow-hidden shadow-2xl bg-[#09080e] border-2 border-white/20 cursor-pointer hover:scale-105 transition-all flex items-center justify-center"
                >
                  <video
                    ref={attachLocalScreenShare}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain pointer-events-none"
                  />
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
                    <span>{t('call.your_screen')}</span>
                  </div>
                  <div className="absolute top-2 right-2 z-10 p-1 rounded-md bg-black/60 text-white/80">
                    <Maximize2 size={12} />
                  </div>
                </div>
              </div>
            </div>
          ) : expandedShare === 'local' ? (
            <div className="fixed inset-0 z-40 bg-black flex items-center justify-center p-3 sm:p-5">
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={attachLocalScreenShare}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-[12px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
                  <span>{t('call.your_screen')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedShare(null)}
                  aria-label={t('call.exit_fullscreen')}
                  className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
                >
                  <Minimize2 size={20} />
                </button>

                <div
                  onClick={() => setExpandedShare('remote')}
                  className="absolute bottom-6 right-6 z-50 w-52 aspect-video rounded-2xl overflow-hidden shadow-2xl bg-[#09080e] border-2 border-white/20 cursor-pointer hover:scale-105 transition-all flex items-center justify-center"
                >
                  <video
                    ref={attachRemoteScreenShare}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-contain pointer-events-none"
                    style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
                  />
                  <video
                    ref={attachRemoteVideo}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover pointer-events-none"
                    style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
                  />
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white/90 select-none pointer-events-none">
                    {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
                  </div>
                  <div className="absolute top-2 right-2 z-10 p-1 rounded-md bg-black/60 text-white/80">
                    <Maximize2 size={12} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative z-20 flex flex-row items-center justify-center gap-3.5 w-full px-4 transition-all duration-300 max-w-[1160px] max-h-[58vh]">
              <div
                onClick={() => setExpandedShare('remote')}
                className="relative flex-1 aspect-video rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center bg-[#09080e] cursor-pointer"
              >
                <video
                  ref={attachRemoteScreenShare}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                  style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
                />
                <video
                  ref={attachRemoteVideo}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
                />
                <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
                  {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedShare('remote');
                  }}
                  aria-label={t('call.fullscreen')}
                  className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
                >
                  <Maximize2 size={16} />
                </button>
              </div>

              <div
                onClick={() => setExpandedShare('local')}
                className="relative flex-1 aspect-video rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center bg-[#09080e] cursor-pointer"
              >
                <video
                  ref={attachLocalScreenShare}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
                  <span>{t('call.your_screen')}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedShare('local');
                  }}
                  aria-label={t('call.fullscreen')}
                  className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
          )
        ) : hasRemoteStream ? (
          <div
            onClick={() => setExpandedShare(expandedShare === 'remote' ? null : 'remote')}
            className={`relative z-20 cursor-pointer overflow-hidden transition-all duration-300 shadow-2xl flex items-center justify-center bg-black ${
              expandedShare === 'remote'
                ? 'fixed inset-0 z-40 rounded-none w-full h-full max-w-none max-h-none p-3 sm:p-5'
                : 'w-[86%] max-w-[760px] aspect-video rounded-3xl max-h-[55vh]'
            }`}
            style={{
              borderRadius: expandedShare === 'remote' ? 0 : '24px',
            }}
          >
            <video
              ref={attachRemoteScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
              style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
            />
            <video
              ref={attachRemoteVideo}
              autoPlay
              playsInline
              muted
              className={`w-full h-full ${expandedShare === 'remote' ? 'object-contain' : 'object-cover'}`}
              style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedShare(expandedShare === 'remote' ? null : 'remote');
              }}
              aria-label={expandedShare === 'remote' ? t('call.exit_fullscreen') : t('call.fullscreen')}
              className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
            >
              {expandedShare === 'remote' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none">
              {isRemoteScreenShareActive ? (otherName || t('call.screen_share_of_user')) : otherName}
            </div>
          </div>
        ) : hasLocalScreenShare ? (
          <div
            onClick={() => setExpandedShare(expandedShare === 'local' ? null : 'local')}
            className={`relative z-20 cursor-pointer overflow-hidden transition-all duration-300 shadow-2xl flex items-center justify-center bg-black ${
              expandedShare === 'local'
                ? 'fixed inset-0 z-40 rounded-none w-full h-full max-w-none max-h-none p-3 sm:p-5'
                : 'w-[86%] max-w-[760px] aspect-video rounded-3xl max-h-[55vh]'
            }`}
            style={{
              borderRadius: expandedShare === 'local' ? 0 : '24px',
            }}
          >
            <video
              ref={attachLocalScreenShare}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedShare(expandedShare === 'local' ? null : 'local');
              }}
              aria-label={expandedShare === 'local' ? t('call.exit_fullscreen') : t('call.fullscreen')}
              className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
            >
              {expandedShare === 'local' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <div className="absolute top-3 left-3 z-30 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white/90 select-none pointer-events-none flex items-center gap-1.5">
              <span>{t('call.your_screen')}</span>
            </div>
          </div>
        ) : null}

        {hasAnyActiveStream && !expandedShare && (
          <div className="flex flex-col items-center mt-3 select-none">
            <h2 className="text-xl font-bold tracking-tight text-center truncate max-w-full text-white">
              {otherName}
            </h2>
            <p
              className="mt-0.5 text-sm tabular-nums font-semibold text-center"
              style={{ color: 'var(--accent-light, #a995ec)' }}
            >
              {formatDuration(localDuration > 0 ? localDuration : duration)}
            </p>
          </div>
        )}

        {!hasAnyActiveStream && (
          <>
            <div className="relative w-[150px] h-[150px] flex items-center justify-center select-none">
              {isConnected && (
                <div
                  className="absolute inset-0 rounded-full animate-ping opacity-20 pointer-events-none"
                  style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                />
              )}
              <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-xl pointer-events-none border-2 border-white/10 relative z-10">
                <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
              </div>
            </div>

            <h2 className="mt-7 text-2xl font-bold tracking-tight text-center px-4" style={{ color: 'var(--text-main)' }}>
              {otherName}
            </h2>

            {isPreparing ? (
              <p className="mt-1.5 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim)' }}>
                {t('call.video_call_hint')}
              </p>
            ) : isConnected ? (
              <p className="mt-1.5 text-sm tabular-nums text-center" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                {formatDuration(localDuration > 0 ? localDuration : duration)}
              </p>
            ) : statusMessage ? (
              <p className="mt-1.5 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {statusMessage}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className={`${expandedShare ? 'fixed bottom-0 inset-x-0 z-50 pb-6 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent' : 'pb-5 pt-1 relative z-30'} flex flex-col items-center gap-3 select-none`}>
        {hasLocalScreenShare && (
          <div
            className="relative inline-flex items-center justify-center select-none px-4 py-1.5 rounded-full shadow-md"
            style={{
              backgroundColor: 'var(--surface-muted, rgba(255, 255, 255, 0.08))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <span className="text-[12px] font-medium text-white/90">
              {t('call.sharing_your_screen')}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-5">
        {isPreparing ? (
          <>
            <button
              type="button"
              onClick={() => toggleVideo()}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0"
                style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled ? <Video size={20} color="#ffffff" /> : <VideoOff size={20} color="#ffffff" />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.cancel')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCall}
              aria-label={t('call.call')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0"
                style={accentButtonStyle}
              >
                {isVideoEnabled ? <Video size={20} color="#ffffff" /> : <Phone size={20} color="#ffffff" />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
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
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                style={neutralButtonStyle(isMicEnabled)}
              >
                {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => toggleVideo()}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                style={neutralButtonStyle(isVideoEnabled)}
              >
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            {isConnected && (
              <button
                type="button"
                onClick={toggleScreenShare}
                aria-label={t('call.screen_share')}
                className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-95 flex-shrink-0"
                  style={neutralButtonStyle(hasLocalScreenShare)}
                >
                  {hasLocalScreenShare ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
                </div>
                <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                  {t('call.screen_share')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCancel}
              aria-label={t('call.hang_up')}
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
                <PhoneOff size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.hang_up')}
              </span>
            </button>
          </>
        ) : isEnded ? (
          <button
            type="button"
            onClick={handleCancel}
            aria-label={t('call.close')}
            className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 flex-shrink-0" style={rejectButtonStyle}>
              <X size={20} color="#ffffff" />
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.close')}
            </span>
          </button>
        ) : null}
        </div>
      </div>

      <ScreenSharePickerModal />
    </div>
  );
};
