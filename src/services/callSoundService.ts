import { useChatStore } from '../store/useChatStore';

export type CallSoundType = 'incoming' | 'outgoing' | 'connect' | 'end';

class CallSoundService {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private isCurrentlyPlaying = false;
  private currentPlayId = 0;

  private getPath(type: CallSoundType): string {
    const map: Record<CallSoundType, string> = {
      incoming: 'sounds/2.wav',
      outgoing: 'sounds/1.wav',
      connect:  'sounds/4.wav',
      end:      'sounds/3.wav',
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

    const candidates = ['./' + path, '/' + path, path];
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

    this.stop();
    const playId = ++this.currentPlayId;

    const isLoop = (type === 'incoming' || type === 'outgoing');
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
          gainNode.gain.value = 1.0;

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          source.onended = () => {
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

      audio.onended = () => {
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
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {}
      this.currentSource = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
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