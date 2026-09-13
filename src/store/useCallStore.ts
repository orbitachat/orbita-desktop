import { create } from 'zustand';
import { liveKitService, ParticipantInfo } from '../services/livekitService';
import { getPusher } from '../utils/pusher';
import { useChatStore } from './useChatStore';
import { useAuthStore } from './useAuthStore';
import { callSoundService } from '../services/callSoundService';
import { generateCallVerificationEmojis } from '../lib/call-verification';
import { useAudioStore } from './useAudioStore';
import { gatewayManager } from '../services/gatewayManager';
import { ablyService } from '../services/ablyService';
import i18n from '../i18n';

export type CallType = 'audio' | 'video';
export type CallDirection = 'incoming' | 'outgoing';
export type CallState = 'idle' | 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallEndedStatus = 'missed' | 'rejected' | 'busy' | 'failed' | 'completed' | 'encryption_failed' | null;

export interface IncomingCall {
  from: string;
  chatId: string;
  callType: CallType;
  roomName: string;
  timestamp: number;
  verificationSalt?: string;
}

export interface ActiveCall {
  chatId: string;
  roomName: string;
  direction: CallDirection;
  callType: CallType;
  startTime: number;
  participants: ParticipantInfo[];
  isMuted: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  endedStatus: CallEndedStatus;
  verificationSecret?: string;
  verificationSalt?: string;
  verificationEmojis?: string[];
}

interface CallStore {
  activeCall: ActiveCall | null;
  incomingCall: IncomingCall | null;
  callState: CallState;
  isMicEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  isScreenPickerOpen: boolean;
  remoteScreenShareTrack: any | null;
  remoteScreenShareIdentity: string | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  duration: number;
  myNickname: string | null;
  statusMessage: string;
  isEnding: boolean;
  isMinimized: boolean;
  processedRoomNames: string[];
  setIncomingCall: (call: IncomingCall | null) => void;
  addProcessedRoomName: (roomName: string) => void;
  setMinimized: (minimized: boolean) => void;
  startCall: (chatId: string, callType: CallType, myNickname: string) => Promise<void>;
  initiateCall: () => Promise<void>;
  answerCall: (myNickname: string) => Promise<void>;
  rejectCall: (silent?: boolean) => void;
  endCall: (forceClose?: boolean) => void;
  handleBusy: () => void;
  handleReject: () => void;
  handleAccept: () => void;
  handleConnected: (connectedAt?: number) => void;
  handleCancel: () => void;
  handleHangup: () => void;
  toggleMic: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  openScreenPicker: () => void;
  closeScreenPicker: () => void;
  startScreenShareWithOptions: (options: { sourceId?: string; quality: '240p' | '360p' | '720p' | '1080p'; fps: 15 | 30 | 45 | 60; audio: boolean }) => Promise<void>;
  stopScreenShare: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  updateParticipants: (participants: ParticipantInfo[]) => void;
  updateConnectionQuality: (quality: 'excellent' | 'good' | 'poor' | 'unknown') => void;
  peerVolume: number;
  micVolume: number;
  setPeerVolume: (volume: number) => void;
  setMicVolume: (volume: number) => void;
  isBusy: () => boolean;
  reset: () => void;
}

const LOG_PREFIX = '[CallStore]';
const NO_ANSWER_TIMEOUT_MS = 30000;
const INCOMING_AUTO_REJECT_MS = 30000;
const CONNECTING_TIMEOUT_MS = 25000;
const SIGNAL_RETRY_TIMES = 3;
const SIGNAL_RETRY_DELAY_MS = 1500;

let durationTimer: ReturnType<typeof setInterval> | null = null;
let noAnswerTimer: ReturnType<typeof setTimeout> | null = null;
let incomingAutoRejectTimer: ReturnType<typeof setTimeout> | null = null;
let connectingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;
let activationInProgress = false;

let prefetchedToken: { roomName: string; token: string; url: string; identity: string; fetchedAt: number } | null = null;
let lastSeenOfferRoom: string | null = null;

