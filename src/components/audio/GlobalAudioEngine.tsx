import { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/useAudioStore';
import { useDecryptedMedia } from '../../lib/media-utils';

export const GlobalAudioEngine = () => {
  const currentTrack = useAudioStore((state) => state.currentTrack);
  const isPlaying = useAudioStore((state) => state.isPlaying);
  const isSeeking = useAudioStore((state) => state.isSeeking);
  const volume = useAudioStore((state) => state.volume);
  const playbackRate = useAudioStore((state) => state.playbackRate);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  const { blobUrl } = useDecryptedMedia(
    currentTrack?.url || null,
    currentTrack?.sharedSecret,
    currentTrack?.message?.mediaName || currentTrack?.title,
    currentTrack?.message?.mime || (currentTrack?.mediaType === 'voice' ? 'audio/webm' : undefined),
    currentTrack?.chatId,
    currentTrack?.message?.id || currentTrack?.id
  );

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    useAudioStore.setState({
      getLiveTime: () => (audioRef.current ? audioRef.current.currentTime : 0),
    });

    const syncDuration = () => {
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        const currentDur = useAudioStore.getState().duration;
        if (!currentDur || Math.abs(currentDur - dur) > 0.05) {
          useAudioStore.getState().setDuration(dur);
        }
      }
    };

    const handleLoadedMetadata = () => {
      syncDuration();
    };

    const handleTimeUpdate = () => {
      if (useAudioStore.getState().isSeeking) return;
      useAudioStore.getState().setCurrentTime(audio.currentTime);
      syncDuration();
    };

    const handleEnded = () => {
      const state = useAudioStore.getState();
      if (audioRef.current) {
        audioRef.current.volume = state.volume;
      }
      if (state.repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        state.setCurrentTime(0);
      } else {
        state.next();
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    const unsub = useAudioStore.subscribe((state, prevState) => {
      if (!audio.src || state.isSeeking) return;
      if (Math.abs(state.currentTime - prevState.currentTime) > 0.5 && Math.abs(audio.currentTime - state.currentTime) > 0.5) {
        audio.currentTime = state.currentTime;
      }
    });

    return () => {
      useAudioStore.setState({ getLiveTime: undefined });
      unsub();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      audio.load();
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = useAudioStore.getState().volume;
    }
  }, [currentTrack?.id]);

  useEffect(() => {
    let animId: number;
    let lastVoiceTime = 0;
    let voiceStallFrames = 0;

    const checkFade = () => {
      const audio = audioRef.current;
      if (audio && isPlaying && !isSeeking && audio.duration && isFinite(audio.duration) && audio.duration > 1.5 && currentTrack?.mediaType !== 'voice') {
        const remaining = audio.duration - audio.currentTime;
        const baseVol = useAudioStore.getState().volume;
        if (remaining <= 0.5 && remaining >= 0) {
          const factor = Math.max(0, Math.min(1, remaining / 0.5));
          const clamped = Math.max(0, Math.min(1, baseVol * factor));
          audio.volume = clamped;
        } else if (Math.abs(audio.volume - baseVol) > 0.01) {
          audio.volume = baseVol;
        }
      }

      if (audio && isPlaying && !isSeeking && currentTrack?.mediaType === 'voice') {
        const dur = (isFinite(audio.duration) && audio.duration > 0)
          ? audio.duration
          : (useAudioStore.getState().duration || currentTrack.duration || 0);

        if (dur > 0 && audio.currentTime >= dur - 0.06) {
          useAudioStore.getState().setCurrentTime(dur);
          const state = useAudioStore.getState();
          if (audioRef.current) {
            audioRef.current.volume = state.volume;
          }
          state.next();
          return;
        }

        if (audio.currentTime > 0.2 && Math.abs(audio.currentTime - lastVoiceTime) < 0.001) {
          voiceStallFrames++;
          if (voiceStallFrames >= 12) {
            voiceStallFrames = 0;
            if (dur > 0 && audio.currentTime < dur) {
              useAudioStore.getState().setDuration(audio.currentTime);
            }
            useAudioStore.getState().setCurrentTime(audio.currentTime);
            const state = useAudioStore.getState();
            if (audioRef.current) {
              audioRef.current.volume = state.volume;
            }
            state.next();
            return;
          }
        } else {
          lastVoiceTime = audio.currentTime;
          voiceStallFrames = 0;
        }
      }

      if (isPlaying) {
        animId = requestAnimationFrame(checkFade);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(checkFade);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, isSeeking, currentTrack?.id, currentTrack?.mediaType]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!currentTrack && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      prevBlobUrlRef.current = null;
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (blobUrl && blobUrl !== prevBlobUrlRef.current) {
      audio.volume = useAudioStore.getState().volume;
      audio.src = blobUrl;
      audio.load();
      prevBlobUrlRef.current = blobUrl;
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [blobUrl, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isSeeking) {
      audio.pause();
    } else {
      audio.currentTime = useAudioStore.getState().currentTime;
      audio.volume = useAudioStore.getState().volume;
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [isSeeking, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src || isSeeking) return;

    if (isPlaying) {
      if (audio.duration > 0 && audio.currentTime >= audio.duration - 0.1) {
        audio.currentTime = 0;
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying, isSeeking]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Orbita',
      artist: currentTrack.artist || '',
      album: 'Orbita',
      artwork: currentTrack.cover
        ? [
            { src: currentTrack.cover, sizes: '96x96', type: 'image/png' },
            { src: currentTrack.cover, sizes: '256x256', type: 'image/png' },
            { src: currentTrack.cover, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    });
    navigator.mediaSession.setActionHandler('play', () => useAudioStore.getState().play());
    navigator.mediaSession.setActionHandler('pause', () => useAudioStore.getState().pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => useAudioStore.getState().previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => useAudioStore.getState().next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        useAudioStore.getState().seek(details.seekTime);
        if (audioRef.current) audioRef.current.currentTime = details.seekTime;
      }
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      useAudioStore.getState().pause();
      useAudioStore.getState().clearQueue();
    });
    return () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
        navigator.mediaSession.setActionHandler('stop', null);
      }
    };
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  return null;
};
