import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Mic, MicOff, Video, VideoOff, X, ScreenShare, ScreenShareOff, Maximize2, Minimize2 } from 'lucide-react';
import type { RemoteTrack } from 'livekit-client';
import { Avatar } from '../common/Avatar';
import { CallVerificationBadge } from './CallVerificationBadge';
import { TitleBar } from '../layout/TitleBar';
import { ScreenSharePickerModal } from './ScreenSharePickerModal';
import { liveKitService } from '../../services/livekitService';
import { gatewayManager } from '../../services/gatewayManager';
import { FONT_MAP, type FontFamily } from '../../store/useChatStore';

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
    token?: string;
    url?: string;
    verificationSecret?: string;
    verificationSalt?: string;
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
          myNickname: searchParams.get('myNickname') || (() => {
            try {
              const auth = localStorage.getItem('auth-storage');
              if (auth) return JSON.parse(auth)?.state?.nickname;
            } catch {}
            return null;
          })(),
        };
      }
      const saved = localStorage.getItem('orbita_active_call_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.callState && parsed.callState !== 'idle' && parsed.callState !== 'ended') {
          return parsed;
        }
      }
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

    const applyFont = (fontName: string) => {
      const fontVal = FONT_MAP[fontName as FontFamily] || FONT_MAP['system'];
      document.documentElement.style.setProperty('--main-font', fontVal);
      document.body.style.setProperty('--main-font', fontVal);
    };

    let initialFont = 'system';
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const fp = searchParams.get('font');
      if (fp) {
        initialFont = fp;
      } else {
        const chatStoreData = localStorage.getItem('chat-storage');
        if (chatStoreData) {
          const parsed = JSON.parse(chatStoreData);
          if (parsed?.state?.fontFamily) initialFont = parsed.state.fontFamily;
        }
      }
    } catch {}
    applyFont(initialFont);

    const bg = 'color-mix(in srgb, var(--accent-color, #7C3AED) 8%, var(--bg-primary, #14111d))';
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    const orbita = (window as any).orbita;

    if (orbita?.getCurrentFont) {
      orbita.getCurrentFont().then((font: string) => {
        if (font) applyFont(font);
      }).catch(() => {});
    }

    const unsubFontChanged = orbita?.onFontChanged?.((font: string) => {
      if (font) applyFont(font);
    });

    if (orbita?.getCurrentTheme) {
      orbita.getCurrentTheme().then((themeData: any) => {
        if (themeData?.themeVars) {
          applyVars(themeData.themeVars);
        }
      }).catch(() => {});
    }

    if (orbita?.getCallState) {
      orbita.getCallState().then((state: CallStatePayload | null) => {
        if (state) {
          setCallData(state);
        } else {
          setCallData(null);
          setIsLocalScreenShareActive(false);
          setIsRemoteScreenShareActive(false);
          setIsRemoteVideoActive(false);
          setIsLocalVideoActive(false);
          setIsExpanded(false);
          setIsScreenPickerOpen(false);
        }
      }).catch(() => {});
    }

    const unsubState = orbita?.onCallState?.((state: CallStatePayload | null) => {
      if (state) {
        setCallData(state);
      } else {
        setCallData(null);
        setIsLocalScreenShareActive(false);
        setIsRemoteScreenShareActive(false);
        setIsRemoteVideoActive(false);
        setIsLocalVideoActive(false);
        setIsExpanded(false);
        setIsScreenPickerOpen(false);
      }
    });

    let broadcastChannel: BroadcastChannel | null = null;
    try {
      broadcastChannel = new BroadcastChannel('orbita-call-channel');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'CALL_STATE_UPDATE') {
          if (event.data.payload) {
            setCallData(event.data.payload);
            if (event.data.payload.callState === 'idle' || event.data.payload.callState === 'ended') {
              setIsLocalScreenShareActive(false);
              setIsRemoteScreenShareActive(false);
              setIsRemoteVideoActive(false);
              setIsLocalVideoActive(false);
              setIsExpanded(false);
              setIsScreenPickerOpen(false);
            }
          } else {
            setCallData(null);
            setIsLocalScreenShareActive(false);
            setIsRemoteScreenShareActive(false);
            setIsRemoteVideoActive(false);
            setIsLocalVideoActive(false);
            setIsExpanded(false);
            setIsScreenPickerOpen(false);
          }
        }
      };
      broadcastChannel.postMessage({ type: 'REQUEST_CALL_STATE' });
    } catch {}

    const handleFocusSync = () => {
      if (orbita?.getCallState) {
        orbita.getCallState().then((state: CallStatePayload | null) => {
          if (state) {
            setCallData(state);
          }
        }).catch(() => {});
      }
    };
    window.addEventListener('focus', handleFocusSync);
    document.addEventListener('visibilitychange', handleFocusSync);

    const unsubThemeChanged = orbita?.onThemeChanged?.((data: any) => {
      if (data?.themeVars) {
        applyVars(data.themeVars);
      }
    });

    return () => {
      unsubFontChanged?.();
      unsubThemeChanged?.();
      unsubState?.();
      broadcastChannel?.close();
      window.removeEventListener('focus', handleFocusSync);
      document.removeEventListener('visibilitychange', handleFocusSync);
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

  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [isScreenPickerOpen, setIsScreenPickerOpen] = useState<boolean>(false);
  const [isRemoteVideoActive, setIsRemoteVideoActive] = useState<boolean>(false);
  const [isRemoteScreenShareActive, setIsRemoteScreenShareActive] = useState<boolean>(false);
  const [isLocalScreenShareActive, setIsLocalScreenShareActive] = useState<boolean>(false);
  const [isLocalVideoActive, setIsLocalVideoActive] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenShareRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenShareRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

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

  const activeCall = callData?.activeCall;
  const incomingCall = callData?.incomingCall;
  const callState = callData?.callState || 'idle';
  const isConnected = callState === 'connected';
  const isPreparing = callState === 'preparing';
  const isRinging = callState === 'ringing';
  const isConnecting = callState === 'connecting';
  const isEnded = callState === 'ended';

  const isMicEnabled = callData?.isMicEnabled ?? false;
  const isVideoEnabled = callData?.isVideoEnabled ?? (activeCall?.callType === 'video');
  const isScreenSharing = (isConnected || isConnecting) && (callData?.isScreenSharing ?? false);
  const hasLocalScreenShare = (isConnected || isConnecting) && (isLocalScreenShareActive || isScreenSharing);
  const duration = callData?.duration ?? 0;
  const statusMessage = callData?.statusMessage ?? '';

  const isIncoming = !!incomingCall || (activeCall?.direction === 'incoming' && callState === 'ringing');
  const otherName = activeCall?.otherName || incomingCall?.otherName || incomingCall?.from || activeCall?.chatId || '';
  const otherAvatar = activeCall?.otherAvatar || incomingCall?.otherAvatar || null;

  const currentRoomName = activeCall?.roomName;
  const prevRoomRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentRoomName !== prevRoomRef.current) {
      prevRoomRef.current = currentRoomName || null;
      setIsLocalScreenShareActive(false);
      setIsRemoteScreenShareActive(false);
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsExpanded(false);
      setIsScreenPickerOpen(false);
      setLocalDuration(0);
      try {
        void liveKitService.stopScreenShare();
      } catch {}
    }
  }, [currentRoomName]);

  useEffect(() => {
    if (!isConnected && !isConnecting) {
      setIsLocalScreenShareActive(false);
      setIsRemoteScreenShareActive(false);
      setIsRemoteVideoActive(false);
      setIsLocalVideoActive(false);
      setIsExpanded(false);
      setIsScreenPickerOpen(false);
      try {
        void liveKitService.stopScreenShare();
      } catch {}
    }
  }, [isConnected, isConnecting]);

  const handleHangupOrCancel = async (action: 'cancelCall' | 'endCall' | 'rejectCall') => {
    try {
      await liveKitService.stopScreenShare();
    } catch {}
    try {
      await liveKitService.disconnect();
    } catch {}
    setIsLocalScreenShareActive(false);
    setIsRemoteScreenShareActive(false);
    setIsRemoteVideoActive(false);
    setIsLocalVideoActive(false);
    setIsExpanded(false);
    setIsScreenPickerOpen(false);
    setLocalDuration(0);
    setCallData(null);
    sendAction(action);
    if (action === 'cancelCall' || action === 'rejectCall') {
      try { (window as any).orbita?.closeCallWindow?.(); } catch {}
    }
  };

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
    if (!activeCall) return;
    const isShouldConnect = callState === 'connected' || callState === 'connecting' || (callState === 'ringing' && activeCall.direction === 'outgoing');
    if (!isShouldConnect) return;
    if (liveKitService.isConnected) {
      if (liveKitService.remoteParticipants.length > 0) {
        sendAction('activateConnected');
      }
      return;
    }

    let cancelled = false;
    const doConnect = async () => {
      try {
        const roomName = activeCall.roomName;
        const myNick = callData?.myNickname || (() => {
          try {
            const auth = localStorage.getItem('auth-storage');
            if (auth) return JSON.parse(auth)?.state?.nickname;
          } catch {}
          return null;
        })() || 'User';
        const sessionKey = activeCall.verificationSecret
          ? (activeCall.verificationSalt ? `${activeCall.verificationSecret}:${activeCall.verificationSalt}` : activeCall.verificationSecret)
          : undefined;

        let token = activeCall.token;
        let url = activeCall.url;
        if (!token || !url) {
          const res = await gatewayManager.fetch('/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: roomName, identity: myNick, name: myNick }),
          });
          if (res.ok) {
            const data = await res.json();
            token = data.token;
            url = data.url;
          }
        }
        if (cancelled || !token || !url) return;
        await liveKitService.connect(roomName, token, url, sessionKey);
        await liveKitService.enableMicrophone();
        if (isVideoEnabled) {
          await liveKitService.enableCamera();
        }
        if (liveKitService.remoteParticipants.length > 0) {
          sendAction('activateConnected');
        }
      } catch {}
    };

    doConnect();

    return () => {
      cancelled = true;
    };
  }, [callState, activeCall?.roomName, activeCall?.token]);

  useEffect(() => {
    if (isRemoteScreenShareActive && remoteScreenShareRef.current) {
      const track = liveKitService.getRemoteScreenShareTrack();
      if (track) {
        track.attach(remoteScreenShareRef.current);
      }
    }
  }, [isRemoteScreenShareActive]);

  useEffect(() => {
    if (!bgVideoRef.current) return;
    if (isRemoteScreenShareActive) {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack) sTrack.attach(bgVideoRef.current);
    } else if (isRemoteVideoActive) {
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack) rTrack.attach(bgVideoRef.current);
    }
  }, [isRemoteScreenShareActive, isRemoteVideoActive]);

  useEffect(() => {
    if (!isConnected) {
      setIsRemoteVideoActive(false);
      setIsRemoteScreenShareActive(false);
      return;
    }
    const sTrack = liveKitService.getRemoteScreenShareTrack();
    if (sTrack && !sTrack.isMuted) {
      setIsRemoteScreenShareActive(true);
      if (remoteScreenShareRef.current) sTrack.attach(remoteScreenShareRef.current);
      if (bgVideoRef.current) sTrack.attach(bgVideoRef.current);
    }
    const rTrack = liveKitService.getRemoteVideoTrack();
    if (rTrack && !rTrack.isMuted) {
      setIsRemoteVideoActive(true);
      if (remoteVideoRef.current) rTrack.attach(remoteVideoRef.current);
      if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) rTrack.attach(bgVideoRef.current);
    }
  }, [isConnected]);

  useEffect(() => {
    const handleTrackSubscribed = (track: RemoteTrack) => {
      sendAction('activateConnected');
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          setIsRemoteScreenShareActive(true);
          if (remoteScreenShareRef.current) {
            track.attach(remoteScreenShareRef.current);
          }
          if (bgVideoRef.current) {
            track.attach(bgVideoRef.current);
          }
        } else {
          setIsRemoteVideoActive(true);
          if (remoteVideoRef.current) {
            track.attach(remoteVideoRef.current);
          }
          if (bgVideoRef.current && !liveKitService.getRemoteScreenShareTrack()) {
            track.attach(bgVideoRef.current);
          }
        }
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === 'video') {
        if (track.source === 'screen_share') {
          setIsRemoteScreenShareActive(false);
          if (remoteScreenShareRef.current) {
            track.detach(remoteScreenShareRef.current);
          }
          if (bgVideoRef.current) {
            track.detach(bgVideoRef.current);
            const rTrack = liveKitService.getRemoteVideoTrack();
            if (rTrack && !rTrack.isMuted) {
              rTrack.attach(bgVideoRef.current);
            }
          }
        } else {
          setIsRemoteVideoActive(false);
          if (remoteVideoRef.current) {
            track.detach(remoteVideoRef.current);
          }
          if (bgVideoRef.current && !liveKitService.getRemoteScreenShareTrack()) {
            track.detach(bgVideoRef.current);
          }
        }
      }
    };

    const handleCameraChanged = (enabled: boolean, track: any) => {
      setIsLocalVideoActive(enabled);
      if (enabled && track && localVideoRef.current) {
        track.attach(localVideoRef.current);
      }
    };

    const handleScreenShareChanged = (enabled: boolean, track: any) => {
      setIsLocalScreenShareActive(enabled);
      if (enabled && track && localScreenShareRef.current) {
        track.attach(localScreenShareRef.current);
      }
      sendAction('syncMediaState', { isScreenSharing: enabled });
    };

    const handleRemoteScreenShareChanged = (active: boolean, track: any) => {
      setIsRemoteScreenShareActive(active);
      if (active && track) {
        if (remoteScreenShareRef.current) track.attach(remoteScreenShareRef.current);
        if (bgVideoRef.current) track.attach(bgVideoRef.current);
      } else if (!active && bgVideoRef.current) {
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) rTrack.attach(bgVideoRef.current);
      }
    };

    const handleConnected = () => {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && !sTrack.isMuted) {
        setIsRemoteScreenShareActive(true);
        if (remoteScreenShareRef.current) sTrack.attach(remoteScreenShareRef.current);
        if (bgVideoRef.current) sTrack.attach(bgVideoRef.current);
      }
      const rTrack = liveKitService.getRemoteVideoTrack();
      if (rTrack && !rTrack.isMuted) {
        setIsRemoteVideoActive(true);
        if (remoteVideoRef.current) rTrack.attach(remoteVideoRef.current);
        if (bgVideoRef.current && (!sTrack || sTrack.isMuted)) rTrack.attach(bgVideoRef.current);
      }
      if (liveKitService.remoteParticipants.length > 0) {
        sendAction('activateConnected');
      }
    };

    const handleParticipantJoined = () => {
      sendAction('activateConnected');
    };

    liveKitService.on('trackSubscribed', handleTrackSubscribed);
    liveKitService.on('trackUnsubscribed', handleTrackUnsubscribed);
    liveKitService.on('cameraChanged', handleCameraChanged);
    liveKitService.on('screenShareChanged', handleScreenShareChanged);
    liveKitService.on('remoteScreenShareChanged', handleRemoteScreenShareChanged);
    liveKitService.on('connected', handleConnected);
    liveKitService.on('participantJoined', handleParticipantJoined);

    if (liveKitService.isConnected) {
      handleConnected();
    }

    return () => {
      liveKitService.off('trackSubscribed', handleTrackSubscribed);
      liveKitService.off('trackUnsubscribed', handleTrackUnsubscribed);
      liveKitService.off('cameraChanged', handleCameraChanged);
      liveKitService.off('screenShareChanged', handleScreenShareChanged);
      liveKitService.off('remoteScreenShareChanged', handleRemoteScreenShareChanged);
      liveKitService.off('connected', handleConnected);
      liveKitService.off('participantJoined', handleParticipantJoined);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (remoteVideoRef.current) {
        try { liveKitService.getRemoteVideoTrack()?.detach(remoteVideoRef.current); } catch {}
      }
      if (remoteScreenShareRef.current) {
        try { liveKitService.getRemoteScreenShareTrack()?.detach(remoteScreenShareRef.current); } catch {}
      }
      if (localVideoRef.current) {
        try { liveKitService.getLocalVideoTrack()?.detach(localVideoRef.current); } catch {}
      }
      if (localScreenShareRef.current) {
        try { liveKitService.getScreenShareTrack()?.detach(localScreenShareRef.current); } catch {}
      }
      liveKitService.disconnect().catch(() => {});
    };
  }, []);

  const handleToggleMic = async () => {
    const next = !isMicEnabled;
    setCallData((prev) => (prev ? { ...prev, isMicEnabled: next } : prev));
    if (next) {
      await liveKitService.enableMicrophone();
    } else {
      await liveKitService.disableMicrophone();
    }
    sendAction('toggleMic', next);
  };

  const handleToggleVideo = async () => {
    const next = !isVideoEnabled;
    setCallData((prev) => (prev ? { ...prev, isVideoEnabled: next } : prev));
    if (next) {
      await liveKitService.enableCamera();
    } else {
      await liveKitService.disableCamera();
    }
    sendAction('toggleVideo', next);
  };

  const handleToggleScreenShare = async () => {
    if (hasLocalScreenShare) {
      await liveKitService.stopScreenShare();
      setIsLocalScreenShareActive(false);
      setCallData((prev) => (prev ? { ...prev, isScreenSharing: false } : prev));
      sendAction('stopScreenShare');
      sendAction('syncMediaState', { isScreenSharing: false });
    } else {
      setIsScreenPickerOpen(true);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const hasRemoteStream = isRemoteScreenShareActive || isRemoteVideoActive;

  useEffect(() => {
    if (hasRemoteStream && bgVideoRef.current) {
      const sTrack = liveKitService.getRemoteScreenShareTrack();
      if (sTrack && !sTrack.isMuted) {
        sTrack.attach(bgVideoRef.current);
      } else {
        const rTrack = liveKitService.getRemoteVideoTrack();
        if (rTrack && !rTrack.isMuted) {
          rTrack.attach(bgVideoRef.current);
        }
      }
    }
  }, [hasRemoteStream]);

  return (
    <div
      className="w-full h-full min-h-screen flex flex-col justify-between overflow-hidden select-none relative"
      style={{
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-main, #ffffff)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ['--title-bar-bg' as any]: 'transparent',
      }}
    >
      {hasRemoteStream && (
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
          style={{ contain: 'strict' }}
        >
          <video
            ref={bgVideoRef}
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

      <div className="relative z-50">
        <TitleBar />
      </div>

      <div className="h-9 flex items-center justify-center flex-shrink-0 relative z-30">
        {isConnected && activeCall?.verificationEmojis && activeCall.verificationEmojis.length === 4 && (
          <CallVerificationBadge emojis={activeCall.verificationEmojis} />
        )}
      </div>

      {isLocalVideoActive && (
        <div className="absolute top-12 right-5 z-40 w-32 h-44 sm:w-36 sm:h-48 rounded-2xl overflow-hidden shadow-2xl bg-black/70 border-0 select-none">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100"
          />
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-semibold text-white/90">
            {t('call.you')}
          </div>
        </div>
      )}

      {isVideoEnabled && !hasCamera && (
        <div className="absolute top-12 right-5 z-40 w-44 h-32 rounded-2xl shadow-2xl bg-black/80 backdrop-blur-md p-3 flex flex-col items-center justify-center text-center border-0 select-none">
          <VideoOff size={24} className="text-amber-400 mb-1.5" />
          <span className="text-[12px] font-medium text-white/90 leading-snug">
            {t('call.no_camera_available')}
          </span>
        </div>
      )}

      <div className="flex flex-col items-center justify-center flex-1 py-2 z-10 w-full relative">

        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`relative z-20 cursor-pointer overflow-hidden transition-all duration-300 shadow-2xl flex items-center justify-center bg-[#09080e] ${
            isExpanded
              ? 'fixed inset-0 z-40 rounded-none w-full h-full max-w-none max-h-none'
              : 'w-[86%] max-w-[760px] aspect-video rounded-3xl max-h-[55vh]'
          }`}
          style={{
            display: hasRemoteStream ? 'flex' : 'none',
            borderRadius: isExpanded ? 0 : '24px',
          }}
        >
          <video
            ref={remoteScreenShareRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
            style={{ display: isRemoteScreenShareActive ? 'block' : 'none' }}
          />
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ display: !isRemoteScreenShareActive && isRemoteVideoActive ? 'block' : 'none' }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            aria-label={isExpanded ? t('call.exit_fullscreen') : t('call.fullscreen')}
            className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white/90 transition-all border-0 cursor-pointer"
          >
            {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {hasRemoteStream && !isExpanded && (
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

        {!hasRemoteStream && (
          <>
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
                {formatDuration(localDuration > 0 ? localDuration : duration)}
              </p>
            ) : statusMessage ? (
              <p className="mt-1 text-sm font-medium text-center" style={{ color: 'var(--text-dim, #8a96a3)' }}>
                {statusMessage}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className={`${isExpanded ? 'fixed bottom-0 inset-x-0 z-50 pb-6 pt-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent' : 'pb-5 pt-1 relative z-20'} flex flex-col items-center gap-3`}>
        {hasLocalScreenShare && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md shadow-lg select-none border-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[12px] font-medium text-white/90">
              {t('call.sharing_your_screen', 'Вы транслируете свой экран')}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-5">
        {isIncoming ? (
          <>
            <button
              type="button"
              onClick={() => handleHangupOrCancel('rejectCall')}
              aria-label={t('call.reject')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.reject') || 'Отклонить'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('answerCall')}
              aria-label={t('call.answer')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={accentButtonStyle}>
                <Phone size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
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
              className="w-16 flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all flex-shrink-0"
                style={isVideoEnabled ? accentButtonStyle : neutralButtonStyle(false)}
              >
                {isVideoEnabled ? <Video size={20} color="#ffffff" /> : <VideoOff size={20} color="#ffffff" />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleHangupOrCancel('cancelCall')}
              aria-label={t('call.cancel')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.cancel')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => sendAction('initiateCall')}
              aria-label={t('call.call')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={accentButtonStyle}>
                <Phone size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
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
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0" style={neutralButtonStyle(isMicEnabled)}>
                {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isMicEnabled ? t('call.mic') : t('call.mic_off')}
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleVideo}
              aria-label={isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent outline-none cursor-pointer select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-all flex-shrink-0" style={neutralButtonStyle(isVideoEnabled)}>
                {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {isVideoEnabled ? t('call.camera_off') : t('call.camera_on')}
              </span>
            </button>

            {(isConnected || isRinging || isConnecting) && (
              <button
                type="button"
                onClick={handleToggleScreenShare}
                aria-label={t('call.screen_share')}
                className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-md flex-shrink-0"
                  style={neutralButtonStyle(hasLocalScreenShare)}
                >
                  {hasLocalScreenShare ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}
                </div>
                <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                  {t('call.screen_share')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleHangupOrCancel('endCall')}
              aria-label={t('call.hang_up')}
              className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
                <X size={20} color="#ffffff" />
              </div>
              <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
                {t('call.hang_up')}
              </span>
            </button>
          </>
        ) : isEnded ? (
          <button
            type="button"
            onClick={() => handleHangupOrCancel('cancelCall')}
            aria-label={t('call.close')}
            className="w-16 flex flex-col items-center gap-2 border-0 bg-transparent cursor-pointer outline-none select-none p-0"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-md transition-colors flex-shrink-0" style={rejectButtonStyle}>
              <X size={20} color="#ffffff" />
            </div>
            <span className="text-center truncate w-full" style={{ color: 'var(--text-dim, #8a96a3)', fontSize: '11px', fontWeight: 500 }}>
              {t('call.close')}
            </span>
          </button>
        ) : null}
        </div>
      </div>

      <ScreenSharePickerModal
        isOpen={isScreenPickerOpen}
        onClose={() => setIsScreenPickerOpen(false)}
        onStart={async (options) => {
          setIsScreenPickerOpen(false);
          const success = await liveKitService.startScreenShare(options);
          if (success) {
            setIsLocalScreenShareActive(true);
            setCallData((prev) => (prev ? { ...prev, isScreenSharing: true } : prev));
            sendAction('syncMediaState', { isScreenSharing: true });
          }
        }}
      />
    </div>
  );
};
