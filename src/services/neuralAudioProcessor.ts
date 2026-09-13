import loadRNNoise from './rnnoise.js';
import type { Track, AudioProcessorOptions, TrackProcessor } from 'livekit-client';

export type NoiseSuppressionMode = 'krisp' | 'standard' | 'none';

class AudioRingBuffer {
  private buffer: Float32Array;
  private readIndex: number = 0;
  private writeIndex: number = 0;
  private count: number = 0;
  private capacity: number;

  constructor(capacity: number = 16384) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  public write(data: Float32Array): void {
    const len = data.length;
    for (let i = 0; i < len; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      if (this.count < this.capacity) {
        this.count++;
      } else {
        this.readIndex = (this.readIndex + 1) % this.capacity;
      }
    }
  }

  public read(output: Float32Array, length: number): number {
    const toRead = Math.min(length, this.count);
    for (let i = 0; i < toRead; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }
    this.count -= toRead;
    return toRead;
  }

  public available(): number {
    return this.count;
  }

  public clear(): void {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.count = 0;
  }
}

class NeuralAudioProcessorService {
  private module: any = null;
  private rnnoiseState: any = null;
  private inPtr: number = 0;
  private outPtr: number = 0;
  private initPromise: Promise<void> | null = null;
  private isReady: boolean = false;

