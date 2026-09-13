import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Mic, MicOff, Video, VideoOff, X, ScreenShare, ScreenShareOff } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';
import { TitleBar } from '../layout/TitleBar';
import { ScreenSharePickerModal } from './ScreenSharePickerModal';

interface CallStatePayload {
  activeCall: {
    chatId: string;
    roomName: string;
    direction: 'incoming' | 'outgoing';
    callType: 'audio' | 'video';
    startTime: number;
    participants: any[];
    isMuted: boolean;
    verificationEmojis?: string[];
    otherName?: string;
    otherAvatar?: string | null;
  } | null;
  incomingCall: {
    from: string;
    chatId: string;
    callType: 'audio' | 'video';
    roomName: string;
    timestamp: number;
    otherName?: string;
    otherAvatar?: string | null;
  } | null;
  callState: 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
  isMicEnabled: boolean;
  isVideoEnabled?: boolean;
  isScreenSharing?: boolean;
  duration: number;
  statusMessage: string;
  myNickname: string | null;
  peerVolume?: number;
  micVolume?: number;
  noiseSuppressionMode?: 'krisp' | 'standard' | 'none';
}

const accentButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent-color, #7C3AED), var(--accent-dark, #5B21B6))',
  color: 'var(--settings-on-primary, #ffffff)',
};

const rejectButtonStyle: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, rgba(255, 255, 255, 0.16))',
  color: 'var(--text-main, #ffffff)',
};

const neutralButtonStyle = (active: boolean): React.CSSProperties => ({
  backgroundColor: active ? 'var(--surface-container-strong, rgba(255,255,255,0.15))' : 'var(--surface-muted, rgba(255,255,255,0.08))',
  color: active ? 'var(--accent-color, #a995ec)' : 'var(--text-dim, #8a96a3)',
});