async function fetchLivekitToken(room: string, identity: string): Promise<{ token: string; url: string }> {
  const res = await gatewayManager.fetch('/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room, identity, name: identity }),
  });
  if (!res.ok) {
    let errorText = '';
    try { errorText = await res.text(); } catch { errorText = `HTTP ${res.status}`; }
    throw new Error(`Token request failed: ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  if (typeof data.token !== 'string' || typeof data.url !== 'string') {
    throw new Error(`Invalid token response: expected { token, url }, got ${JSON.stringify(data)}`);
  }
  return data as { token: string; url: string };
}

const savedPeerVolume = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('orbita_call_peer_volume') || '100') : 100;
const savedMicVolume = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('orbita_call_mic_volume') || '100') : 100;

try {
  liveKitService.setPeerVolume((isNaN(savedPeerVolume) ? 100 : savedPeerVolume) / 100);
  liveKitService.setMicVolume((isNaN(savedMicVolume) ? 100 : savedMicVolume) / 100);
} catch {}

function sendCallSignal(chatId: string, payload: Record<string, unknown>) {
  try {
    const pusher = getPusher();
    const channel = pusher.subscribe(`private-chat-${chatId}`);
    const send = () => {
      try {
        channel.trigger('client-message', payload);
        console.log(`${LOG_PREFIX} Signal sent:`, payload.type, 'chatId:', chatId);
      } catch (err) {
        console.error(`${LOG_PREFIX} Failed to trigger signal:`, err);
      }
    };
    if (channel.subscribed) send();
    else channel.bind('pusher:subscription_succeeded', send);
  } catch (err) {
    console.error(`${LOG_PREFIX} sendCallSignal error:`, err);
  }

  try {
    ablyService.sendMessage(chatId, payload);
  } catch (err) {
    console.error(`${LOG_PREFIX} ably sendCallSignal error:`, err);
  }
}

let activeSignalRetryTimers: ReturnType<typeof setTimeout>[] = [];

function clearSignalRetryTimers() {
  activeSignalRetryTimers.forEach((timer) => clearTimeout(timer));
  activeSignalRetryTimers = [];
}

function sendCallSignalReliable(chatId: string, payload: Record<string, unknown>, times = SIGNAL_RETRY_TIMES) {
  let sent = 0;
  const fire = () => {
    sendCallSignal(chatId, payload);
    sent++;
    if (sent < times) {
      const timer = setTimeout(() => {
        const idx = activeSignalRetryTimers.indexOf(timer);
        if (idx !== -1) activeSignalRetryTimers.splice(idx, 1);
        fire();
      }, SIGNAL_RETRY_DELAY_MS);
      activeSignalRetryTimers.push(timer);
    }
  };
  fire();
}

function clearAllTimers() {
  clearSignalRetryTimers();
  if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
  if (noAnswerTimer) { clearTimeout(noAnswerTimer); noAnswerTimer = null; }
  if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
  if (connectingTimeoutTimer) { clearTimeout(connectingTimeoutTimer); connectingTimeoutTimer = null; }
  prefetchedToken = null;
}

async function createCallMessage(chatId: string, direction: CallDirection, duration: number, endedStatus: CallEndedStatus) {
  try {
    const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
    if (!chat) return;
    const myNickname = useAuthStore.getState().nickname || 'YOU';
    const sender = direction === 'outgoing' ? myNickname : chat.name;
    const directionText = direction === 'outgoing' ? 'Исходящий' : 'Входящий';
    let messageText = `[Call] ${directionText}`;
    if (endedStatus === 'completed') {
      const safeDuration = Math.max(0, Math.floor(duration) || 0);
      const mins = Math.floor(safeDuration / 60);
      const secs = safeDuration % 60;
      messageText += `, ${mins}:${secs.toString().padStart(2, '0')}`;
    }
    const myCode = useChatStore.getState().myCode;
    const isOutgoing = direction === 'outgoing';
    const senderId = isOutgoing ? myCode : (chat.peerCode || chat.name);
    const isCompleted = endedStatus === 'completed';
    const initialStatus = isOutgoing
      ? (isCompleted ? 'read' : 'delivered')
      : undefined;
    const isRead = isOutgoing ? true : isCompleted;

    useChatStore.getState().addMessage(chatId, {
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      senderId,
      sender,
      isOutgoing,
      text: messageText,
      time: Date.now(),
      read: isRead,
      status: initialStatus,
      mediaType: 'call',
      mediaUrl: '',
      mediaName: endedStatus || 'completed',
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to create call message:`, err);
  }
}