  public async init(): Promise<void> {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const wasmUrl = typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/rnnoise.wasm`
          : '/rnnoise.wasm';

        const loadedModule = await loadRNNoise({
          locateFile: () => wasmUrl,
        });

        this.module = loadedModule;
        this.rnnoiseState = this.module._rnnoise_create(0);
        this.inPtr = this.module._malloc(480 * 4);
        this.outPtr = this.module._malloc(480 * 4);
        this.isReady = true;
      } catch (err) {
        this.isReady = false;
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public processChunkSync(
    input: Float32Array,
    output: Float32Array,
    mode: NoiseSuppressionMode
  ): number {
    if (mode === 'none' || !this.isReady || !this.module || !this.rnnoiseState) {
      output.set(input);
      return 1.0;
    }

    for (let i = 0; i < 480; i++) {
      this.module.setValue(this.inPtr + i * 4, input[i] * 32768.0, 'float');
    }

    const vadProb = this.module._rnnoise_process_frame(this.rnnoiseState, this.outPtr, this.inPtr);

    for (let i = 0; i < 480; i++) {
      const val = this.module.getValue(this.outPtr + i * 4, 'float') / 32768.0;
      output[i] = Math.max(-1.0, Math.min(1.0, val));
    }

    return vadProb;
  }

  public async processStream(
    inputStream: MediaStream,
    mode: NoiseSuppressionMode
  ): Promise<{ stream: MediaStream; cleanup: () => void }> {
    if (mode === 'none') {
      return {
        stream: inputStream,
        cleanup: () => {},
      };
    }

    try {
      await this.init();
    } catch {
      return {
        stream: inputStream,
        cleanup: () => {},
      };
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx({ sampleRate: 48000 });
    const source = audioCtx.createMediaStreamSource(inputStream);

    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, audioCtx.currentTime);

    const presenceBoost = audioCtx.createBiquadFilter();
    presenceBoost.type = 'peaking';
    presenceBoost.frequency.setValueAtTime(3200, audioCtx.currentTime);
    presenceBoost.gain.setValueAtTime(mode === 'krisp' ? 2.5 : 0, audioCtx.currentTime);
    presenceBoost.Q.setValueAtTime(1.0, audioCtx.currentTime);

    const bufferSize = 1024;
    const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);

    const inputBuffer = new AudioRingBuffer(16384);
    const outputBuffer = new AudioRingBuffer(16384);
    const chunkIn = new Float32Array(480);
    const chunkOut = new Float32Array(480);
    const tempBlock = new Float32Array(480);

    let smoothedVad = 1.0;
    let currentGain = 1.0;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const outputData = e.outputBuffer.getChannelData(0);

      inputBuffer.write(inputData);

      while (inputBuffer.available() >= 480) {
        inputBuffer.read(chunkIn, 480);
        const vadProb = this.processChunkSync(chunkIn, chunkOut, mode);

        if (mode === 'krisp') {
          smoothedVad = smoothedVad * 0.85 + vadProb * 0.15;
          const targetGain = smoothedVad < 0.05 ? 0.35 : 1.0;
          const attackSpeed = targetGain > currentGain ? 0.4 : 0.06;
          currentGain = currentGain * (1 - attackSpeed) + targetGain * attackSpeed;

          for (let i = 0; i < 480; i++) {
            tempBlock[i] = chunkOut[i] * currentGain;
          }
          outputBuffer.write(tempBlock);
        } else {
          outputBuffer.write(chunkOut);
        }
      }

      const readCount = outputBuffer.read(outputData, outputData.length);
      if (readCount < outputData.length) {
        outputData.fill(0, readCount);
      }
    };

    const destination = audioCtx.createMediaStreamDestination();

    source.connect(highPass);
    highPass.connect(presenceBoost);
    presenceBoost.connect(processor);
    processor.connect(destination);

    const silentGain = audioCtx.createGain();
    silentGain.gain.setValueAtTime(0, audioCtx.currentTime);
    processor.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    const cleanup = () => {
      try {
        processor.disconnect();
        presenceBoost.disconnect();
        highPass.disconnect();
        source.disconnect();
        destination.disconnect();
        silentGain.disconnect();
        inputBuffer.clear();
        outputBuffer.clear();
        audioCtx.close().catch(() => {});
      } catch {}
    };

    return {
      stream: destination.stream,
      cleanup,
    };
  }

  public createLiveKitProcessor(
    getMode: () => NoiseSuppressionMode
  ): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    let activeCtx: AudioContext | null = null;
    let activeProcessor: ScriptProcessorNode | null = null;
    let activeSource: MediaStreamAudioSourceNode | null = null;
    let activeDestination: MediaStreamAudioDestinationNode | null = null;
    let activeFilter: BiquadFilterNode | null = null;
    let activeBoost: BiquadFilterNode | null = null;
    let activeSilentGain: GainNode | null = null;

    const inputBuffer = new AudioRingBuffer(16384);
    const outputBuffer = new AudioRingBuffer(16384);
    const chunkIn = new Float32Array(480);
    const chunkOut = new Float32Array(480);
    const tempBlock = new Float32Array(480);
    let smoothedVad = 1.0;
    let currentGain = 1.0;

    const cleanupNodes = () => {
      try {
        activeProcessor?.disconnect();
        activeFilter?.disconnect();
        activeBoost?.disconnect();
        activeSource?.disconnect();
        activeDestination?.disconnect();
        activeSilentGain?.disconnect();
      } catch {}
      activeProcessor = null;
      activeFilter = null;
      activeBoost = null;
      activeSource = null;
      activeDestination = null;
      activeSilentGain = null;
      inputBuffer.clear();
      outputBuffer.clear();
    };

    const processorObj: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
      name: 'neural-noise-suppression',
      init: async (opts) => {
        const mode = getMode();
        if (mode === 'none') {
          processorObj.processedTrack = opts.track;
          return;
        }

        try {
          await this.init();
        } catch {
          processorObj.processedTrack = opts.track;
          return;
        }

        cleanupNodes();

        activeCtx = opts.audioContext;
        const stream = new MediaStream([opts.track]);
        activeSource = activeCtx.createMediaStreamSource(stream);

        activeFilter = activeCtx.createBiquadFilter();
        activeFilter.type = 'highpass';
        activeFilter.frequency.setValueAtTime(80, activeCtx.currentTime);

        activeBoost = activeCtx.createBiquadFilter();
        activeBoost.type = 'peaking';
        activeBoost.frequency.setValueAtTime(3200, activeCtx.currentTime);
        activeBoost.gain.setValueAtTime(mode === 'krisp' ? 2.5 : 0, activeCtx.currentTime);
        activeBoost.Q.setValueAtTime(1.0, activeCtx.currentTime);

        activeProcessor = activeCtx.createScriptProcessor(1024, 1, 1);

        activeProcessor.onaudioprocess = (e) => {
          const currentMode = getMode();
          const inData = e.inputBuffer.getChannelData(0);
          const outData = e.outputBuffer.getChannelData(0);

          if (currentMode === 'none') {
            outData.set(inData);
            return;
          }

          inputBuffer.write(inData);

          while (inputBuffer.available() >= 480) {
            inputBuffer.read(chunkIn, 480);
            const vadProb = this.processChunkSync(chunkIn, chunkOut, currentMode);

            if (currentMode === 'krisp') {
              smoothedVad = smoothedVad * 0.85 + vadProb * 0.15;
              const targetGain = smoothedVad < 0.05 ? 0.35 : 1.0;
              const attackSpeed = targetGain > currentGain ? 0.4 : 0.06;
              currentGain = currentGain * (1 - attackSpeed) + targetGain * attackSpeed;

              for (let i = 0; i < 480; i++) {
                tempBlock[i] = chunkOut[i] * currentGain;
              }
              outputBuffer.write(tempBlock);
            } else {
              outputBuffer.write(chunkOut);
            }
          }

          const readCount = outputBuffer.read(outData, outData.length);
          if (readCount < outData.length) {
            outData.fill(0, readCount);
          }
        };

        activeDestination = activeCtx.createMediaStreamDestination();

        activeSource.connect(activeFilter);
        activeFilter.connect(activeBoost);
        activeBoost.connect(activeProcessor);
        activeProcessor.connect(activeDestination);

        activeSilentGain = activeCtx.createGain();
        activeSilentGain.gain.setValueAtTime(0, activeCtx.currentTime);
        activeProcessor.connect(activeSilentGain);
        activeSilentGain.connect(activeCtx.destination);

        const tracks = activeDestination.stream.getAudioTracks();
        if (tracks.length > 0) {
          processorObj.processedTrack = tracks[0];
        } else {
          processorObj.processedTrack = opts.track;
        }
      },
      restart: async (opts) => {
        await processorObj.init(opts);
      },
      destroy: async () => {
        cleanupNodes();
        processorObj.processedTrack = undefined;
      },
    };

    return processorObj;
  }
}

export const neuralAudioProcessor = new NeuralAudioProcessorService();
