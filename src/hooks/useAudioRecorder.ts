import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';
import { useDevicePermissionStore } from '../store/useDevicePermissionStore';

export interface RecordedAudioData {
  blob: Blob;
  duration: number;
  waveform: number[];
}

export type RecorderStatus = 'idle' | 'recording' | 'paused';

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [amplitude, setAmplitude] = useState<number>(0);
  const [draftBlob, setDraftBlob] = useState<Blob | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Web Audio API refs for live visualizer and waveform data
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const samplesRef = useRef<number[]>([]);

  // Cleanup draft URL when updated or unmounted
  useEffect(() => {
    return () => {
      if (draftUrl) {
        URL.revokeObjectURL(draftUrl);
      }
    };
  }, [draftUrl]);

  const cleanupAudioContext = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Normalizes sampled array into fixed number of bars (e.g., 36 bars between 5 and 100)
  const computeNormalizedWaveform = useCallback((rawSamples: number[], targetBars = 36): number[] => {
    if (rawSamples.length === 0) {
      // Default placeholder pattern if empty
      return Array.from({ length: targetBars }, () => Math.floor(Math.random() * 40) + 10);
    }

    const result: number[] = [];
    const step = rawSamples.length / targetBars;

    for (let i = 0; i < targetBars; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < rawSamples.length; j++) {
        sum += rawSamples[j];
        count++;
      }
      const avg = count > 0 ? sum / count : rawSamples[start] || 0;
      result.push(avg);
    }

    const maxVal = Math.max(...result, 1);
    // Scale values to range 8..100 for clean Telegram bars
    return result.map((v) => Math.max(8, Math.round((v / maxVal) * 100)));
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const micGranted = await useDevicePermissionStore.getState().requestPermission('microphone');
      if (!micGranted) {
        setStatus('idle');
        return;
      }
      cleanupStream();
      cleanupAudioContext();
      clearTimer();

      const isNoiseSuppression = useChatStore.getState().noiseSuppressionVoice;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: isNoiseSuppression,
          echoCancellation: true,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      streamRef.current = stream;

      // Setup Web Audio API
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;

      let recordStream = stream;

      if (isNoiseSuppression) {
        // High-pass filter removes sub-bass rumble, wind, desk thumping (< 85Hz)
        const highPass = audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.setValueAtTime(85, audioCtx.currentTime);

        // Low-pass filter removes high-frequency hiss, coil whine (> 7500Hz)
        const lowPass = audioCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.setValueAtTime(7500, audioCtx.currentTime);

        // Dynamics Compressor smoothes voice dynamics and suppresses harsh clipping/peaks
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        source.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(compressor);
        compressor.connect(analyser);

        const destination = audioCtx.createMediaStreamDestination();
        compressor.connect(destination);
        recordStream = destination.stream;
      } else {
        source.connect(analyser);
      }

      // Select mime type with opus/ogg priority
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      samplesRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);

      setStatus('recording');
      useChatStore.getState().setIsRecordingVoice(true);
      setRecordingTime(0);
      setDraftBlob(null);
      if (draftUrl) {
        URL.revokeObjectURL(draftUrl);
        setDraftUrl(null);
      }

      const startTime = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((Date.now() - startTime) / 1000);
      }, 50);

      // Amplitude analyzer loop with low-pass smoothing & throttled React updates
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastUIUpdate = 0;
      let currentSmoothed = 0;

      const updateAmplitude = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const rawNormalized = Math.min(100, Math.round((avg / 128) * 100));

          // Low-pass filter for smooth motion
          currentSmoothed = currentSmoothed * 0.7 + rawNormalized * 0.3;
          const smoothedValue = Math.round(currentSmoothed);

          samplesRef.current.push(smoothedValue);

          const now = Date.now();
          if (now - lastUIUpdate > 40) { // ~25 FPS UI state update rate for low CPU load
            setAmplitude(smoothedValue);
            lastUIUpdate = now;
          }
        }
        animFrameRef.current = requestAnimationFrame(updateAmplitude);
      };
      updateAmplitude();
    } catch (err) {
      console.error('Failed to start recording:', err);
      cancelRecording();
      throw err;
    }
  }, [cleanupAudioContext, cleanupStream, clearTimer, draftUrl]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.pause();
      clearTimer();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setStatus('paused');

      // Build draft blob
      const mimeType = mediaRecorderRef.current.mimeType || 'audio/ogg;codecs=opus';
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      setDraftBlob(blob);
      const url = URL.createObjectURL(blob);
      setDraftUrl(url);
    }
  }, [clearTimer, status]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'paused') {
      mediaRecorderRef.current.resume();
      setStatus('recording');

      const currentSecs = recordingTime;
      const startTime = Date.now() - currentSecs * 1000;
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingTime((Date.now() - startTime) / 1000);
      }, 50);

      const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount || 64);
      const updateAmplitude = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          setAmplitude(normalized);
          samplesRef.current.push(normalized);
        }
        animFrameRef.current = requestAnimationFrame(updateAmplitude);
      };
      updateAmplitude();
    }
  }, [recordingTime, status]);

  const stopRecording = useCallback(async (): Promise<RecordedAudioData | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        if (draftBlob) {
          const waveform = computeNormalizedWaveform(samplesRef.current);
          const finalDuration = Math.max(1, Math.round(recordingTime));
          cleanupStream();
          cleanupAudioContext();
          clearTimer();
          setStatus('idle');
          resolve({ blob: draftBlob, duration: finalDuration, waveform });
          return;
        }
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const waveform = computeNormalizedWaveform(samplesRef.current);
        const finalDuration = Math.max(1, Math.round(recordingTime));

        cleanupStream();
        cleanupAudioContext();
        clearTimer();
        setStatus('idle');
        useChatStore.getState().setIsRecordingVoice(false);
        setRecordingTime(0);
        setAmplitude(0);
        setDraftBlob(null);

        resolve({ blob, duration: finalDuration, waveform });
      };

      recorder.stop();
    });
  }, [cleanupAudioContext, cleanupStream, clearTimer, computeNormalizedWaveform, draftBlob, recordingTime]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanupStream();
    cleanupAudioContext();
    clearTimer();
    setStatus('idle');
    useChatStore.getState().setIsRecordingVoice(false);
    setRecordingTime(0);
    setAmplitude(0);
    setDraftBlob(null);
    if (draftUrl) {
      URL.revokeObjectURL(draftUrl);
      setDraftUrl(null);
    }
    audioChunksRef.current = [];
    samplesRef.current = [];
  }, [cleanupAudioContext, cleanupStream, clearTimer, draftUrl]);

  useEffect(() => {
    const handleGlobalCancel = () => {
      cancelRecording();
    };
    window.addEventListener('orbita:cancel-voice-recording', handleGlobalCancel);
    return () => {
      window.removeEventListener('orbita:cancel-voice-recording', handleGlobalCancel);
    };
  }, [cancelRecording]);

  useEffect(() => {
    return () => {
      useChatStore.getState().setIsRecordingVoice(false);
    };
  }, []);

  return {
    status,
    isRecording: status === 'recording',
    isPaused: status === 'paused',
    recordingTime,
    amplitude,
    draftBlob,
    draftUrl,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  };
}
