import {
  Room,
  LocalParticipant,
  RoomEvent,
  RemoteTrack,
  LocalTrack,
  Track,
  VideoPresets,
  type RoomOptions,
  type RoomConnectOptions,
} from 'livekit-client';
import { EventEmitter } from 'events';
import { useChatStore } from '../store/useChatStore';
import { useDevicePermissionStore } from '../store/useDevicePermissionStore';
import type { NoiseSuppressionMode } from './neuralAudioProcessor';
import type { ParticipantInfo, CallStatus } from './livekitService';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'wss://orbita-qd7zok2r.livekit.cloud';

export class GroupLiveKitService extends EventEmitter {
  private room: Room | null = null;
  private localParticipant: LocalParticipant | null = null;
  private localAudioTrack: LocalTrack | null = null;
  private localVideoTrack: LocalTrack | null = null;
  private screenShareTrack: LocalTrack | null = null;
  private participants: Map<string, ParticipantInfo> = new Map();
  private attachedAudioElements: Map<string, HTMLMediaElement> = new Map();
  private isConnecting = false;
  private desiredMicEnabled = true;
  private desiredVideoEnabled = false;
  private peerVolume = 1.0;
  private micVolume = 1.0;
  private currentRoomName: string | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor() {
    super();
    this.room = null;
  }

  public setPeerVolume(volume: number): void {
    this.peerVolume = Math.max(0, Math.min(2.0, volume));
    this.attachedAudioElements.forEach((el) => {
      try {
        el.volume = Math.min(1.0, this.peerVolume);
      } catch {}
    });
    if (this.room) {
      for (const p of this.room.remoteParticipants.values()) {
        const pub = p.getTrackPublication(Track.Source.Microphone);
        if (pub?.track) {
          try {
            (pub.track as any).setVolume?.(this.peerVolume);
          } catch {}
        }
      }
    }
  }

  public getPeerVolume(): number {
    return this.peerVolume;
  }

  public setMicVolume(volume: number): void {
    this.micVolume = Math.max(0, Math.min(2.0, volume));
    if (this.localAudioTrack) {
      try {
        (this.localAudioTrack as any).setVolume?.(this.micVolume);
      } catch {}
    }
  }

  public getMicVolume(): number {
    return this.micVolume;
  }

  public get status(): CallStatus {
    if (!this.room) return 'idle';
    switch (this.room.state) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting';
      case 'reconnecting': return 'reconnecting';
      default: return 'disconnected';
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
    return Array.from(this.participants.values()).filter((p) => !p.isLocal);
  }

  public get allParticipants(): ParticipantInfo[] {
    return Array.from(this.participants.values());
  }

  public get isCurrentlyConnecting(): boolean {
    return this.isConnecting;
  }

  public getParticipants(): ParticipantInfo[] {
    return this.allParticipants;
  }

  public getParticipant(identity: string): ParticipantInfo | undefined {
    return this.participants.get(identity);
  }

