const RUST_VAD_WASM_BASE64 = 'AGFzbQEAAAABCwJgAn99AX9gAAF/AwQDAAEBBQMBABEGGQN/AUGAgMAAC38AQYCgwAALfwBBgKDAAAsHWwYGbWVtb3J5AgARZGV0ZWN0X3ZvaWNlX3J1c3QAAA5nZXRfYnVmZmVyX2xlbgABDmdldF9idWZmZXJfcHRyAAIKX19kYXRhX2VuZAMBC19faGVhcF9iYXNlAwIKsgIDoAICBH8GfUGACCECQQAhAwJAAkACQAJAIABBgAhLDQACQCAADQBBAA8LQQEhAiAAQQFGDQEgAEEBcSEDIAAhAgtBgIDAgAAhACACQf4PcSIEIQVDAAAAACEGQwAAAAAhBwNAIABBBGoqAgAiCIwgCCAIQwAAAABdGyIJIAAqAgAiCowgCiAKQwAAAABdGyILIAYgCyAGXhsiBiAJIAZeGyEGIAcgCiAKlJIgCCAIlJIhByAAQQhqIQAgBUF+aiIFDQALIANFDQIMAQtBACEEQwAAAAAhBkMAAAAAIQcLIARBAnQqAoCAwIAAIgiMIAggCEMAAAAAXRsiCiAGIAogBl4bIQYgByAIIAiUkiEHCyAGIAFgIAcgArOVIAEgAZRgcgsFAEGACAsIAEGAgMCAAAsAZwRuYW1lABYVb3JiaXRhX3ZvaWNlX3ZhZC53YXNtATQDABFkZXRlY3Rfdm9pY2VfcnVzdAEOZ2V0X2J1ZmZlcl9sZW4CDmdldF9idWZmZXJfcHRyBxIBAA9fX3N0YWNrX3BvaW50ZXIATQlwcm9kdWNlcnMCCGxhbmd1YWdlAQRSdXN0AAxwcm9jZXNzZWQtYnkBBXJ1c3RjHTEuOTUuMCAoNTk4MDc2MTZlIDIwMjYtMDQtMTQpAJQBD3RhcmdldF9mZWF0dXJlcwgrC2J1bGstbWVtb3J5Kw9idWxrLW1lbW9yeS1vcHQrFmNhbGwtaW5kaXJlY3Qtb3ZlcmxvbmcrCm11bHRpdmFsdWUrD211dGFibGUtZ2xvYmFscysTbm9udHJhcHBpbmctZnB0b2ludCsPcmVmZXJlbmNlLXR5cGVzKwhzaWduLWV4dA==';

class RustVoiceVadService {
  private instance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private bufferPtr = 0;
  private bufferLen = 1024;
  private floatView: Float32Array | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const binaryString = atob(RUST_VAD_WASM_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const mod = new WebAssembly.Module(bytes);
      this.instance = new WebAssembly.Instance(mod, {});
      const exports = this.instance.exports as any;
      this.memory = exports.memory;
      this.bufferPtr = exports.get_buffer_ptr();
      this.bufferLen = exports.get_buffer_len();
      this.floatView = new Float32Array(this.memory!.buffer, this.bufferPtr, this.bufferLen);
    } catch {}
  }

  public isVoiceDetected(samples: Float32Array, threshold = 0.028): boolean {
    if (!this.instance || !this.floatView) return false;
    const len = Math.min(samples.length, this.bufferLen);
    this.floatView.set(samples.subarray(0, len));
    const res = (this.instance.exports as any).detect_voice_rust(len, threshold);
    return res === 1;
  }
}

export const rustVoiceVad = new RustVoiceVadService();

let sharedAudioContext: AudioContext | null = null;
let activeDetectorsCount = 0;

function getSharedAudioContext(): AudioContext | null {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

export function attachRustVoiceDetector(
  track: MediaStreamTrack | null | undefined,
  onSpeakingChange: (isSpeaking: boolean) => void,
  threshold = 0.028
): () => void {
  if (!track || track.readyState === 'ended' || !track.enabled) {
    onSpeakingChange(false);
    return () => {};
  }

  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let animId: number | null = null;
  let silenceTimer: any = null;
  let isSpeakingState = false;
  let consecutiveVoiceFrames = 0;
  let lastCheckTime = 0;

  try {
    const audioContext = getSharedAudioContext();
    if (!audioContext) return () => {};

    activeDetectorsCount++;

    const stream = new MediaStream([track]);
    sourceNode = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.2;
    sourceNode.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);

    const checkAudio = () => {
      if (!analyser) return;
      const now = performance.now();
      if (now - lastCheckTime >= 50) {
        lastCheckTime = now;
        analyser.getFloatTimeDomainData(buffer);

        const hasVoice = rustVoiceVad.isVoiceDetected(buffer, threshold);

        if (hasVoice) {
          consecutiveVoiceFrames++;
          if (consecutiveVoiceFrames >= 2) {
            if (silenceTimer) {
              clearTimeout(silenceTimer);
              silenceTimer = null;
            }
            if (!isSpeakingState) {
              isSpeakingState = true;
              onSpeakingChange(true);
            }
          }
        } else {
          consecutiveVoiceFrames = 0;
          if (isSpeakingState && !silenceTimer) {
            silenceTimer = setTimeout(() => {
              isSpeakingState = false;
              onSpeakingChange(false);
              silenceTimer = null;
            }, 260);
          }
        }
      }

      animId = requestAnimationFrame(checkAudio);
    };

    checkAudio();
  } catch {
    onSpeakingChange(false);
  }

  return () => {
    if (animId) cancelAnimationFrame(animId);
    if (silenceTimer) clearTimeout(silenceTimer);
    if (sourceNode) { try { sourceNode.disconnect(); } catch {} }
    if (analyser) { try { analyser.disconnect(); } catch {} }
    activeDetectorsCount = Math.max(0, activeDetectorsCount - 1);
    if (activeDetectorsCount === 0 && sharedAudioContext && sharedAudioContext.state !== 'closed') {
      try { sharedAudioContext.close(); } catch {}
      sharedAudioContext = null;
    }
    onSpeakingChange(false);
  };
}
