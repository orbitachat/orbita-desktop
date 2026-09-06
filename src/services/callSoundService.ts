import { useChatStore } from '../store/useChatStore';

export type CallSoundType = 'incoming' | 'outgoing' | 'connect' | 'end';

class CallSoundService {
  private ctx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private isCurrentlyPlaying = false;

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

    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(path, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn(`[CallSound] Failed to load/decode audio from ${path}:`, err);
      return null;
    }
  }

  async play(type: CallSoundType): Promise<void> {
    const callSoundsEnabled = useChatStore.getState().callSoundsEnabled;
    if (!callSoundsEnabled) {
      return;
    }

    const path = this.getPath(type);
    if (!path) {
      console.warn(`[CallSound] Unknown sound type: ${type}`);
      return;
    }

    this.stop();

    const ctx = this.getAudioContext();
    if (!ctx) return;

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
      if (!buffer) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = (type === 'incoming' || type === 'outgoing');

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
    } catch (error) {
      console.warn('[CallSound] Failed to play sound:', error);
      this.stop();
    }
  }

  /**
   * Останавливает текущее воспроизведение.
   */
  stop(): void {
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
    this.isCurrentlyPlaying = false;
  }

  /**
   * Возвращает true, если в данный момент играет звук.
   */
  isPlaying(): boolean {
    return this.isCurrentlyPlaying;
  }
}

export const callSoundService = new CallSoundService();