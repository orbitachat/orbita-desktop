import {
  Room,
  LocalParticipant,
  RemoteParticipant,
  RoomEvent,
  RemoteTrack,
  LocalTrack,
  Track,
  ExternalE2EEKeyProvider,
  isE2EESupported,
  type RoomOptions,
} from 'livekit-client';
import { EventEmitter } from 'events';
import { useChatStore } from '../store/useChatStore';

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ParticipantInfo {
  identity: string;
  name?: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
}

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud';
const LOG_PREFIX = '[LiveKit]';
const MAX_CONNECT_RETRIES = 3;
const CONNECT_RETRY_BASE_DELAY_MS = 1000;

class LiveKitService extends EventEmitter {
  private room: Room | null = null;
  private localParticipant: LocalParticipant | null = null;
  private localAudioTrack: LocalTrack | null = null;
  private localVideoTrack: LocalTrack | null = null;
  private screenShareTrack: LocalTrack | null = null;
  private participants: Map<string, ParticipantInfo> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private isConnecting = false;
  private desiredMicEnabled = false;
  private keyProvider: ExternalE2EEKeyProvider | null = null;
  private e2eeWorker: Worker | null = null;
  private attachedAudioElements: Map<string, HTMLMediaElement> = new Map();

  constructor() {
    super();
    this.room = null;
  }