export const useCallStore = create<CallStore>((set, get) => {
  const startDurationTimer = () => {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    durationTimer = setInterval(() => {
      const s = get();
      if (s.activeCall && s.activeCall.startTime > 0 && s.callState === 'connected' && !s.statusMessage) {
        set({ duration: Math.max(0, Math.floor((Date.now() - s.activeCall.startTime) / 1000)) });
      }
    }, 1000);
  };

  const activateConnected = async (syncedConnectedAt?: number) => {
    const s = get();
    if (!s.activeCall) return;

    if (s.callState === 'connected') {
      if (syncedConnectedAt && s.activeCall.startTime === 0) {
        set((st) => {
          if (!st.activeCall) return st;
          return {
            activeCall: {
              ...st.activeCall,
              startTime: syncedConnectedAt,
            },
            duration: Math.max(0, Math.floor((Date.now() - syncedConnectedAt) / 1000)),
          };
        });
      }
      return;
    }

    if (activationInProgress) return;
    activationInProgress = true;
    try {
      set({ statusMessage: i18n.t('call.exchanging_keys') });

      const sessionKey = s.activeCall.verificationSecret
        ? (s.activeCall.verificationSalt ? `${s.activeCall.verificationSecret}:${s.activeCall.verificationSalt}` : s.activeCall.verificationSecret)
        : undefined;
      if (sessionKey) {
        try {
          await liveKitService.setE2EEKey(sessionKey);
        } catch (err) {
          console.warn(`${LOG_PREFIX} E2EE key error:`, err);
        }
      }

      set({ statusMessage: i18n.t('call.connected') });

      let emojis = s.activeCall.verificationEmojis;
      if (!emojis && s.activeCall.verificationSecret && s.activeCall.verificationSalt) {
        try {
          emojis = await generateCallVerificationEmojis(s.activeCall.verificationSecret + s.activeCall.verificationSalt);
        } catch (err) { console.error(`${LOG_PREFIX} Emoji gen error:`, err); }
      }

      const stateAfterCrypto = get();
      if (!stateAfterCrypto.activeCall) return;

      if (noAnswerTimer) { clearTimeout(noAnswerTimer); noAnswerTimer = null; }
      if (connectingTimeoutTimer) { clearTimeout(connectingTimeoutTimer); connectingTimeoutTimer = null; }
      callSoundService.stop();
      liveKitService.enableMicrophone().catch(() => {});
      if (stateAfterCrypto.isVideoEnabled || stateAfterCrypto.activeCall.callType === 'video') {
        liveKitService.enableCamera().catch(() => {});
      }

      const connectedAt = syncedConnectedAt
        || (stateAfterCrypto.activeCall.startTime > 0 ? stateAfterCrypto.activeCall.startTime : Date.now());

      if (stateAfterCrypto.activeCall.direction === 'outgoing' && !syncedConnectedAt) {
        sendCallSignalReliable(stateAfterCrypto.activeCall.chatId, {
          type: 'call-connected',
          connectedAt,
          sender: stateAfterCrypto.myNickname || undefined,
          text: '',
          roomName: stateAfterCrypto.activeCall.roomName,
        });
      }

      set((st) => {
        if (!st.activeCall) return st;
        return {
          callState: 'connected',
          statusMessage: '',
          duration: Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)),
          activeCall: { ...st.activeCall, startTime: connectedAt, verificationEmojis: emojis || st.activeCall.verificationEmojis },
        };
      });

      startDurationTimer();
    } finally {
      activationInProgress = false;
    }
  };

  const ensureListeners = () => {
    if (listenersAttached) return;
    listenersAttached = true;

    liveKitService.on('disconnected', () => {
      console.log(`${LOG_PREFIX} LiveKit disconnected event`);
      const state = get();
      if (state.isEnding) return;
      if (state.activeCall && state.callState === 'connected') {
        get().endCall();
      }
    });

    liveKitService.on('reconnectFailed', () => {
      console.error(`${LOG_PREFIX} LiveKit reconnect failed`);
      const state = get();
      if (state.activeCall) {
        set({ activeCall: { ...state.activeCall, endedStatus: 'failed' }, callState: 'ended', statusMessage: '' });
        get().endCall();
      }
    });

    liveKitService.on('participantJoined', (participant: ParticipantInfo) => {
      console.log(`${LOG_PREFIX} participantJoined:`, participant.identity);
      const act = get().activeCall;
      if (!act) return;
      if (act.participants.some((p) => p.identity === participant.identity)) return;
      set({ activeCall: { ...act, participants: [...act.participants, participant] } });
      const current = get();
      if (current.callState === 'connecting' || current.callState === 'ringing') activateConnected();
    });

    liveKitService.on('participantLeft', (identity: string) => {
      console.log(`${LOG_PREFIX} participantLeft:`, identity);
      const act = get().activeCall;
      if (!act) return;
      set({ activeCall: { ...act, participants: act.participants.filter((p) => p.identity !== identity) } });
    });

    liveKitService.on('connectionQuality', (quality: string) => {
      const map: Record<string, 'excellent' | 'good' | 'poor' | 'unknown'> = { excellent: 'excellent', good: 'good', poor: 'poor', unknown: 'unknown' };
      get().updateConnectionQuality(map[quality] || 'unknown');
    });

    liveKitService.on('micChanged', (enabled: boolean) => { set({ isMicEnabled: enabled }); });
    liveKitService.on('cameraChanged', (enabled: boolean) => {
      set({ isVideoEnabled: enabled });
      const act = get().activeCall;
      if (act) set({ activeCall: { ...act, isVideoEnabled: enabled } });
    });
    liveKitService.on('screenShareChanged', (enabled: boolean) => {
      set({ isScreenSharing: enabled });
      const act = get().activeCall;
      if (act) set({ activeCall: { ...act, isScreenSharing: enabled } });
    });
    liveKitService.on('remoteScreenShareChanged', (active: boolean, track: any, identity?: string) => {
      set({
        remoteScreenShareTrack: active ? track : null,
        remoteScreenShareIdentity: active ? (identity || null) : null,
      });
    });
    liveKitService.on('trackMuted', () => {
      get().updateParticipants(liveKitService.allParticipants);
    });
    liveKitService.on('trackUnmuted', () => {
      get().updateParticipants(liveKitService.allParticipants);
    });

    liveKitService.on('connectAttempt', (attempt: number, total: number) => {
      const state = get();
      if (!state.activeCall) return;
      if (state.callState === 'ringing' || state.callState === 'preparing') {
        set({ statusMessage: i18n.t('call.requesting_n_of_total', { current: attempt, total }) });
      }
    });

    liveKitService.on('connectSuccess', (attempt: number) => {
      const state = get();
      if (!state.activeCall) return;
      if (attempt > 1) {
        console.log(`${LOG_PREFIX} Connected on attempt ${attempt}`);
      }
      if (state.callState === 'ringing') {
        set({ statusMessage: i18n.t('call.calling') });
      } else if (state.callState === 'connecting') {
        set({ statusMessage: i18n.t('call.connecting') });
      }
    });
  };

  ensureListeners();

  return {
    activeCall: null,
    incomingCall: null,
    callState: 'idle',
    isMicEnabled: false,
    isVideoEnabled: false,
    isScreenSharing: false,
    isScreenPickerOpen: false,
    remoteScreenShareTrack: null,
    remoteScreenShareIdentity: null,
    connectionQuality: 'unknown',
    duration: 0,
    myNickname: null,
    statusMessage: '',
    isEnding: false,
    isMinimized: false,
    processedRoomNames: [],
    peerVolume: isNaN(savedPeerVolume) ? 100 : savedPeerVolume,
    micVolume: isNaN(savedMicVolume) ? 100 : savedMicVolume,

    setPeerVolume: (volume: number) => {
      const clamped = Math.max(0, Math.min(200, Math.round(volume)));
      set({ peerVolume: clamped });
      try { localStorage.setItem('orbita_call_peer_volume', String(clamped)); } catch {}
      liveKitService.setPeerVolume(clamped / 100);
    },

    setMicVolume: (volume: number) => {
      const clamped = Math.max(0, Math.min(200, Math.round(volume)));
      set({ micVolume: clamped });
      try { localStorage.setItem('orbita_call_mic_volume', String(clamped)); } catch {}
      liveKitService.setMicVolume(clamped / 100);
    },

    addProcessedRoomName: (roomName) => {
      set((state) => {
        const list = [...state.processedRoomNames, roomName];
        if (list.length > 20) list.shift();
        return { processedRoomNames: list };
      });
    },

    setMinimized: (isMinimized) => set({ isMinimized }),

    isBusy: () => { const s = get(); return !!s.activeCall || !!s.incomingCall; },

    setIncomingCall: (call) => {
      if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
      if (!call) {
        callSoundService.stop();
        lastSeenOfferRoom = null;
        set({ incomingCall: null, callState: 'idle', isMinimized: false });
        return;
      }
      if (get().processedRoomNames.includes(call.roomName)) {
        callSoundService.stop();
        return;
      }
      if (lastSeenOfferRoom === call.roomName && (get().incomingCall || get().activeCall)) {
        return;
      }
      lastSeenOfferRoom = call.roomName;
      set({ incomingCall: call, callState: 'ringing', isMinimized: false });
      try { useAudioStore.getState().pause(); } catch {}
      callSoundService.play('incoming');
        const myNick = get().myNickname || useAuthStore.getState().nickname;
        if (myNick) {
          fetchLivekitToken(call.roomName, myNick)
            .then((res) => {
              prefetchedToken = {
                roomName: call.roomName,
                token: res.token,
                url: res.url,
                identity: myNick,
                fetchedAt: Date.now(),
              };
            })
            .catch(() => {});
        }
        incomingAutoRejectTimer = setTimeout(() => {
          const s = get();
          if (s.incomingCall && s.incomingCall.roomName === call.roomName) get().rejectCall(true);
        }, INCOMING_AUTO_REJECT_MS);
    },

    startCall: async (chatId, callType, myNickname) => {
      const state = get();
      if (state.isBusy()) return;
      if (!useChatStore.getState().voiceCallsEnabled) return;
      try { useAudioStore.getState().pause(); } catch {}
      const roomName = `call-${chatId}-${Date.now()}`;
      const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
      const verificationSecret = chat?.type === 'private' ? chat.sharedSecret : undefined;
      const verificationSalt = crypto.randomUUID().replace(/-/g, '');
      const isVideo = callType === 'video';
      set({
        myNickname,
        activeCall: { chatId, roomName, direction: 'outgoing', callType, startTime: 0, participants: [], isMuted: false, isVideoEnabled: isVideo, isScreenSharing: false, connectionQuality: 'unknown', endedStatus: null, verificationSecret, verificationSalt, verificationEmojis: undefined },
        callState: 'preparing', isMicEnabled: true, isVideoEnabled: isVideo, isScreenSharing: false, connectionQuality: 'unknown', duration: 0, statusMessage: '', isEnding: false,
      });
    },

    initiateCall: async () => {
      const state = get();
      if (!state.activeCall || state.callState !== 'preparing') return;
      const { chatId, roomName, verificationSalt, verificationSecret, callType } = state.activeCall;
      const myNickname = state.myNickname;
      if (!myNickname) return;
      try { useAudioStore.getState().pause(); } catch {}
      set({ callState: 'ringing', statusMessage: i18n.t('call.calling') });
      callSoundService.play('outgoing');
      sendCallSignalReliable(chatId, { type: 'call-offer', sender: myNickname, callType: callType || 'audio', roomName, verificationSalt, text: '' });
      noAnswerTimer = setTimeout(() => {
        if (get().callState === 'ringing') {
          const act = get().activeCall;
          if (act) set({ activeCall: { ...act, endedStatus: 'missed' }, callState: 'ended' });
          callSoundService.stop();
          callSoundService.play('end');
          sendCallSignalReliable(chatId, { type: 'call-cancel', sender: myNickname, text: '', roomName });
          get().endCall();
        }
      }, NO_ANSWER_TIMEOUT_MS);
      try {
        const sessionKey = verificationSecret ? (verificationSalt ? `${verificationSecret}:${verificationSalt}` : verificationSecret) : undefined;
        const { token, url } = await fetchLivekitToken(roomName, myNickname);
        console.log(`${LOG_PREFIX} Connecting to LiveKit (outgoing):`, url);
        await liveKitService.connect(roomName, token, url, sessionKey);
        console.log(`${LOG_PREFIX} LiveKit connected (outgoing)`);
        const cs = get().callState;
        if (cs !== 'ringing' && cs !== 'connecting') return;
        if (liveKitService.remoteParticipants.length > 0) activateConnected();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Initial LiveKit connect warning (outgoing):`, err);
      }
    },

    answerCall: async (myNickname) => {
      const state = get();
      if (!state.incomingCall) return;
      if (state.activeCall) return;
      try { useAudioStore.getState().pause(); } catch {}
      const { chatId, roomName, verificationSalt, callType } = state.incomingCall;
      if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
      const chat = useChatStore.getState().chats.find((c) => c.id === chatId);
      const verificationSecret = chat?.type === 'private' ? chat.sharedSecret : undefined;
      const isVideo = callType === 'video';
      set({
        myNickname, incomingCall: null, callState: 'connecting', statusMessage: i18n.t('call.connecting'),
        activeCall: { chatId, roomName, direction: 'incoming', callType: callType || 'audio', startTime: 0, participants: [], isMuted: false, isVideoEnabled: isVideo, isScreenSharing: false, connectionQuality: 'unknown', endedStatus: null, verificationSecret, verificationSalt, verificationEmojis: undefined },
        isMicEnabled: true, isVideoEnabled: isVideo, duration: 0, isEnding: false,
      });
      callSoundService.play('connect');

      sendCallSignalReliable(chatId, { type: 'call-accept', sender: myNickname, text: '', roomName });

      if (connectingTimeoutTimer) clearTimeout(connectingTimeoutTimer);
      connectingTimeoutTimer = setTimeout(() => {
        if (get().callState === 'connecting') {
          console.warn(`${LOG_PREFIX} Connecting timeout reached, ending call`);
          const act = get().activeCall;
          if (act) set({ activeCall: { ...act, endedStatus: 'failed' }, callState: 'ended' });
          get().endCall();
        }
      }, CONNECTING_TIMEOUT_MS);

      try {
        const sessionKey = verificationSecret ? (verificationSalt ? `${verificationSecret}:${verificationSalt}` : verificationSecret) : undefined;
        let token: string;
        let url: string;
        if (
          prefetchedToken &&
          prefetchedToken.roomName === roomName &&
          prefetchedToken.identity === myNickname &&
          Date.now() - prefetchedToken.fetchedAt < 45000
        ) {
          token = prefetchedToken.token;
          url = prefetchedToken.url;
          prefetchedToken = null;
        } else {
          const res = await fetchLivekitToken(roomName, myNickname);
          token = res.token;
          url = res.url;
        }
        console.log(`${LOG_PREFIX} Answering, connecting to LiveKit:`, url);
        await liveKitService.connect(roomName, token, url, sessionKey);
        console.log(`${LOG_PREFIX} LiveKit connected (incoming)`);
        if (get().callState !== 'connecting') return;
        set({ callState: 'connecting', statusMessage: 'Соединение...' });
        if (liveKitService.remoteParticipants.length > 0) activateConnected();
      } catch (err) {
        console.error(`${LOG_PREFIX} LiveKit connect error (incoming):`, err);
        if (connectingTimeoutTimer) { clearTimeout(connectingTimeoutTimer); connectingTimeoutTimer = null; }
        const act = get().activeCall;
        if (act) { sendCallSignal(chatId, { type: 'call-hangup', sender: myNickname, text: '', roomName }); set({ activeCall: { ...act, endedStatus: 'failed' }, callState: 'ended' }); }
        callSoundService.stop(); callSoundService.play('end');
        get().endCall();
      }
    },

    rejectCall: (silent = false) => {
      const state = get();
      if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
      clearSignalRetryTimers();
      callSoundService.stop();
      if (!state.incomingCall) return;
      const { chatId, roomName } = state.incomingCall;
      if (roomName) get().addProcessedRoomName(roomName);
      sendCallSignalReliable(chatId, { type: 'call-reject', sender: state.myNickname || useAuthStore.getState().nickname || undefined, text: '', roomName });
      console.log(`${LOG_PREFIX} Incoming call rejected${silent ? ' (auto)' : ''}`);
      set({ incomingCall: null, activeCall: null, callState: 'idle', duration: 0, statusMessage: '', isEnding: false });
      try { (window as any).orbita?.closeCallWindow?.(); } catch {}
    },

    endCall: (_forceClose = false) => {
      const state = get();
      clearSignalRetryTimers();
      callSoundService.stop();
      if (!state.activeCall && !state.incomingCall) return;
      if (state.incomingCall && !state.activeCall) {
        get().rejectCall();
        return;
      }
      if (state.isEnding || !state.activeCall) return;
      set({ isEnding: true });
      const activeCall = state.activeCall;
      const { chatId, direction, startTime, roomName } = activeCall;
      if (roomName) get().addProcessedRoomName(roomName);
      const duration = startTime > 0 ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : 0;
      let endedStatus: CallEndedStatus = activeCall.endedStatus;
      let signalType: string | null = null;
      if (state.callState !== 'ended') {
        switch (state.callState) {
          case 'preparing':
          case 'ringing': endedStatus = endedStatus || 'missed'; signalType = 'call-cancel'; break;
          case 'connecting': endedStatus = endedStatus || 'failed'; signalType = 'call-hangup'; break;
          case 'connected': endedStatus = 'completed'; signalType = 'call-hangup'; break;
          default: endedStatus = endedStatus || null; signalType = null;
        }
      }
      if (signalType) sendCallSignalReliable(chatId, { type: signalType, sender: state.myNickname || undefined, text: '', roomName });
      liveKitService.disconnect().catch((err) => console.error(`${LOG_PREFIX} disconnect error:`, err));
      clearAllTimers();
      activationInProgress = false;
      if (endedStatus !== null && state.myNickname) createCallMessage(chatId, direction, duration, endedStatus);
      console.log(`${LOG_PREFIX} Call ended. status=${endedStatus} duration=${duration}s`);
      set({ activeCall: null, incomingCall: null, callState: 'idle', duration: 0, isMicEnabled: false, isVideoEnabled: false, isScreenSharing: false, isScreenPickerOpen: false, remoteScreenShareTrack: null, remoteScreenShareIdentity: null, statusMessage: '', isEnding: false, isMinimized: false });
      try { (window as any).orbita?.closeCallWindow?.(); } catch {}
    },

    handleBusy: () => {
      const state = get();
      if (!state.activeCall) return;
      clearSignalRetryTimers();
      set({ callState: 'ended', statusMessage: i18n.t('call.busy'), activeCall: { ...state.activeCall, endedStatus: 'busy' } });
      callSoundService.stop(); callSoundService.play('end');
      get().endCall(false);
    },

    handleReject: () => {
      const state = get();
      if (!state.activeCall) return;
      clearSignalRetryTimers();
      set({ callState: 'ended', statusMessage: i18n.t('call.rejected'), activeCall: { ...state.activeCall, endedStatus: 'rejected' } });
      callSoundService.stop(); callSoundService.play('end');
      get().endCall(false);
    },

    handleAccept: async () => {
      const state = get();
      if (!state.activeCall) return;
      clearSignalRetryTimers();
      console.log(`${LOG_PREFIX} handleAccept: callee accepted`);
      callSoundService.stop(); callSoundService.play('connect');
      set({ callState: 'connecting', statusMessage: i18n.t('call.connecting') });
      if (noAnswerTimer) { clearTimeout(noAnswerTimer); noAnswerTimer = null; }

      if (connectingTimeoutTimer) clearTimeout(connectingTimeoutTimer);
      connectingTimeoutTimer = setTimeout(() => {
        if (get().callState === 'connecting') {
          console.warn(`${LOG_PREFIX} Caller connecting timeout, ending call`);
          const act = get().activeCall;
          if (act) set({ activeCall: { ...act, endedStatus: 'failed' }, callState: 'ended' });
          get().endCall();
        }
      }, CONNECTING_TIMEOUT_MS);

      if (liveKitService.status !== 'connected' && liveKitService.status !== 'connecting') {
        try {
          const { roomName, verificationSalt, verificationSecret } = state.activeCall;
          const sessionKey = verificationSecret ? (verificationSalt ? `${verificationSecret}:${verificationSalt}` : verificationSecret) : undefined;
          const { token, url } = await fetchLivekitToken(roomName, state.myNickname || 'YOU');
          await liveKitService.connect(roomName, token, url, sessionKey);
        } catch (err) {
          console.error(`${LOG_PREFIX} Caller LiveKit connect error on accept:`, err);
        }
      }

      if (liveKitService.remoteParticipants.length > 0) activateConnected();
    },

    handleConnected: (syncedConnectedAt?: number) => {
      console.log(`${LOG_PREFIX} handleConnected with ts:`, syncedConnectedAt);
      const state = get();
      if (!state.activeCall) return;
      clearSignalRetryTimers();
      if (state.callState === 'connected' && !syncedConnectedAt) return;
      activateConnected(syncedConnectedAt);
    },

    handleCancel: () => {
      console.log(`${LOG_PREFIX} Remote cancelled`);
      const state = get();
      clearSignalRetryTimers();
      callSoundService.stop();
      const room = state.activeCall?.roomName || state.incomingCall?.roomName;
      if (room) get().addProcessedRoomName(room);
      if (!state.activeCall && !state.incomingCall) return;
      if (state.incomingCall && !state.activeCall) {
        if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
        callSoundService.play('end');
        set({ incomingCall: null, callState: 'idle', statusMessage: '', isEnding: false });
        try { (window as any).orbita?.closeCallWindow?.(); } catch {}
        return;
      }
      if (state.activeCall) set({ activeCall: { ...state.activeCall, endedStatus: 'missed' }, callState: 'ended' });
      callSoundService.play('end');
      get().endCall(false);
    },

    handleHangup: () => {
      console.log(`${LOG_PREFIX} Remote hung up`);
      const state = get();
      clearSignalRetryTimers();
      callSoundService.stop();
      const room = state.activeCall?.roomName || state.incomingCall?.roomName;
      if (room) get().addProcessedRoomName(room);
      if (!state.activeCall && !state.incomingCall) return;
      if (state.incomingCall && !state.activeCall) {
        if (incomingAutoRejectTimer) { clearTimeout(incomingAutoRejectTimer); incomingAutoRejectTimer = null; }
        callSoundService.play('end');
        set({ incomingCall: null, callState: 'idle', statusMessage: '', isEnding: false });
        try { (window as any).orbita?.closeCallWindow?.(); } catch {}
        return;
      }
      if (state.activeCall) {
        const newStatus = state.callState === 'connected' ? 'completed' : 'failed';
        set({ activeCall: { ...state.activeCall, endedStatus: newStatus }, callState: 'ended', statusMessage: '' });
      }
      callSoundService.play('end');
      get().endCall(false);
    },

    toggleMic: async () => {
      const state = get();
      const next = !state.isMicEnabled;
      set({ isMicEnabled: next });
      if (state.activeCall) set({ activeCall: { ...state.activeCall, isMuted: !next } });
      try {
        if (next) { await liveKitService.enableMicrophone(); } else { await liveKitService.disableMicrophone(); }
      } catch (err) { console.error(`${LOG_PREFIX} toggleMic failed:`, err); }
    },

    toggleVideo: async () => {
      const state = get();
      const next = !state.isVideoEnabled;
      set({ isVideoEnabled: next });
      if (state.activeCall) set({ activeCall: { ...state.activeCall, isVideoEnabled: next } });
      try {
        if (next) {
          await liveKitService.enableCamera();
        } else {
          await liveKitService.disableCamera();
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} toggleVideo failed:`, err);
      }
    },
    openScreenPicker: () => set({ isScreenPickerOpen: true }),
    closeScreenPicker: () => set({ isScreenPickerOpen: false }),

    startScreenShareWithOptions: async (options) => {
      set({ isScreenPickerOpen: false });
      try {
        await liveKitService.startScreenShare(options);
      } catch (err) {
        console.error(`${LOG_PREFIX} startScreenShareWithOptions failed:`, err);
      }
    },

    stopScreenShare: async () => {
      try {
        await liveKitService.stopScreenShare();
      } catch (err) {
        console.error(`${LOG_PREFIX} stopScreenShare failed:`, err);
      }
    },

    toggleScreenShare: async () => {
      const state = get();
      if (state.isScreenSharing) {
        await state.stopScreenShare();
      } else {
        state.openScreenPicker();
      }
    },

    updateParticipants: (participants) => { const act = get().activeCall; if (act) set({ activeCall: { ...act, participants } }); },

    updateConnectionQuality: (quality) => {
      set({ connectionQuality: quality });
      const act = get().activeCall;
      if (act) set({ activeCall: { ...act, connectionQuality: quality } });
    },

    reset: () => {
      liveKitService.disconnect().catch((err) => console.error(`${LOG_PREFIX} reset disconnect error:`, err));
      clearAllTimers();
      callSoundService.stop();
      activationInProgress = false;
      set({ activeCall: null, incomingCall: null, callState: 'idle', duration: 0, isMicEnabled: false, isVideoEnabled: false, isScreenSharing: false, isScreenPickerOpen: false, remoteScreenShareTrack: null, remoteScreenShareIdentity: null, connectionQuality: 'unknown', statusMessage: '', isEnding: false, isMinimized: false });
    },
  };
});

