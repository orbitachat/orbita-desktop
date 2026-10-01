import {
  Room,
  LocalParticipant,
  RoomEvent,
  RemoteTrack,
  LocalTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  Track,
  type RoomOptions,
  type RoomConnectOptions,
} from 'livekit-client';
import { EventEmitter } from 'events';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
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
  private screenShareAudioTrack: LocalTrack | null = null;
  private participants: Map<string, ParticipantInfo> = new Map();
  private attachedAudioElements: Map<string, HTMLMediaElement> = new Map();
  private isConnecting = false;
  private desiredMicEnabled = true;
  private desiredVideoEnabled = false;
  private peerVolume = 1.0;
  private micVolume = 1.0;
  private currentRoomName: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private connectedAt = 0;

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

  private applyHighAudioPriority(track: any): void {
    try {
      const sender = track?.sender as RTCRtpSender | undefined;
      if (sender && typeof sender.getParameters === 'function' && typeof sender.setParameters === 'function') {
        const params = sender.getParameters();
        if (params && params.encodings && params.encodings.length > 0) {
          params.encodings.forEach((enc: any) => {
            enc.priority = 'high';
            enc.networkPriority = 'high';
            enc.maxBitrate = 64000;
          });
          sender.setParameters(params).catch(() => {});
        }
      }
    } catch {}
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
              width: 854,
              height: 480,
              frameRate: 15,
              aspectRatio: 16 / 9,
            },
          },
          publishDefaults: {
            dtx: false,
            red: true,
            forceStereo: false,
            audioPreset: {
              maxBitrate: 96000,
              priority: 'high',
            },
            videoCodec: 'h264',
            videoEncoding: {
              maxBitrate: 450000,
              maxFramerate: 15,
              priority: 'medium',
            },
            degradationPreference: 'maintain-resolution',
            screenShareEncoding: {
              maxBitrate: 550000,
              maxFramerate: 15,
              priority: 'low',
            },
            simulcast: false,
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
          .on(RoomEvent.ParticipantMetadataChanged, () => {
            this.updateParticipants();
            this.emit('participantsChanged', this.getParticipants());
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
            this.updateParticipants();
            this.emit('participantsChanged', this.getParticipants());
            this.emit('activeSpeakersChanged', speakers);
          })
          .on(RoomEvent.ConnectionQualityChanged, (q: any, p: any) => {
            this.updateParticipants();
            this.emit('connectionQuality', q, p.identity);
            this.emit('participantsChanged', this.getParticipants());
          })
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

        const targetUrl = (!url || url.includes('fewfregfrtgtr') || !url.startsWith('wss://')) ? LIVEKIT_URL : url;
        await this.room.connect(targetUrl, token, roomConnectOptions);
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
    const myAvatar = useAuthStore.getState().avatarUrl || (() => {
      try {
        return JSON.parse(localStorage.getItem('orbita-auth-storage') || '{}')?.state?.avatarUrl;
      } catch { return null; }
    })();
    if (myAvatar && this.localParticipant) {
      try {
        this.localParticipant.setMetadata(JSON.stringify({ avatarUrl: myAvatar }));
      } catch {}
    }
    this.connectedAt = Date.now();
    this.updateParticipants();
    this.emit('connected');
  }

  private async onReconnected(): Promise<void> {
    if (!this.room) return;
    this.localParticipant = this.room.localParticipant;
    const myAvatar = useAuthStore.getState().avatarUrl || (() => {
      try {
        return JSON.parse(localStorage.getItem('orbita-auth-storage') || '{}')?.state?.avatarUrl;
      } catch { return null; }
    })();
    if (myAvatar && this.localParticipant) {
      try {
        this.localParticipant.setMetadata(JSON.stringify({ avatarUrl: myAvatar }));
      } catch {}
    }
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

        const selectedSpeakerId = useChatStore.getState().selectedSpeakerId;
        if (selectedSpeakerId && typeof (el as any).setSinkId === 'function') {
          (el as any).setSinkId(selectedSpeakerId).catch(() => {});
        }

        document.body.appendChild(el);
        this.attachedAudioElements.set(key, el);
      }
      track.attach(el);
      el.volume = Math.min(1.0, this.peerVolume);
      el.play().catch(() => {});
      if (track.source !== Track.Source.ScreenShareAudio && Date.now() - this.connectedAt > 2000 && !track.isMuted) {
        this.emit('remoteMicChanged', true, participant.identity);
      }
    }

    if (track.source === Track.Source.ScreenShare) {
      this.emit('remoteScreenShareChanged', true, track, participant.identity);
    } else if (track.kind === Track.Kind.Video || track.source === Track.Source.Camera) {
      this.emit('remoteCameraChanged', true, track, participant.identity);
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
      this.emit('remoteMicChanged', false, participant?.identity);
    }
    if (track.source === Track.Source.ScreenShare) {
      this.emit('remoteScreenShareChanged', false, null, participant.identity);
    } else if (track.kind === Track.Kind.Video || track.source === Track.Source.Camera) {
      this.emit('remoteCameraChanged', false, null, participant.identity);
    }
    this.updateParticipants();
    this.emit('trackUnsubscribed', track, participant.identity);
    this.emit('participantsChanged');
  }

  private onTrackMuted(publication: any, participant: any): void {
    if (participant && this.localParticipant && participant.identity === this.localParticipant.identity) {
      if (this.desiredMicEnabled && this.localAudioTrack && !this.localAudioTrack.mediaStreamTrack.enabled) {
        this.localAudioTrack.mediaStreamTrack.enabled = true;
      }
    }
    const isLocal = Boolean(participant?.isLocal || (this.localParticipant && participant?.identity === this.localParticipant.identity));
    if (!isLocal) {
      const isScreen = publication?.source === Track.Source.ScreenShare || publication?.source === 'screen_share';
      const isVideo = !isScreen && (publication?.kind === Track.Kind.Video || publication?.kind === 'video' || publication?.source === Track.Source.Camera || publication?.source === 'camera');
      const isScreenAudio = publication?.source === Track.Source.ScreenShareAudio || publication?.source === 'screen_share_audio';
      const isAudio = !isScreenAudio && (publication?.kind === Track.Kind.Audio || publication?.kind === 'audio' || publication?.source === Track.Source.Microphone || publication?.source === 'microphone');
      if (isVideo) {
        this.emit('remoteCameraChanged', false, null, participant?.identity);
      } else if (isAudio) {
        this.emit('remoteMicChanged', false, participant?.identity);
      }
    }
    this.updateParticipants();
    this.emit('trackMuted');
    this.emit('participantsChanged');
  }

  private onTrackUnmuted(publication: any, participant: any): void {
    const isLocal = Boolean(participant?.isLocal || (this.localParticipant && participant?.identity === this.localParticipant.identity));
    if (!isLocal) {
      const isScreen = publication?.source === Track.Source.ScreenShare || publication?.source === 'screen_share';
      const isVideo = !isScreen && (publication?.kind === Track.Kind.Video || publication?.kind === 'video' || publication?.source === Track.Source.Camera || publication?.source === 'camera');
      const isScreenAudio = publication?.source === Track.Source.ScreenShareAudio || publication?.source === 'screen_share_audio';
      const isAudio = !isScreenAudio && (publication?.kind === Track.Kind.Audio || publication?.kind === 'audio' || publication?.source === Track.Source.Microphone || publication?.source === 'microphone');
      if (isVideo) {
        this.emit('remoteCameraChanged', true, publication?.track, participant?.identity);
      } else if (isAudio) {
        this.emit('remoteMicChanged', true, participant?.identity);
      }
    }
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
    if (this.screenShareAudioTrack) {
      try {
        this.screenShareAudioTrack.stop();
      } catch {}
      this.screenShareAudioTrack = null;
    }
    if (this.screenShareTrack) {
      try {
        this.screenShareTrack.stop();
      } catch {}
      this.screenShareTrack = null;
    }
    this.localParticipant = null;
    this.localAudioTrack = null;
    this.localVideoTrack = null;
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
        dtx: true,
        red: true,
        forceStereo: false,
        audioPreset: {
          maxBitrate: 64000,
          priority: 'high',
        },
      });

      const pub = this.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) {
        this.localAudioTrack = pub.track as LocalTrack;
        try {
          (this.localAudioTrack as any).setVolume?.(this.micVolume);
        } catch {}
        this.applyHighAudioPriority(pub.track);
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
          width: 854,
          height: 480,
          frameRate: 15,
          aspectRatio: 16 / 9,
        },
      }, {
        videoCodec: 'h264',
        videoEncoding: {
          maxBitrate: 450000,
          maxFramerate: 15,
          priority: 'medium',
        },
        degradationPreference: 'maintain-resolution',
        simulcast: false,
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

  public getLocalAudioTrack(): LocalTrack | null {
    if (this.localAudioTrack) return this.localAudioTrack;
    const lp = this.localParticipant || this.room?.localParticipant;
    if (lp) {
      const pub = lp.getTrackPublication(Track.Source.Microphone)
        || Array.from(lp.trackPublications.values()).find((t) => t.source === Track.Source.Microphone);
      if (pub?.track) {
        this.localAudioTrack = pub.track as LocalTrack;
        return this.localAudioTrack;
      }
    }
    return null;
  }

  public getRemoteAudioTrack(identity?: string): RemoteTrack | null {
    if (!this.room) return null;
    if (identity) {
      const participant = this.room.remoteParticipants.get(identity);
      if (participant) {
        const pub = participant.getTrackPublication(Track.Source.Microphone)
          || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Microphone);
        return (pub?.track as RemoteTrack) || null;
      }
    }
    for (const participant of this.room.remoteParticipants.values()) {
      const pub = participant.getTrackPublication(Track.Source.Microphone)
        || Array.from(participant.trackPublications.values()).find((t) => t.source === Track.Source.Microphone);
      if (pub?.track) {
        return pub.track as RemoteTrack;
      }
    }
    return null;
  }

  public async startScreenShare(options?: { sourceId?: string; audio?: boolean }): Promise<boolean> {
    if (!this.localParticipant) return false;
    const width = 1280;
    const height = 720;
    const frameRate = 15;
    const maxBitrate = 550000;
    const includeAudio = !!options?.audio;

    try {
      if (options?.sourceId) {
        const constraints: any = {
          audio: includeAudio
            ? {
                mandatory: {
                  chromeMediaSource: 'desktop',
                },
              }
            : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: options.sourceId,
              maxWidth: width,
              maxHeight: height,
              maxFrameRate: frameRate,
            },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const vTrack = stream.getVideoTracks()[0];
        if (!vTrack) throw new Error('No video track');

        if ('contentHint' in vTrack) {
          vTrack.contentHint = 'detail';
        }

        const localVTrack = new LocalVideoTrack(vTrack, undefined, false);
        localVTrack.source = Track.Source.ScreenShare;
        await this.localParticipant.publishTrack(localVTrack, {
          source: Track.Source.ScreenShare,
          name: 'screen_share',
          simulcast: false,
          videoEncoding: {
            maxBitrate,
            maxFramerate: frameRate,
            priority: 'low',
          },
          degradationPreference: 'maintain-resolution',
        });
        try {
          const vSender = (localVTrack as any).sender as RTCRtpSender | undefined;
          if (vSender && typeof vSender.getParameters === 'function' && typeof vSender.setParameters === 'function') {
            const vParams = vSender.getParameters();
            if (vParams && vParams.encodings && vParams.encodings.length > 0) {
              vParams.encodings.forEach((enc: any) => {
                enc.priority = 'low';
                enc.networkPriority = 'low';
              });
              vSender.setParameters(vParams).catch(() => {});
            }
          }
        } catch {}
        this.screenShareTrack = localVTrack;

        vTrack.onended = () => {
          void this.stopScreenShare();
        };

        if (includeAudio && stream.getAudioTracks().length > 0) {
          const aTrack = stream.getAudioTracks()[0];
          const localATrack = new LocalAudioTrack(aTrack, undefined, false);
          await this.localParticipant.publishTrack(localATrack, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen_share_audio',
            forceStereo: true,
            dtx: true,
            red: true,
            audioPreset: {
              maxBitrate: 64000,
              priority: 'low',
            },
          });
          this.screenShareAudioTrack = localATrack;
        }

        this.updateParticipants();
        this.emit('screenShareChanged', true, this.screenShareTrack);
        this.emit('participantsChanged');
        return true;
      }

      await this.localParticipant.setScreenShareEnabled(true, {
        audio: includeAudio,
        contentHint: 'detail',
        resolution: {
          width,
          height,
          frameRate,
        },
      }, {
        simulcast: false,
        screenShareEncoding: {
          maxBitrate,
          maxFramerate: frameRate,
          priority: 'low',
        },
        degradationPreference: 'maintain-resolution',
      });
      const pub = this.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (pub?.track) {
        if ('contentHint' in pub.track.mediaStreamTrack) {
          pub.track.mediaStreamTrack.contentHint = 'detail';
        }
        this.screenShareTrack = pub.track as LocalTrack;
        pub.track.mediaStreamTrack.onended = () => {
          void this.stopScreenShare();
        };
      }
      this.updateParticipants();
      this.emit('screenShareChanged', true, this.screenShareTrack);
      this.emit('participantsChanged');
      return true;
    } catch {
      this.screenShareTrack = null;
      this.screenShareAudioTrack = null;
      this.emit('screenShareChanged', false, null);
      return false;
    }
  }

  public async stopScreenShare(): Promise<void> {
    if (this.screenShareAudioTrack) {
      try {
        if (this.localParticipant) await this.localParticipant.unpublishTrack(this.screenShareAudioTrack);
        this.screenShareAudioTrack.stop();
      } catch {}
      this.screenShareAudioTrack = null;
    }
    if (this.screenShareTrack) {
      try {
        if (this.localParticipant) await this.localParticipant.unpublishTrack(this.screenShareTrack);
        this.screenShareTrack.stop();
      } catch {}
      this.screenShareTrack = null;
    }
    if (this.localParticipant) {
      try {
        await this.localParticipant.setScreenShareEnabled(false);
      } catch {}
    }
    this.screenShareTrack = null;
    this.screenShareAudioTrack = null;
    this.updateParticipants();
    this.emit('screenShareChanged', false, null);
    this.emit('participantsChanged');
  }

  public async toggleScreenShare(options?: { sourceId?: string; quality?: '480p' | '720p'; fps?: number; audio?: boolean }): Promise<boolean> {
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
      let localAvatar: string | null = null;
      if (this.localParticipant.metadata) {
        try {
          localAvatar = JSON.parse(this.localParticipant.metadata)?.avatarUrl || null;
        } catch {}
      }
      if (!localAvatar) {
        localAvatar = useAuthStore.getState().avatarUrl || (() => {
          try {
            return JSON.parse(localStorage.getItem('orbita-auth-storage') || '{}')?.state?.avatarUrl;
          } catch { return null; }
        })();
      }
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
        avatarUrl: localAvatar,
        audioEnabled: this.desiredMicEnabled && (this.localAudioTrack?.mediaStreamTrack.enabled ?? true),
        videoEnabled: isVideoOn,
        screenShareEnabled: isScreenOn,
        isSpeaking: !!this.localParticipant?.isSpeaking,
        isLocal: true,
        connectionQuality: this.localParticipant.connectionQuality,
      };
      this.participants.set(this.localParticipant.identity, info);
    }

    for (const [identity, participant] of this.room.remoteParticipants) {
      let remoteAvatar: string | null = null;
      if (participant.metadata) {
        try {
          remoteAvatar = JSON.parse(participant.metadata)?.avatarUrl || null;
        } catch {}
      }
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
        avatarUrl: remoteAvatar,
        audioEnabled,
        videoEnabled,
        screenShareEnabled: screenEnabled,
        isSpeaking: participant.isSpeaking,
        isLocal: false,
        connectionQuality: participant.connectionQuality,
      };
      this.participants.set(identity, info);
    }
  }
}

export const groupLiveKitService = new GroupLiveKitService();
