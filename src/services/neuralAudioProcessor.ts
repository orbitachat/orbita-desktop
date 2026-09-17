import type { Track, AudioProcessorOptions, TrackProcessor } from 'livekit-client';

export type NoiseSuppressionMode = 'krisp' | 'standard' | 'none';

class NeuralAudioProcessorService {
  public async init(): Promise<void> {
    return Promise.resolve();
  }

  public processChunkSync(
    input: Float32Array,
    output: Float32Array,
    _mode: NoiseSuppressionMode
  ): number {
    output.set(input);
    return 1.0;
  }

  public async processStream(
    inputStream: MediaStream,
    _mode: NoiseSuppressionMode
  ): Promise<{ stream: MediaStream; cleanup: () => void }> {
    return {
      stream: inputStream,
      cleanup: () => {},
    };
  }

  public createLiveKitProcessor(
    _getMode: () => NoiseSuppressionMode
  ): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
    const processorObj: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
      name: 'neural-noise-suppression',
      init: async (opts) => {
        processorObj.processedTrack = opts.track;
      },
      restart: async (opts) => {
        processorObj.processedTrack = opts.track;
      },
      destroy: async () => {
        processorObj.processedTrack = undefined;
      },
    };

    return processorObj;
  }
}

export const neuralAudioProcessor = new NeuralAudioProcessorService();