  public get status(): CallStatus {
    if (!this.room) return 'idle';
    switch (this.room.state) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting';
      case 'reconnecting': return 'reconnecting';
      case 'disconnected': return 'disconnected';
      default: return 'idle';
    }
  }

  public get isConnected(): boolean {
    return this.room?.state === 'connected';
  }

  public get localParticipantInfo(): ParticipantInfo | null {
    if (!this.localParticipant) return null;
    return this.participants.get(this.localParticipant.identity) || null;
  }

  public get remoteParticipants(): ParticipantInfo[] {
    return Array.from(this.participants.values()).filter(p => !p.isLocal);
  }

  public get allParticipants(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  public async connect(
    roomName: string,
    token: string,
    url: string = LIVEKIT_URL,
    verificationSecret?: string,
  ): Promise<void> {
    if (this.isConnecting) {
      console.warn(`${LOG_PREFIX} Already connecting, skipping`);
      return;
    }
    if (this.room && this.room.state === 'connected') {
      console.warn(`${LOG_PREFIX} Already connected, skipping`);
      return;
    }

    this.isConnecting = true;
    let lastError: unknown = null;

    try {
      for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
        try {
          await this.attemptConnect(roomName, token, url, verificationSecret);
          console.log(`${LOG_PREFIX} Connected successfully (attempt ${attempt})`);
          return;
        } catch (err) {
          lastError = err;
          console.error(`${LOG_PREFIX} Connection attempt ${attempt}/${MAX_CONNECT_RETRIES} failed:`, err);
          if (attempt < MAX_CONNECT_RETRIES) {
            const delay = CONNECT_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`${LOG_PREFIX} Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error('LiveKit connection failed after retries');
    } finally {
      this.isConnecting = false;
    }
  }

  private async attemptConnect(
    roomName: string,
    token: string,
    url: string,
    verificationSecret?: string,
  ): Promise<void> {
    if (this.room) {
      await this.cleanupRoom();
    }

    let e2eeOptions: RoomOptions['e2ee'] = undefined;

    if (verificationSecret && isE2EESupported()) {
      try {
        const worker = new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
          type: 'module',
        });
        this.e2eeWorker = worker;
        this.keyProvider = new ExternalE2EEKeyProvider();
        await this.keyProvider.setKey(verificationSecret);

        e2eeOptions = {
          keyProvider: this.keyProvider,
          worker,
        };
        console.log(`${LOG_PREFIX} SFrame E2EE initialized for room`);
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to initialize SFrame E2EE worker:`, err);
      }
    }

    const isNoiseSuppression = useChatStore.getState().noiseSuppressionCalls;

    const roomOptions: RoomOptions = {
      adaptiveStream: true,
      dynacast: true,
      stopLocalTrackOnUnpublish: true,
      e2ee: e2eeOptions,
      audioCaptureDefaults: {
        autoGainControl: false,
        echoCancellation: true,
        noiseSuppression: isNoiseSuppression,
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
      },
      publishDefaults: {
        dtx: false,
        red: true,
      },
    };

    this.room = new Room(roomOptions);

    this.room
      .on(RoomEvent.Connected, this.onConnected.bind(this))
      .on(RoomEvent.Disconnected, this.onDisconnected.bind(this))
      .on(RoomEvent.Reconnecting, this.onReconnecting.bind(this))
      .on(RoomEvent.Reconnected, this.onReconnected.bind(this))
      .on(RoomEvent.ParticipantConnected, this.onParticipantConnected.bind(this))
      .on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected.bind(this))
      .on(RoomEvent.TrackPublished, this.onTrackPublished.bind(this))
      .on(RoomEvent.TrackUnpublished, this.onTrackUnpublished.bind(this))
      .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed.bind(this))
      .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed.bind(this))
      .on(RoomEvent.ConnectionQualityChanged, this.onConnectionQualityChanged.bind(this))
      .on(RoomEvent.EncryptionError, (err: Error) => {
        console.error(`${LOG_PREFIX} SFrame Encryption error:`, err);
      });

    console.log(`${LOG_PREFIX} Connecting to room:`, roomName);
    await this.room.connect(url, token);

    if (this.room.hasE2EESetup) {
      try {
        await this.room.setE2EEEnabled(true);
        console.log(`${LOG_PREFIX} SFrame E2EE enabled for room`);
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to enable room E2EE:`, err);
      }
    }
  }

  public async setE2EEKey(secret: string): Promise<void> {
    if (this.keyProvider) {
      await this.keyProvider.setKey(secret);
      if (this.room && this.room.hasE2EESetup && !this.room.isE2EEEnabled) {
        await this.room.setE2EEEnabled(true);
      }
      console.log(`${LOG_PREFIX} SFrame E2EE key updated`);
    }
  }

  private async cleanupRoom(): Promise<void> {
    if (this.screenShareTrack) {
      try { await this.stopScreenShare(); } catch {}
    }
    if (this.localAudioTrack) {
      try { await this.localAudioTrack.stop(); } catch {}
      this.localAudioTrack = null;
    }
    if (this.localVideoTrack) {
      try { await this.localVideoTrack.stop(); } catch {}
      this.localVideoTrack = null;
    }
    if (this.room) {
      this.room.removeAllListeners();
      try { await this.room.disconnect(); } catch {}
      this.room = null;
    }
    if (this.e2eeWorker) {
      try { this.e2eeWorker.terminate(); } catch {}
      this.e2eeWorker = null;
    }
    this.keyProvider = null;
    this.localParticipant = null;
    this.participants.clear();
    this.attachedAudioElements.forEach((el) => {
      try { el.remove(); } catch {}
    });
    this.attachedAudioElements.clear();
  }

  public async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connectionAttempts = 0;
    this.desiredMicEnabled = false;

    await this.cleanupRoom();

    this.emit('disconnected');
  }

  public async enableMicrophone(): Promise<boolean> {
    this.desiredMicEnabled = true;

    if (!this.localParticipant) {
      return false;
    }

    try {
      const isNoiseSuppression = useChatStore.getState().noiseSuppressionCalls;
      await this.localParticipant.setMicrophoneEnabled(true, {
        autoGainControl: false,
        echoCancellation: true,
        noiseSuppression: isNoiseSuppression,
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
      });
      const pub = this.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) {
        this.localAudioTrack = pub.track as LocalTrack;
      }
      this.emit('micChanged', true);
      return true;
    } catch (err) {
      this.desiredMicEnabled = false;
      this.emit('micChanged', false);
      return false;
    }
  }

  public async disableMicrophone(): Promise<void> {
    this.desiredMicEnabled = false;

    if (!this.localParticipant) {
      return;
    }

    try {
      await this.localParticipant.setMicrophoneEnabled(false);
    } catch {}
    this.emit('micChanged', false);
  }

  public async toggleMicrophone(): Promise<boolean> {
    if (this.desiredMicEnabled) {
      await this.disableMicrophone();
      return false;
    } else {
      return await this.enableMicrophone();
    }
  }

  public async updateAudioConstraints(): Promise<void> {
    if (this.localAudioTrack && this.localAudioTrack.mediaStreamTrack) {
      const isNoiseSuppression = useChatStore.getState().noiseSuppressionCalls;
      try {
        await this.localAudioTrack.mediaStreamTrack.applyConstraints({
          noiseSuppression: isNoiseSuppression,
          echoCancellation: true,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
        });
      } catch {}
    }
  }

  private async restoreMicStateAfterReconnect(): Promise<void> {
    if (!this.desiredMicEnabled) return;
    try {
      if (!this.localParticipant) {
        console.warn(`${LOG_PREFIX} Cannot restore mic: no local participant after reconnect`);
        return;
      }
      const stillPublished = this.localAudioTrack && this.localParticipant
        .getTrackPublication(Track.Source.Microphone)?.track === this.localAudioTrack;

      if (stillPublished) {
        this.localAudioTrack!.mediaStreamTrack.enabled = true;
        this.emit('micChanged', true);
        console.log(`${LOG_PREFIX} Mic track survived reconnect, re-enabled`);
        return;
      }

      console.log(`${LOG_PREFIX} Mic track lost during reconnect, re-publishing...`);
      this.localAudioTrack = null;
      await this.enableMicrophone();
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to restore mic state after reconnect:`, err);
    }
  }

  public async enableCamera(): Promise<void> {}
  public async disableCamera(): Promise<void> {}
  public async toggleCamera(): Promise<boolean> { return false; }

  public async startScreenShare(): Promise<void> {}
  public async stopScreenShare(): Promise<void> {}
  public async toggleScreenShare(): Promise<boolean> { return false; }

  private onConnected(): void {
    this.connectionAttempts = 0;
    this.localParticipant = this.room!.localParticipant;
    this.updateParticipants();
    this.emit('connected');
    console.log(`${LOG_PREFIX} Connected to room`);
  }

  private onDisconnected(): void {
    this.localParticipant = null;
    this.participants.clear();
    this.emit('disconnected');
    console.log(`${LOG_PREFIX} Disconnected from room`);
  }

  private onReconnecting(): void {
    this.emit('reconnecting');
    console.log(`${LOG_PREFIX} Reconnecting...`);
  }

  private onReconnected(): void {
    this.emit('reconnected');
    console.log(`${LOG_PREFIX} Reconnected`);
    this.updateParticipants();
    void this.restoreMicStateAfterReconnect();
  }

  private onParticipantConnected(participant: RemoteParticipant): void {
    this.updateParticipants();
    this.emit('participantJoined', this.participants.get(participant.identity));
    console.log(`${LOG_PREFIX} Participant joined:`, participant.identity);
  }

  private onParticipantDisconnected(participant: RemoteParticipant): void {
    this.participants.delete(participant.identity);
    this.emit('participantLeft', participant.identity);
    console.log(`${LOG_PREFIX} Participant left:`, participant.identity);
  }

  private onTrackPublished(_publication: any, _participant: RemoteParticipant): void {
    this.updateParticipants();
  }

  private onTrackUnpublished(_publication: any, _participant: RemoteParticipant): void {
    this.updateParticipants();
  }

  private onTrackSubscribed(track: RemoteTrack, _publication: any, participant: RemoteParticipant): void {
    if (track.kind === Track.Kind.Audio) {
      const key = `${participant.identity}:${track.sid}`;
      try {
        const el = track.attach();
        el.id = `livekit-audio-${participant.identity}`;
        el.autoplay = true;
        el.style.display = 'none';
        document.body.appendChild(el);
        this.attachedAudioElements.set(key, el);
      } catch {}
    }
    this.emit('trackSubscribed', track, participant.identity);
  }

  private onTrackUnsubscribed(track: RemoteTrack, _publication: any, participant: RemoteParticipant): void {
    if (track.kind === Track.Kind.Audio) {
      const key = `${participant.identity}:${track.sid}`;
      const el = this.attachedAudioElements.get(key);
      if (el) {
        try { track.detach(el as HTMLAudioElement); } catch {}
        try { el.remove(); } catch {}
        this.attachedAudioElements.delete(key);
      } else {
        try { track.detach().forEach((detachedEl) => detachedEl.remove()); } catch {}
      }
    }
    this.emit('trackUnsubscribed', track, participant.identity);
  }

  private onConnectionQualityChanged(quality: any, participant: any): void {
    this.emit('connectionQuality', quality, participant.identity);
  }

  private updateParticipants(): void {
    if (!this.room) return;
    this.participants.clear();

    if (this.localParticipant) {
      const info: ParticipantInfo = {
        identity: this.localParticipant.identity,
        name: this.localParticipant.name || this.localParticipant.identity,
        audioEnabled: this.localAudioTrack?.mediaStreamTrack.enabled ?? false,
        videoEnabled: false,
        isSpeaking: false,
        isLocal: true,
      };
      this.participants.set(this.localParticipant.identity, info);
    }

    for (const [identity, participant] of this.room.remoteParticipants) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone);
      const audioEnabled = audioPub?.track?.mediaStreamTrack.enabled ?? false;
      const info: ParticipantInfo = {
        identity,
        name: participant.name || identity,
        audioEnabled,
        videoEnabled: false,
        isSpeaking: participant.isSpeaking,
        isLocal: false,
      };
      this.participants.set(identity, info);
    }
  }

  public getParticipant(identity: string): ParticipantInfo | undefined {
    return this.participants.get(identity);
  }

  public enableAutoReconnect(): void {
    this.on('disconnected', () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.connectionAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.reconnectTimer = setTimeout(() => {
          this.connectionAttempts++;
          console.log(`${LOG_PREFIX} Auto-reconnect attempt ${this.connectionAttempts}`);
          this.emit('reconnectAttempt', this.connectionAttempts);
        }, 2000 * this.connectionAttempts);
      } else {
        console.error(`${LOG_PREFIX} Max reconnect attempts reached`);
        this.emit('reconnectFailed');
      }
    });
  }

  public cancelAutoReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const liveKitService = new LiveKitService();
export default liveKitService;