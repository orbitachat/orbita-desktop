// src/components/audio/GlobalAudioEngine.tsx
import { useEffect, useRef } from 'react';
import { useAudioStore } from '../../store/useAudioStore';
import { useDecryptedMedia } from '../../lib/media-utils';

/**
 * Headless Global Audio Engine that lives continuously in MainLayout.
 * It manages the persistent HTML Audio instance, media decryption,
 * playback state, time updates, and MediaSession integration.
 * This guarantees audio never stutters or resets when navigating between views.
 */
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

  // Initialize persistent audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        useAudioStore.getState().setDuration(dur);
      }
    };

    const handleTimeUpdate = () => {
      if (useAudioStore.getState().isSeeking) return;
      useAudioStore.getState().setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      const { repeat } = useAudioStore.getState();
      if (repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        useAudioStore.getState().setCurrentTime(0);
      } else {
        useAudioStore.getState().next();
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    // Subscribe to external seek without causing component re-renders
    const unsub = useAudioStore.subscribe((state, prevState) => {
      if (!audio.src || state.isSeeking) return;
      if (Math.abs(state.currentTime - prevState.currentTime) > 0.5 && Math.abs(audio.currentTime - state.currentTime) > 0.5) {
        audio.currentTime = state.currentTime;
      }
    });

    return () => {
      unsub();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      audio.load();
    };
  }, []);

  // Volume synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // PlaybackRate synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Clear audio when no track
  useEffect(() => {
    if (!currentTrack && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
      prevBlobUrlRef.current = null;
    }
  }, [currentTrack]);

  // Update audio source on blobUrl change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (blobUrl && blobUrl !== prevBlobUrlRef.current) {
      audio.src = blobUrl;
      audio.load();
      prevBlobUrlRef.current = blobUrl;
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [blobUrl, isPlaying]);

  // Handle seeking / scrubbing: pause audio element while user is dragging, resume on release
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isSeeking) {
      audio.pause();
    } else {
      audio.currentTime = useAudioStore.getState().currentTime;
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    }
  }, [isSeeking, isPlaying]);

  // Play / Pause synchronization (when not seeking)
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

  // MediaSession
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