  public async connect(
    roomName: string,
    token: string,
    url: string = LIVEKIT_URL,
    _verificationSecret?: string,
  ): Promise<void> {
    if (this.room && this.room.state === 'connected' && this.currentRoomName === roomName) {
      return;
    }

    if (this.isConnecting && this.currentRoomName === roomName && this.connectPromise) {
      return this.connectPromise;
    }

    this.isConnecting = true;
    this.currentRoomName = roomName;

    this.connectPromise = (async () => {
      try {
        if (this.room) {
          await this.cleanupRoom();
        }

        const alwaysRelay = useChatStore.getState().alwaysRelayCalls;
        const selectedMicId = useChatStore.getState().selectedMicrophoneId;
        const selectedCamId = useChatStore.getState().selectedCameraId;

        const roomOptions: RoomOptions = {
          adaptiveStream: true,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
          audioCaptureDefaults: {
            deviceId: selectedMicId || undefined,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
            sampleRate: 48000,
            sampleSize: 16,
          },
          videoCaptureDefaults: {
            deviceId: selectedCamId || undefined,
            resolution: {
              width: 1280,
              height: 720,
              frameRate: 30,
              aspectRatio: 16 / 9,
            },
          },
          publishDefaults: {
            dtx: false,
            red: true,
            forceStereo: false,
            videoSimulcastLayers: [VideoPresets.h360],
            degradationPreference: 'maintain-framerate',
            screenShareEncoding: {
              maxBitrate: 2500000,
              maxFramerate: 30,
              priority: 'medium',
            },
            simulcast: true,
          },
        };

        this.room = new Room(roomOptions);

        this.room
          .on(RoomEvent.Connected, this.onConnected.bind(this))
          .on(RoomEvent.Disconnected, this.onDisconnected.bind(this))
          .on(RoomEvent.Reconnecting, () => this.emit('reconnecting'))
          .on(RoomEvent.Reconnected, this.onReconnected.bind(this))
          .on(RoomEvent.ParticipantConnected, this.onParticipantConnected.bind(this))
          .on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected.bind(this))
          .on(RoomEvent.TrackSubscribed, this.onTrackSubscribed.bind(this))
          .on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed.bind(this))
          .on(RoomEvent.TrackMuted, this.onTrackMuted.bind(this))
          .on(RoomEvent.TrackUnmuted, this.onTrackUnmuted.bind(this))
          .on(RoomEvent.ConnectionQualityChanged, (q: any, p: any) => this.emit('connectionQuality', q, p.identity))
          .on(RoomEvent.LocalTrackPublished, (pub: any) => {
            if (pub.source === Track.Source.ScreenShare) {
              this.screenShareTrack = (pub.track as LocalTrack) || null;
              this.emit('screenShareChanged', true, this.screenShareTrack);
            }
          })
          .on(RoomEvent.LocalTrackUnpublished, (pub: any) => {
            if (pub.source === Track.Source.ScreenShare) {
              this.screenShareTrack = null;
              this.emit('screenShareChanged', false, null);
            }
          });

        const roomConnectOptions: RoomConnectOptions = {
          rtcConfig: {
            iceTransportPolicy: alwaysRelay ? 'relay' : 'all',
          },
        };

        await this.room.connect(url, token, roomConnectOptions);
        this.localParticipant = this.room.localParticipant;
        this.updateParticipants();

        const selectedSpeakerId = useChatStore.getState().selectedSpeakerId;
        if (selectedSpeakerId) {
          try {
            await this.room.switchActiveDevice('audiooutput', selectedSpeakerId);
          } catch {}
        }

        if (this.desiredMicEnabled) {
          await this.enableMicrophone();
        }
        if (this.desiredVideoEnabled) {
          await this.enableCamera();
        }

        this.emit('connected');
      } finally {
        this.isConnecting = false;
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private onConnected(): void {
    if (!this.room) return;
    this.localParticipant = this.room.localParticipant;
    this.updateParticipants();
    this.emit('connected');
  }

  private async onReconnected(): Promise<void> {
    if (!this.room) return;
    this.localParticipant = this.room.localParticipant;
    this.updateParticipants();
    if (this.desiredMicEnabled) {
      await this.enableMicrophone();
    }
    if (this.desiredVideoEnabled) {
      await this.enableCamera();
    }
    this.emit('reconnected');
  }

  private onDisconnected(): void {
    this.cleanupAudioElements();
    this.participants.clear();
    this.emit('disconnected');
  }

  private onParticipantConnected(participant: any): void {
    this.updateParticipants();
    this.emit('participantJoined', participant.identity);
    this.emit('participantsChanged');
  }

  private onParticipantDisconnected(participant: any): void {
    this.cleanupAudioForParticipant(participant.identity);
    this.participants.delete(participant.identity);
    this.emit('participantLeft', participant.identity);
    this.emit('participantsChanged');
  }

  private onTrackSubscribed(track: RemoteTrack, _publication: any, participant: any): void {
    if (track.kind === Track.Kind.Audio) {
      const key = `${participant.identity}-${track.sid}`;
      let el = this.attachedAudioElements.get(key);
      if (!el) {
        el = document.createElement('audio');
        el.autoplay = true;
        el.setAttribute('data-group-call-audio', participant.identity);
        document.body.appendChild(el);
        this.attachedAudioElements.set(key, el);
      }
      track.attach(el);
      el.volume = Math.min(1.0, this.peerVolume);
      el.play().catch(() => {});
    }

    this.updateParticipants();
    this.emit('trackSubscribed', track, participant.identity);
    this.emit('participantsChanged');
  }

  private onTrackUnsubscribed(track: RemoteTrack, _publication: any, participant: any): void {
    if (track.kind === Track.Kind.Audio) {
      const key = `${participant.identity}-${track.sid}`;
      const el = this.attachedAudioElements.get(key);
      if (el) {
        try {
          track.detach(el);
        } catch {}
        el.remove();
        this.attachedAudioElements.delete(key);
      }
    }
    this.updateParticipants();
    this.emit('trackUnsubscribed', track, participant.identity);
    this.emit('participantsChanged');
  }

  private onTrackMuted(_publication: any, participant: any): void {
    if (participant && this.localParticipant && participant.identity === this.localParticipant.identity) {
      if (this.desiredMicEnabled && this.localAudioTrack && !this.localAudioTrack.mediaStreamTrack.enabled) {
        this.localAudioTrack.mediaStreamTrack.enabled = true;
      }
    }
    this.updateParticipants();
    this.emit('trackMuted');
    this.emit('participantsChanged');
  }

  private onTrackUnmuted(_publication: any, _participant: any): void {
    this.updateParticipants();
    this.emit('trackUnmuted');
    this.emit('participantsChanged');
  }

  private cleanupAudioForParticipant(identity: string): void {
    for (const [key, el] of this.attachedAudioElements.entries()) {
      if (key.startsWith(`${identity}-`)) {
        el.remove();
        this.attachedAudioElements.delete(key);
      }
    }
  }

  private cleanupAudioElements(): void {
    this.attachedAudioElements.forEach((el) => {
      try {
        el.remove();
      } catch {}
    });
    this.attachedAudioElements.clear();
  }

  private async cleanupRoom(): Promise<void> {
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch {}
      this.room.removeAllListeners();
      this.room = null;
    }
    this.cleanupAudioElements();
    this.localParticipant = null;
    this.localAudioTrack = null;
    this.localVideoTrack = null;
    this.screenShareTrack = null;
    this.participants.clear();
  }

  public async disconnect(): Promise<void> {
    this.currentRoomName = null;
    this.isConnecting = false;
    this.connectPromise = null;
    await this.cleanupRoom();
    this.emit('disconnected');
  }

  public async enableMicrophone(): Promise<boolean> {
    this.desiredMicEnabled = true;

    if (!this.localParticipant) {
      return true;
    }

    const granted = await useDevicePermissionStore.getState().requestPermission('microphone');
    if (!granted) {
      this.desiredMicEnabled = false;
      this.emit('micChanged', false);
      return false;
    }

    try {
      const selectedMicId = useChatStore.getState().selectedMicrophoneId;
      await this.localParticipant.setMicrophoneEnabled(true, {
        deviceId: selectedMicId || undefined,
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
      }, {
        dtx: false,
        forceStereo: false,
        audioPreset: {
          maxBitrate: 48000,
          priority: 'high',
        },
      });

      const pub = this.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) {
        this.localAudioTrack = pub.track as LocalTrack;
        try {
          (this.localAudioTrack as any).setVolume?.(this.micVolume);
        } catch {}
      }

      this.updateParticipants();
      this.emit('micChanged', true);
      this.emit('participantsChanged');
      return true;
    } catch {
      this.desiredMicEnabled = false;
      this.emit('micChanged', false);
      return false;
    }
  }

