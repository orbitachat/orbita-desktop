import { useChatStore } from '../store/useChatStore';

export type CallSoundType = 'incoming' | 'outgoing' | 'connect' | 'end' | 'user_join' | 'stream_started' | 'stream_is_over' | 'mute' | 'unmute';

class CallSoundService {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private activeAudios: Set<HTMLAudioElement> = new Set();
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private activeGains: Set<GainNode> = new Set();
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private isCurrentlyPlaying = false;
  private isCurrentlyLooping = false;
  private currentPlayId = 0;

  private getPath(type: CallSoundType): string {
    const map: Record<CallSoundType, string> = {
      incoming: 'sounds/call_ringing.mp3',
      outgoing: 'sounds/call_calling.mp3',
      connect:  'sounds/user_join.mp3',
      end:      'sounds/disconnect.mp3',
      user_join: 'sounds/user_join.mp3',
      stream_started: 'sounds/stream_started.mp3',
      stream_is_over: 'sounds/stream_is_over.mp3',
      mute:     'sounds/mute.mp3',
      unmute:   'sounds/unmute.mp3',
    };
    return map[type];
  }

  private getAudioContext(): AudioContext | null {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    return this.ctx;
  }

  private async loadBuffer(path: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(path)) {
      return this.bufferCache.get(path)!;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return null;

    const filename = path.split('/').pop() || path;
    const candidates = [
      './' + path,
      '/' + path,
      path,
      './sounds/' + filename,
      '/sounds/' + filename,
      'sounds/' + filename,
      './' + filename,
      '/' + filename,
      filename,
    ];
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) continue;
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.bufferCache.set(path, audioBuffer);
        return audioBuffer;
      } catch {}
    }
    return null;
  }

  async play(type: CallSoundType): Promise<void> {
    const callSoundsEnabled = useChatStore.getState().callSoundsEnabled;
    if (callSoundsEnabled === false) {
      return;
    }

    const path = this.getPath(type);
    if (!path) {
      return;
    }

    const isLoop = (type === 'incoming' || type === 'outgoing');
    if (isLoop || this.isCurrentlyLooping) {
      this.stop();
      if (isLoop) {
        this.isCurrentlyLooping = true;
      }
    }
    const playId = ++this.currentPlayId;
    const ctx = this.getAudioContext();

    if (ctx) {
      const speakerId = useChatStore.getState().selectedSpeakerId;
      if (speakerId && typeof (ctx as any).setSinkId === 'function') {
        try {
          await (ctx as any).setSinkId(speakerId);
        } catch {}
      }

      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {}
      }

      try {
        const buffer = await this.loadBuffer(path);
        if (this.currentPlayId !== playId) return;

        if (buffer) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = isLoop;

          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          this.activeSources.add(source);
          this.activeGains.add(gainNode);

          source.onended = () => {
            this.activeSources.delete(source);
            this.activeGains.delete(gainNode);
            try { source.disconnect(); } catch {}
            try { gainNode.disconnect(); } catch {}
            if (this.currentSource === source) {
              this.currentSource = null;
              this.isCurrentlyPlaying = false;
            }
          };

          this.currentSource = source;
          this.gainNode = gainNode;
          this.isCurrentlyPlaying = true;

          source.start(0);
          return;
        }
      } catch {}
    }

    if (this.currentPlayId !== playId) return;

    try {
      const audio = new Audio('./' + path);
      audio.loop = isLoop;
      audio.volume = 1.0;

      const speakerId = useChatStore.getState().selectedSpeakerId;
      if (speakerId && typeof (audio as any).setSinkId === 'function') {
        try {
          await (audio as any).setSinkId(speakerId);
        } catch {}
      }

      this.activeAudios.add(audio);

      audio.onended = () => {
        this.activeAudios.delete(audio);
        if (this.currentAudioElement === audio) {
          this.currentAudioElement = null;
          this.isCurrentlyPlaying = false;
        }
      };

      this.currentAudioElement = audio;
      this.isCurrentlyPlaying = true;
      await audio.play();
    } catch {
      this.stop();
    }
  }

  stop(): void {
    this.currentPlayId++;
    this.isCurrentlyLooping = false;

    for (const gain of this.activeGains) {
      try {
        if (this.ctx) gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.disconnect();
      } catch {}
    }
    this.activeGains.clear();

    for (const src of this.activeSources) {
      try {
        src.stop(0);
        src.disconnect();
      } catch {}
    }
    this.activeSources.clear();

    if (this.currentSource) {
      try {
        this.currentSource.stop(0);
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    if (this.gainNode) {
      try {
        if (this.ctx) this.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }

    for (const audio of this.activeAudios) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
      } catch {}
    }
    this.activeAudios.clear();

    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement.removeAttribute('src');
        this.currentAudioElement.load();
      } catch {}
      this.currentAudioElement = null;
    }

    this.isCurrentlyPlaying = false;
  }

  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }
}

export const callSoundService = new CallSoundService();