let lastKnownCallState = 'idle';
let persistentBc: BroadcastChannel | null = null;

const syncCallState = (state: CallStore) => {
  if (typeof window === 'undefined') return;
  const isStandaloneCallWindow = window.location.pathname.includes('call.html') || new URLSearchParams(window.location.search).get('view') === 'call' || window.location.hash === '#call';
  if (isStandaloneCallWindow) return;
  const chat = state.activeCall
    ? useChatStore.getState().chats.find((c) => c.id === state.activeCall?.chatId)
    : state.incomingCall ? useChatStore.getState().chats.find((c) => c.id === state.incomingCall?.chatId) : null;
  const payload = {
    activeCall: state.activeCall ? { ...state.activeCall, otherName: chat?.name || state.activeCall.chatId, otherAvatar: chat?.avatarUrl || null } : null,
    incomingCall: state.incomingCall ? { ...state.incomingCall, otherName: chat?.name || state.incomingCall.from, otherAvatar: chat?.avatarUrl || null } : null,
    callState: state.callState, isMicEnabled: state.isMicEnabled, isVideoEnabled: state.isVideoEnabled, isScreenSharing: state.isScreenSharing, duration: state.duration, statusMessage: state.statusMessage, myNickname: state.myNickname,
    peerVolume: state.peerVolume, micVolume: state.micVolume,
    noiseSuppressionMode: useChatStore.getState().noiseSuppressionMode || (useChatStore.getState().noiseSuppression ? 'standard' : 'none'),
  };
  try { (window as any).orbita?.sendCallState?.(payload); } catch {}
  try {
    if (!persistentBc) persistentBc = new BroadcastChannel('orbita-call-channel');
    persistentBc.postMessage({ type: 'CALL_STATE_UPDATE', payload });
  } catch {}
  const prevCallState = lastKnownCallState;
  lastKnownCallState = state.callState;
  if (state.callState !== 'idle' && prevCallState === 'idle') {
    try { (window as any).orbita?.openCallWindow?.(payload); } catch {}
  } else if (state.callState === 'idle') {
    try { (window as any).orbita?.closeCallWindow?.(); } catch {}
  }
};

