import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Mic, MicOff, Video, VideoOff, X, ScreenShare, ScreenShareOff, Volume2 } from 'lucide-react';
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
  const [peerVolume, setPeerVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('orbita_call_peer_volume');
      return saved ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });
  const [micVolume, setMicVolumeState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('orbita_call_mic_volume');
      return saved ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });
  const [isVolumeOpen, setIsVolumeOpen] = useState<boolean>(false);
  const volumeMenuRef = useRef<HTMLDivElement>(null);
  const [noiseSuppressionMode, setNoiseSuppressionModeState] = useState<'krisp' | 'standard' | 'none'>(() => {
    try {
      const saved = localStorage.getItem('orbita_noise_suppression_mode');
      return (saved as any) || 'standard';
    } catch {
      return 'standard';
    }
  });
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => {
    try {
      return localStorage.getItem('orbita_selected_mic_id') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (callData?.peerVolume !== undefined) setPeerVolumeState(callData.peerVolume);
    if (callData?.micVolume !== undefined) setMicVolumeState(callData.micVolume);
    if (callData?.noiseSuppressionMode !== undefined) setNoiseSuppressionModeState(callData.noiseSuppressionMode);
  }, [callData?.peerVolume, callData?.micVolume, callData?.noiseSuppressionMode]);

  useEffect(() => {
    const loadAudioInputs = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
      } catch {}
    };
    loadAudioInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', loadAudioInputs);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', loadAudioInputs);
    };
  }, []);

  const handleSetNoiseSuppressionMode = (mode: 'krisp' | 'standard' | 'none') => {
    setNoiseSuppressionModeState(mode);
    try { localStorage.setItem('orbita_noise_suppression_mode', mode); } catch {}
    sendAction('setNoiseSuppressionMode', mode);
  };

  const handleSelectMic = (id: string) => {
    setSelectedMicId(id);
    try { localStorage.setItem('orbita_selected_mic_id', id); } catch {}
    sendAction('switchAudioDevice', { kind: 'audioinput', deviceId: id });
  };

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

  const handleSetPeerVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(200, Math.round(vol)));
    setPeerVolumeState(clamped);
    try { localStorage.setItem('orbita_call_peer_volume', String(clamped)); } catch {}
    sendAction('setPeerVolume', clamped);
  };

  const handleSetMicVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(200, Math.round(vol)));
    setMicVolumeState(clamped);
    try { localStorage.setItem('orbita_call_mic_volume', String(clamped)); } catch {}
    sendAction('setMicVolume', clamped);
  };

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
    if (!hasCamera) return;
    const next = !isVideoEnabled;
    setCallData((prev) => (prev ? { ...prev, isVideoEnabled: next } : prev));
    sendAction('toggleVideo', next);
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
    const isCallActive = callState === 'ringing' || callState === 'connecting' || callState === 'connected';
    const showWebcam = isCallActive && isVideoEnabled && hasCamera;

    if (!showWebcam) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
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
          stream.getTracks().forEach((t) => t.stop());
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
        streamRef.current.getTracks().forEach((t) => t.stop());
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

      <div className="flex flex-col items-center justify-center flex-1 py-4">
        {((callState === 'ringing' || callState === 'connecting' || callState === 'connected') && isVideoEnabled && hasCamera) ? (
          <div className="w-[180px] h-[180px] rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-black/60 flex items-center justify-center select-none">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>
        ) : (
          <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
            {otherName ? (
              <Avatar src={otherAvatar} alt={otherName} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '48px' }} />
            ) : (
              <div className="w-full h-full rounded-full bg-white/5 animate-pulse" />
            )}
          </div>
        )}

        <h2
          className="mt-4 text-xl font-bold tracking-tight text-center px-4 truncate max-w-full min-h-[28px]"
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

      <div className="flex items-center justify-center gap-6 pb-8 pt-2">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => sendAction('rejectCall')}
              aria-label={t('call.reject')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('answerCall')}
              aria-label={t('call.answer')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                <Phone size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.answer') || 'Принять'}
              </span>
            </button>
          </>
        ) : isPreparing ? (
          <>
            <button
              type="button"
              disabled={!hasCamera}
              onClick={hasCamera ? handleToggleVideo : undefined}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none"
              style={{
                pointerEvents: hasCamera ? 'auto' : 'none',
                opacity: hasCamera ? 1 : 0.35,
                cursor: hasCamera ? 'pointer' : 'default',
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-md"
                style={isVideoEnabled && hasCamera ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled && hasCamera ? <Video size={24} color="#ffffff" /> : <VideoOff size={24} color="#ffffff" />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled && hasCamera ? t('call.camera_off') : t('call.enable_video')}
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
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('initiateCall')}
              aria-label={t('call.call')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
                <Phone size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
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
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isMicEnabled)}>
                {isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              disabled={!hasCamera}
              onClick={hasCamera ? handleToggleVideo : undefined}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent outline-none"
              style={{
                pointerEvents: hasCamera ? 'auto' : 'none',
                opacity: hasCamera ? 1 : 0.35,
                cursor: hasCamera ? 'pointer' : 'default',
              }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isVideoEnabled && hasCamera)}>
                {isVideoEnabled && hasCamera ? <Video size={24} /> : <VideoOff size={24} />}
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                {isVideoEnabled && hasCamera ? t('call.camera_off') : t('call.camera')}
              </span>
            </button>

            {(isConnected || isRinging || isConnecting) && (
              <button
                type="button"
                onClick={handleToggleScreenShare}
                aria-label={isScreenSharing ? t('call.stop_screen_share') : t('call.screen_share')}
                className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isScreenSharing)}>
                  {isScreenSharing ? <ScreenShareOff size={24} /> : <ScreenShare size={24} />}
                </div>
                <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
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
                  className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={neutralButtonStyle(isVolumeOpen)}>
                    <Volume2 size={24} />
                  </div>
                  <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
                    {t('call.volume')}
                  </span>
                </button>

                {isVolumeOpen && (
                  <div
                    ref={volumeMenuRef}
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 w-72 p-4 rounded-2xl shadow-2xl flex flex-col gap-4 z-50 select-none"
                    style={{
                      backgroundColor: 'var(--surface-container, #1e1e24)',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="flex items-center justify-between pb-1 border-b border-white/10">
                      <div className="flex items-center gap-2">
                        <Volume2 size={16} style={{ color: 'var(--accent-color, #7C3AED)' }} />
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-main, #ffffff)' }}>
                          {t('call.volume_settings')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsVolumeOpen(false)}
                        aria-label={t('call.close')}
                        className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors border-0 bg-transparent cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-dim, #8a96a3)' }}>
                          {t('call.peer_volume')}
                        </span>
                        <div className="flex items-center gap-1">
                          {peerVolume > 100 && (
                            <span className="text-[10px] px-1 py-0.2 rounded font-medium bg-amber-500/20 text-amber-300">
                              {t('call.volume_boost')}
                            </span>
                          )}
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-main, #ffffff)' }}>
                            {peerVolume}%
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="1"
                        value={peerVolume}
                        onChange={(e) => handleSetPeerVolume(Number(e.target.value))}
                        aria-label={t('call.peer_volume')}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: 'var(--accent-color, #7C3AED)' }}
                      />
                      <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                        <span>0%</span>
                        <span style={{ color: peerVolume === 100 ? 'var(--accent-color, #7C3AED)' : undefined }}>100%</span>
                        <span>200%</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-dim, #8a96a3)' }}>
                          {t('call.mic_volume')}
                        </span>
                        <div className="flex items-center gap-1">
                          {micVolume > 100 && (
                            <span className="text-[10px] px-1 py-0.2 rounded font-medium bg-amber-500/20 text-amber-300">
                              {t('call.volume_boost')}
                            </span>
                          )}
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--text-main, #ffffff)' }}>
                            {micVolume}%
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="200"
                        step="1"
                        value={micVolume}
                        onChange={(e) => handleSetMicVolume(Number(e.target.value))}
                        aria-label={t('call.mic_volume')}
                        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: 'var(--accent-color, #7C3AED)' }}
                      />
                      <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                        <span>0%</span>
                        <span style={{ color: micVolume === 100 ? 'var(--accent-color, #7C3AED)' : undefined }}>100%</span>
                        <span>200%</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between text-xs">
                        <span style={{ color: 'var(--text-dim, #8a96a3)' }}>
                          {t('settings.noise_suppression_title')}
                        </span>
                        <span className="font-semibold text-xs" style={{ color: 'var(--text-main, #ffffff)' }}>
                          {noiseSuppressionMode === 'krisp'
                            ? t('settings.noise_suppression_krisp')
                            : noiseSuppressionMode === 'standard'
                            ? t('settings.noise_suppression_standard')
                            : t('settings.noise_suppression_none')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(['none', 'standard', 'krisp'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleSetNoiseSuppressionMode(mode)}
                            aria-label={t(`settings.noise_suppression_${mode}`)}
                            className="flex-1 py-1 px-1 rounded-lg text-xs font-medium transition-colors border-0 cursor-pointer"
                            style={{
                              backgroundColor: noiseSuppressionMode === mode
                                ? 'color-mix(in srgb, var(--accent-color, #7C3AED) 28%, transparent)'
                                : 'rgba(255, 255, 255, 0.06)',
                              color: noiseSuppressionMode === mode
                                ? 'var(--accent-color, #a995ec)'
                                : 'var(--text-dim, #8a96a3)',
                            }}
                          >
                            {t(`settings.noise_suppression_${mode}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {audioInputs.length > 1 && (
                      <div className="flex flex-col gap-1 pt-2 border-t border-white/10">
                        <span className="text-[11px]" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                          {t('settings.microphone_device')}
                        </span>
                        <select
                          value={selectedMicId}
                          onChange={(e) => handleSelectMic(e.target.value)}
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
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => sendAction('endCall')}
              aria-label={t('call.hang_up')}
              className="flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none"
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
                <X size={24} color="#ffffff" />
              </div>
              <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
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
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-colors" style={rejectButtonStyle}>
              <X size={24} color="#ffffff" />
            </div>
            <span style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '12px', fontWeight: 500 }}>
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