export const CallWindowView = () => {
  const { t } = useTranslation();
  const [callData, setCallData] = useState<CallStatePayload | null>(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const nameParam = searchParams.get('name');
      if (nameParam) {
        const direction = (searchParams.get('direction') as any) || 'outgoing';
        const callType = (searchParams.get('type') as any) || 'audio';
        const chatId = searchParams.get('chatId') || '';
        const stateParam = (searchParams.get('state') as any) || 'preparing';
        const avatarParam = searchParams.get('avatar') || null;

        return {
          activeCall: {
            chatId,
            roomName: searchParams.get('roomName') || '',
            direction,
            callType,
            startTime: 0,
            participants: [],
            isMuted: false,
            otherName: nameParam,
            otherAvatar: avatarParam,
          },
          incomingCall: direction === 'incoming' ? {
            from: nameParam,
            chatId,
            callType,
            roomName: '',
            timestamp: Date.now(),
            otherName: nameParam,
            otherAvatar: avatarParam,
          } : null,
          callState: stateParam,
          isMicEnabled: true,
          duration: 0,
          statusMessage: '',
          myNickname: null,
        };
      }
      const saved = localStorage.getItem('orbita_active_call_state');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  useEffect(() => {
    const applyVars = (vars: Record<string, string>) => {
      const root = document.documentElement;
      Object.entries(vars).forEach(([key, val]) => {
        root.style.setProperty(key, val as string);
      });
    };

    const bg = 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, var(--bg-primary, #14111d))';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    const orbita = (window as any).orbita;

    if (orbita?.getCurrentTheme) {
      orbita.getCurrentTheme().then((themeData: any) => {
        if (themeData?.themeVars) {
          applyVars(themeData.themeVars);
        }
      }).catch(() => {});
    }

    if (orbita?.getCallState) {
      orbita.getCallState().then((state: CallStatePayload | null) => {
        if (state) setCallData(state);
      }).catch(() => {});
    }

    const unsubState = orbita?.onCallState?.((state: CallStatePayload) => {
      if (state) setCallData(state);
    });

    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('orbita-call-channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'CALL_STATE_UPDATE' && event.data.payload) {
          setCallData(event.data.payload);
        }
      };
      broadcastChannel.postMessage({ type: 'REQUEST_CALL_STATE' });
    } catch {}

    const handleFocusSync = () => {
      if (orbita?.getCallState) {
        orbita.getCallState().then((state: CallStatePayload | null) => {
          if (state) setCallData(state);
        }).catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    const handleBeforeUnload = () => {
      sendAction('cancelCall');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const unsubThemeChanged = orbita?.onThemeChanged?.((data: any) => {
      if (data?.themeVars) {
        applyVars(data.themeVars);
      }
    });

    return () => {
      unsubThemeChanged?.();
      unsubState?.();
      broadcastChannel?.close();
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const sendAction = (type: string, payload?: any) => {
    const orbita = (window as any).orbita;
    if (orbita?.sendCallAction) {
      orbita.sendCallAction({ type, payload });
      return;
    }
    try {
      const bc = new BroadcastChannel('orbita-call-channel');
      bc.postMessage({ type: 'CALL_ACTION', action: type, payload });
      setTimeout(() => {
        try { bc.close(); } catch {}
      }, 500);
    } catch {}
  };

  const handleToggleMic = () => {
    const next = !isMicEnabled;
    setCallData((prev) => (prev ? { ...prev, isMicEnabled: next } : prev));
    sendAction('toggleMic', next);
  };

  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState<boolean>(false);

  useEffect(() => {
    const checkCameraAvailability = async () => {
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

    checkCameraAvailability();
    navigator.mediaDevices?.addEventListener?.('devicechange', checkCameraAvailability);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', checkCameraAvailability);
    };
  }, []);

  const handleToggleVideo = () => {
    const next = !isVideoEnabled;
    setCallData((prev) => (prev ? { ...prev, isVideoEnabled: next } : prev));
    if (hasCamera) {
      sendAction('toggleVideo', next);
    }
  };

  const handleToggleScreenShare = () => {
    if (isScreenSharing) {
      sendAction('stopScreenShare');
      setCallData((prev) => (prev ? { ...prev, isScreenSharing: false } : prev));
    } else {
      setIsScreenPickerOpen(true);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeCall = callData?.activeCall;
  const incomingCall = callData?.incomingCall;
  const callState = callData?.callState || 'idle';
  const isMicEnabled = callData?.isMicEnabled ?? false;
  const isVideoEnabled = callData?.isVideoEnabled ?? (activeCall?.callType === 'video');
  const isScreenSharing = callData?.isScreenSharing ?? false;
  const duration = callData?.duration ?? 0;
  const statusMessage = callData?.statusMessage ?? '';

  const isIncoming = !!incomingCall || (activeCall?.direction === 'incoming' && callState === 'ringing');
  const otherName = activeCall?.otherName || incomingCall?.otherName || incomingCall?.from || activeCall?.chatId || '';
  const otherAvatar = activeCall?.otherAvatar || incomingCall?.otherAvatar || null;

  const isConnected = callState === 'connected';
  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isEnded = callState === 'ended';

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const isCallActive = callState === 'ringing' || callState === 'connecting' || callState === 'connected' || callState === 'preparing';
    const showWebcam = isCallActive && isVideoEnabled && hasCamera;

    if (!showWebcam) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        streamRef.current = null;
      }
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
          stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        streamRef.current = null;
      }
    };
  }, [callState, isVideoEnabled, hasCamera]);

  return (
    <div
      className="w-full h-full min-h-screen flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-main, #ffffff)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ['--title-bar-bg' as any]: 'transparent',
      }}
    >
      <TitleBar />

      <div className="h-7 flex items-center justify-center flex-shrink-0 relative z-30">
        {isConnected && activeCall?.verificationEmojis && activeCall.verificationEmojis.length === 4 && (
          <CallVerificationBadge emojis={activeCall.verificationEmojis} />
        )}
      </div>

      {isVideoEnabled && (
        hasCamera ? (
          <div className="absolute top-12 right-5 z-40 w-32 h-44 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl bg-black/70 border-0 select-none">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>
        ) : (
          <div className="absolute top-12 right-5 z-40 w-40 h-28 rounded-2xl shadow-2xl bg-black/75 backdrop-blur-md p-3 flex flex-col items-center justify-center text-center border-0 select-none">
            <VideoOff size={22} className="text-amber-400 mb-1.5" />
            <span className="text-[11px] font-medium text-white/80">
              {t('call.no_camera_available')}
            </span>
          </div>
        )
      )}

      <div className="flex flex-col items-center justify-center flex-1 py-4">
        <div className="w-[150px] h-[150px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
          {otherName ? (
            <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '54px' }} />
          ) : (
            <div className="w-full h-full rounded-full bg-white/5 animate-pulse" />
          )}
        </div>

        <h2
          className="mt-7 text-xl font-bold tracking-tight text-center px-4 truncate max-w-full min-h-[28px]"
          style={{ color: 'var(--text-main, #ffffff)' }}
        >
          {otherName}
        </h2>

        {isIncoming ? (
          <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
            {t('call.calling_you')}
          </p>
        ) : isPreparing ? (
          <p className="mt-1 text-sm text-center max-w-sm px-4" style={{ color: 'var(--text-dim, #8a96a3)' }}>
            {t('call.video_call_hint')}
          </p>
        ) : isConnected ? (
          <p
            className="mt-1 text-sm tabular-nums font-semibold text-center"
            style={{ color: 'var(--accent-light, #a995ec)' }}
          >
            {formatDuration(duration)}
          </p>
        ) : statusMessage ? (
          <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
            {statusMessage}
          </p>
        ) : null}
      </div>

      {isScreenSharing && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 shadow-lg select-none">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[12px] font-medium text-white/90">
            {t('call.sharing_your_screen', 'Вы транслируете свой экран')}
          </span>
          <button
            type="button"
            onClick={handleToggleScreenShare}
            aria-label={t('call.stop_screen_share', 'Остановить')}
            className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors border-0 cursor-pointer ml-1"
          >
            {t('call.stop_screen_share', 'Остановить')}
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-5 pb-5 pt-1">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => sendAction('rejectCall')}
              aria-label={t('call.reject')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('answerCall')}
              aria-label={t('call.answer')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                <Phone size={20} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.answer') || 'Принять'}
              </span>
            </button>
          </>
        ) : isPreparing ? (
          <>
            <button
              type="button"
              onClick={handleToggleVideo}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all"
                style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled ? <Video size={20} color="#ffffff" /> : <VideoOff size={20} color="#ffffff" />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.enable_video')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sendAction('cancelCall');
                try { (window as any).orbita?.closeCallWindow?.(); } catch {}
              }}
              aria-label={t('call.cancel')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('initiateCall')}
              aria-label={t('call.call')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                <Phone size={20} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.call')}
              </span>
            </button>
          </>
        ) : (isRinging || isConnecting || isConnected) ? (
          <>
            <button
              type="button"
              onClick={handleToggleMic}
              aria-label={isMicEnabled ? t('call.mic') : t('call.mic_off')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isMicEnabled)}>
                {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleVideo}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent outline-none cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all" style={neutralButtonStyle(isVideoEnabled)}>
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera')}
              </span>
            </button>

            {(isConnected || isRinging || isConnecting) && (
              <button
                type="button"
                onClick={handleToggleScreenShare}
                aria-label={isScreenSharing ? t('call.stop_screen_share') : t('call.screen_share')}
                className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isScreenSharing)}>
                  {isScreenSharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
                </div>
                <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                  {isScreenSharing ? t('call.stop_screen_share') : t('call.screen_share')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => sendAction('endCall')}
              aria-label={t('call.hang_up')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.hang_up')}
              </span>
            </button>
          </>
        ) : isEnded ? (
          <button
            type="button"
            onClick={() => {
              sendAction('cancelCall');
              try { (window as any).orbita?.closeCallWindow?.(); } catch {}
            }}
            aria-label={t('call.close')}
            className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
              <X size={20} color="#ffffff" />
            </div>
            <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.close')}
            </span>
          </button>
        ) : null}
      </div>

      <ScreenSharePickerModal
        isOpen={isScreenPickerOpen}
        onClose={() => setIsScreenPickerOpen(false)}
        onStart={(options) => {
          setIsScreenPickerOpen(false);
          sendAction('startScreenShareWithOptions', options);
        }}
      />
    </div>
  );
};