const handleCallAction = (action: { type: string; payload?: any }) => {
  const store = useCallStore.getState();
  switch (action.type) {
    case 'initiateCall': store.initiateCall(); break;
    case 'answerCall': store.answerCall(store.myNickname || action.payload || 'Пользователь'); break;
    case 'rejectCall': store.rejectCall(); break;
    case 'cancelCall': lastKnownCallState = 'idle'; store.endCall(true); try { (window as any).orbita?.closeCallWindow?.(); } catch {} break;
    case 'endCall': store.endCall(false); break;
    case 'toggleMic': store.toggleMic(); break;
    case 'toggleVideo': store.toggleVideo(); break;
    case 'toggleScreenShare': store.toggleScreenShare(); break;
    case 'startScreenShareWithOptions': store.startScreenShareWithOptions(action.payload); break;
    case 'stopScreenShare': store.stopScreenShare(); break;
    case 'setPeerVolume': store.setPeerVolume(action.payload); break;
    case 'setMicVolume': store.setMicVolume(action.payload); break;
    case 'setNoiseSuppressionMode':
      useChatStore.getState().setNoiseSuppressionMode(action.payload);
      liveKitService.setNoiseSuppressionMode(action.payload);
      break;
    case 'switchAudioDevice':
      if (action.payload?.kind && action.payload?.deviceId) {
        liveKitService.switchDevice(action.payload.kind, action.payload.deviceId);
        if (action.payload.kind === 'audioinput') useChatStore.getState().setSelectedMicrophoneId(action.payload.deviceId);
        if (action.payload.kind === 'audiooutput') useChatStore.getState().setSelectedSpeakerId(action.payload.deviceId);
      }
      break;
  }
};

if (typeof window !== 'undefined') {
  const isStandaloneCallWindow = window.location.pathname.includes('call.html') || new URLSearchParams(window.location.search).get('view') === 'call' || window.location.hash === '#call';
  if (!isStandaloneCallWindow) {
    useCallStore.subscribe((state) => { syncCallState(state); });
    const orbita = (window as any).orbita;
    orbita?.onCallAction?.((action: any) => { handleCallAction(action); });
    try {
      const bc = new BroadcastChannel('orbita-call-channel');
      bc.onmessage = (event) => {
        if (event.data?.type === 'CALL_ACTION') handleCallAction({ type: event.data.action, payload: event.data.payload });
        else if (event.data?.type === 'REQUEST_CALL_STATE') syncCallState(useCallStore.getState());
      };
    } catch {}
  }
}