  public async disableMicrophone(): Promise<void> {
    this.desiredMicEnabled = false;

    if (!this.localParticipant) {
      this.emit('micChanged', false);
      return;
    }

    try {
      await this.localParticipant.setMicrophoneEnabled(false);
    } catch {}

    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.mediaStreamTrack.enabled = false;
      } catch {}
    }

    this.updateParticipants();
    this.emit('micChanged', false);
    this.emit('participantsChanged');
  }

  public async toggleMicrophone(): Promise<boolean> {
    if (this.desiredMicEnabled) {
      await this.disableMicrophone();
      return false;
    } else {
      return await this.enableMicrophone();
    }
  }

  public async enableCamera(): Promise<boolean> {
    this.desiredVideoEnabled = true;
    if (!this.localParticipant) {
      return true;
    }

    const granted = await useDevicePermissionStore.getState().requestPermission('camera');
    if (!granted) {
      this.desiredVideoEnabled = false;
      this.emit('cameraChanged', false, null);
      return false;
    }

    try {
      const selectedCamId = useChatStore.getState().selectedCameraId;
      await this.localParticipant.setCameraEnabled(true, {
        deviceId: selectedCamId || undefined,
        resolution: {
          width: 1280,
          height: 720,
          frameRate: 30,
          aspectRatio: 16 / 9,
        },
      });

      const pub = this.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track) {
        this.localVideoTrack = pub.track as LocalTrack;
      }

      this.updateParticipants();
      this.emit('cameraChanged', true, this.localVideoTrack);
      this.emit('participantsChanged');
      return true;
    } catch {
      this.desiredVideoEnabled = false;
      this.emit('cameraChanged', false, null);
      return false;
    }
  }

  public async disableCamera(): Promise<void> {
    this.desiredVideoEnabled = false;
    if (!this.localParticipant) {
      this.emit('cameraChanged', false, null);
      return;
    }

    try {
      await this.localParticipant.setCameraEnabled(false);
    } catch {}

    this.localVideoTrack = null;
    this.updateParticipants();
    this.emit('cameraChanged', false, null);
    this.emit('participantsChanged');
  }

  public async toggleCamera(): Promise<boolean> {
    if (this.desiredVideoEnabled) {
      await this.disableCamera();
      return false;
    } else {
      return await this.enableCamera();
    }
  }

  public getLocalVideoTrack(): LocalTrack | null {
    return this.localVideoTrack;
  }

  public getRemoteVideoTrack(identity?: string): RemoteTrack | null {
    if (!this.room) return null;
    if (identity) {
      const participant = this.room.remoteParticipants.get(identity);
      if (participant) {
        const pub = participant.getTrackPublication(Track.Source.Camera)
          || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Camera);
        return (pub?.track as RemoteTrack) || null;
      }
    }
    for (const participant of this.room.remoteParticipants.values()) {
      const pub = participant.getTrackPublication(Track.Source.Camera)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Camera);
      if (pub?.track) {
        return pub.track as RemoteTrack;
      }
    }
    return null;
  }

  public async startScreenShare(options?: { sourceId?: string; quality?: '720p' | '1080p'; fps?: number; audio?: boolean }): Promise<boolean> {
    if (!this.localParticipant) return false;
    try {
      await this.localParticipant.setScreenShareEnabled(true, {
        audio: options?.audio ?? true,
      });
      const pub = this.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (pub?.track) {
        this.screenShareTrack = pub.track as LocalTrack;
      }
      this.updateParticipants();
      this.emit('screenShareChanged', true, this.screenShareTrack);
      this.emit('participantsChanged');
      return true;
    } catch {
      this.emit('screenShareChanged', false, null);
      return false;
    }
  }

  public async stopScreenShare(): Promise<void> {
    if (!this.localParticipant) return;
    try {
      await this.localParticipant.setScreenShareEnabled(false);
    } catch {}
    this.screenShareTrack = null;
    this.updateParticipants();
    this.emit('screenShareChanged', false, null);
    this.emit('participantsChanged');
  }

  public async toggleScreenShare(options?: { sourceId?: string; quality?: '720p' | '1080p'; fps?: number; audio?: boolean }): Promise<boolean> {
    if (this.isScreenSharing()) {
      await this.stopScreenShare();
      return false;
    } else {
      return await this.startScreenShare(options);
    }
  }

  public isScreenSharing(): boolean {
    return !!(this.screenShareTrack && this.screenShareTrack.mediaStreamTrack.enabled && !this.screenShareTrack.isMuted);
  }

  public getScreenShareTrack(): LocalTrack | null {
    return this.screenShareTrack;
  }

  public getRemoteScreenShareTrack(identity?: string): RemoteTrack | null {
    if (!this.room) return null;
    if (identity) {
      const participant = this.room.remoteParticipants.get(identity);
      if (participant) {
        const pub = participant.getTrackPublication(Track.Source.ScreenShare)
          || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.ScreenShare);
        return (pub?.track as RemoteTrack) || null;
      }
    }
    for (const participant of this.room.remoteParticipants.values()) {
      const pub = participant.getTrackPublication(Track.Source.ScreenShare)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.ScreenShare);
      if (pub?.track) {
        return pub.track as RemoteTrack;
      }
    }
    return null;
  }

  public async switchDevice(kind: 'audioinput' | 'audiooutput' | 'videoinput', deviceId: string): Promise<void> {
    if (!this.room) return;
    try {
      await this.room.switchActiveDevice(kind, deviceId);
    } catch {}
  }

  public async setNoiseSuppressionMode(_mode: NoiseSuppressionMode): Promise<void> {}

  private updateParticipants(): void {
    if (!this.room) return;
    this.participants.clear();

    if (this.localParticipant) {
      const isVideoOn = !!(
        this.localVideoTrack &&
        this.localVideoTrack.mediaStreamTrack &&
        this.localVideoTrack.mediaStreamTrack.enabled &&
        !this.localVideoTrack.isMuted
      );
      const isScreenOn = this.isScreenSharing();
      const info: ParticipantInfo = {
        identity: this.localParticipant.identity,
        name: this.localParticipant.name || this.localParticipant.identity,
        audioEnabled: this.desiredMicEnabled && (this.localAudioTrack?.mediaStreamTrack.enabled ?? true),
        videoEnabled: isVideoOn,
        screenShareEnabled: isScreenOn,
        isSpeaking: false,
        isLocal: true,
      };
      this.participants.set(this.localParticipant.identity, info);
    }

    for (const [identity, participant] of this.room.remoteParticipants) {
      const audioPub = participant.getTrackPublication(Track.Source.Microphone)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Microphone);
      const audioEnabled = audioPub?.track ? (!audioPub.isMuted && audioPub.track.mediaStreamTrack.enabled) : false;

      const videoPub = participant.getTrackPublication(Track.Source.Camera)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Camera);
      const videoEnabled = !!(
        videoPub &&
        videoPub.track &&
        !videoPub.isMuted &&
        videoPub.track.mediaStreamTrack &&
        videoPub.track.mediaStreamTrack.enabled
      );

      const screenPub = participant.getTrackPublication(Track.Source.ScreenShare)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.ScreenShare);
      const screenEnabled = !!(
        screenPub &&
        screenPub.track &&
        !screenPub.isMuted &&
        screenPub.track.mediaStreamTrack &&
        screenPub.track.mediaStreamTrack.enabled
      );

      const info: ParticipantInfo = {
        identity,
        name: participant.name || identity,
        audioEnabled,
        videoEnabled,
        screenShareEnabled: screenEnabled,
        isSpeaking: participant.isSpeaking,
        isLocal: false,
      };
      this.participants.set(identity, info);
    }
  }
}

export const groupLiveKitService = new GroupLiveKitService();
