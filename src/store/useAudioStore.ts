import { create } from 'zustand';
import { Message, useChatStore } from './useChatStore';

export interface Track {
  id: string;
  chatId: string;
  title: string;
  artist: string;
  duration: number;
  cover: string | null;
  url: string;
  sharedSecret: string;
  mediaType?: 'audio' | 'voice';
  message?: Message;
}

function isVoiceTrack(track?: Track | null, msg?: Message | null): boolean {
  if (!track && !msg) return false;
  if (track?.mediaType === 'voice' || msg?.mediaType === 'voice') return true;
  if (track?.message?.mediaType === 'voice') return true;
  const title = track?.title || msg?.mediaName || '';
  if (title === 'Voice Message' || title === 'Голосовое сообщение' || title.startsWith('voice_')) return true;
  const url = track?.url || msg?.mediaUrl || '';
  if (url.includes('voice_')) return true;
  return false;
}

function getChatAudioTracks(chatMsgs: any[], targetChatId: string, isVoice: boolean, sharedSecret: string): Track[] {
  const list: Track[] = [];
  chatMsgs.forEach((m) => {
    if (m.mediaItems && m.mediaItems.length > 0) {
      m.mediaItems.forEach((item: any, idx: number) => {
        const itemIsVoice =
          item.type === 'voice' ||
          item.mime === 'audio/ogg' ||
          item.mime?.includes('ogg') ||
          item.mime?.includes('opus') ||
          (item.name && (/^voice_/i.test(item.name) || /\.ogg$/i.test(item.name) || /\.opus$/i.test(item.name)));

        const itemIsAudio =
          !itemIsVoice &&
          (item.type === 'audio' ||
            (item.mime && item.mime.startsWith('audio/')) ||
            (item.name && /\.(mp3|wav|flac|aac|m4a|wma|ape|alac)$/i.test(item.name)));

        if (isVoice && itemIsVoice) {
          list.push({
            id: `${m.id || m.time}_audio_${idx}`,
            chatId: targetChatId,
            title: item.name?.replace(/\.[^.]+$/, '') || 'Voice Message',
            artist: m.sender || '',
            duration: item.duration || 0,
            cover: null,
            url: item.url,
            sharedSecret: item.key || m.mediaKey || sharedSecret,
            mediaType: 'voice',
            message: m,
          });
        } else if (!isVoice && itemIsAudio) {
          list.push({
            id: `${m.id || m.time}_audio_${idx}`,
            chatId: targetChatId,
            title: item.audioMetadata?.title || item.name?.replace(/\.[^.]+$/, '') || 'Audio',
            artist: item.audioMetadata?.artist || '',
            duration: item.audioMetadata?.duration || item.duration || 0,
            cover: item.audioMetadata?.cover || null,
            url: item.url,
            sharedSecret: item.key || m.mediaKey || sharedSecret,
            mediaType: 'audio',
            message: m,
          });
        }
      });
    } else if (m.mediaUrl) {
      const msgIsVoice =
        m.mediaType === 'voice' ||
        m.audioMetadata?.title === 'Voice Message' ||
        m.audioMetadata?.title === 'Голосовое сообщение' ||
        m.mediaName?.startsWith('voice_') ||
        m.mediaUrl?.includes('voice_');

      if (isVoice && msgIsVoice) {
        list.push({
          id: m.id!,
          chatId: targetChatId,
          title: m.audioMetadata?.title || m.mediaName?.replace(/\.[^.]+$/, '') || 'Voice Message',
          artist: m.sender || '',
          duration: m.audioMetadata?.duration || m.duration || 0,
          cover: null,
          url: m.mediaUrl,
          sharedSecret: m.mediaKey || sharedSecret,
          mediaType: 'voice',
          message: m,
        });
      } else if (!isVoice && !msgIsVoice && m.mediaType === 'audio') {
        list.push({
          id: m.id!,
          chatId: targetChatId,
          title: m.audioMetadata?.title || m.mediaName?.replace(/\.[^.]+$/, '') || 'Audio',
          artist: m.audioMetadata?.artist || '',
          duration: m.audioMetadata?.duration || m.duration || 0,
          cover: m.audioMetadata?.cover || null,
          url: m.mediaUrl,
          sharedSecret: m.mediaKey || sharedSecret,
          mediaType: 'audio',
          message: m,
        });
      }
    }
  });
  return list;
}

export type RepeatMode = 'none' | 'one' | 'all';

interface AudioStore {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  repeat: RepeatMode;
  shuffle: boolean;
  isSeeking: boolean;
  playbackRate: number;
  isReverseOrder: boolean;
  getLiveTime?: () => number;

  setTrack: (track: Track | null) => void;
  play: (track?: Track) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setSeeking: (seeking: boolean) => void;
  setCurrentTime: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setDuration: (duration: number) => void;
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
  next: () => void;
  previous: () => void;
  clearQueue: () => void;
  removeFromQueue: (index: number) => void;
  setRepeat: (mode: RepeatMode) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  toggleReverseOrder: () => void;
  reset: () => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  queue: [],
  repeat: 'none',
  shuffle: false,
  isSeeking: false,
  playbackRate: 1.0,
  isReverseOrder: false,
  getLiveTime: undefined,

  setTrack: (track) => {
    set({
      currentTrack: track,
      isPlaying: track !== null,
      currentTime: 0,
      duration: track?.duration || 0,
    });
  },

  play: (track) => {
    if (track) {
      set({
        currentTrack: track,
        isPlaying: true,
        currentTime: 0,
        duration: track.duration,
      });
    } else {
      set({ isPlaying: true });
    }
  },

  pause: () => set({ isPlaying: false }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setSeeking: (seeking) => set({ isSeeking: seeking }),

  setCurrentTime: (time) => {
    if (!get().isSeeking) {
      set({ currentTime: time });
    }
  },

  seek: (time) => {
    const state = get();
    const clamped = Math.max(0, Math.min(time, state.duration || 0));
    set({ currentTime: clamped });
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(volume, 1));
    set({ volume: clamped });
  },

  setPlaybackRate: (rate) => {
    const clamped = Math.max(0.5, Math.min(rate, 2.5));
    set({ playbackRate: clamped });
  },

  setDuration: (duration) => set({ duration }),

  setQueue: (tracks) => set({ queue: tracks }),

  addToQueue: (track) => {
    const state = get();
    const trackIsVoice = isVoiceTrack(track);
    const existingIndex = state.queue.findIndex((t) => t.id === track.id);
    let newQueue: Track[];

    const sameTypeQueue = state.queue.filter((t) => isVoiceTrack(t) === trackIsVoice);

    if (existingIndex !== -1) {
      newQueue = [...sameTypeQueue];
    } else {
      newQueue = [...sameTypeQueue, track];
    }

    set({
      queue: newQueue,
      currentTrack: track,
      isPlaying: true,
      currentTime: 0,
      duration: track.duration,
    });
  },

  next: () => {
    const state = get();
    const { currentTrack, repeat, shuffle, isReverseOrder } = state;
    if (!currentTrack) return;

    if (repeat === 'one') {
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    const isVoice = isVoiceTrack(currentTrack);

    let queue = state.queue.filter((t) => isVoiceTrack(t) === isVoice);
    const targetChatId = currentTrack.chatId || useChatStore.getState().activeChatId || '';

    if (queue.length <= 1 && targetChatId) {
      const chatMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
      const discovered = getChatAudioTracks(chatMsgs, targetChatId, isVoice, currentTrack.sharedSecret || '');
      if (discovered.length > 1) {
        queue = discovered;
        set({ queue });
      }
    }

    if (queue.length === 0) {
      set({ isPlaying: false, currentTime: 0 });
      return;
    }

    let currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) {
      const nextTrack = isReverseOrder ? queue[queue.length - 1] : queue[0];
      if (nextTrack) {
        set({
          currentTrack: nextTrack,
          isPlaying: true,
          currentTime: 0,
          duration: nextTrack.duration,
        });
      } else {
        set({ isPlaying: false, currentTime: 0 });
      }
      return;
    }

    if (shuffle) {
      const available = queue.filter((_, i) => i !== currentIndex);
      if (available.length === 0) {
        set({ isPlaying: false, currentTime: 0 });
        return;
      }
      const randomTrack = available[Math.floor(Math.random() * available.length)];
      set({
        currentTrack: randomTrack,
        isPlaying: true,
        currentTime: 0,
        duration: randomTrack.duration,
      });
      return;
    }

    let nextIndex = isReverseOrder ? currentIndex - 1 : currentIndex + 1;

    if (isReverseOrder) {
      if (nextIndex < 0) {
        nextIndex = queue.length - 1;
      }
    } else {
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0;
        } else {
          set({ isPlaying: false, currentTime: 0 });
          return;
        }
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      set({
        currentTrack: nextTrack,
        isPlaying: true,
        currentTime: 0,
        duration: nextTrack.duration,
      });
    } else {
      set({ isPlaying: false, currentTime: 0 });
    }
  },

  previous: () => {
    const state = get();
    const { currentTrack, repeat, shuffle, isReverseOrder } = state;
    if (!currentTrack) return;

    if (repeat === 'one') {
      set({ currentTime: 0, isPlaying: true });
      return;
    }

    const isVoice = isVoiceTrack(currentTrack);

    let queue = state.queue.filter((t) => isVoiceTrack(t) === isVoice);
    const targetChatId = currentTrack.chatId || useChatStore.getState().activeChatId || '';

    if (queue.length <= 1 && targetChatId) {
      const chatMsgs = useChatStore.getState().messagesByChatId[targetChatId] || [];
      const discovered = getChatAudioTracks(chatMsgs, targetChatId, isVoice, currentTrack.sharedSecret || '');
      if (discovered.length > 1) {
        queue = discovered;
        set({ queue });
      }
    }

    let currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex === -1) {
      const prevTrack = isReverseOrder ? queue[0] : queue[queue.length - 1];
      if (prevTrack) {
        set({
          currentTrack: prevTrack,
          isPlaying: true,
          currentTime: 0,
          duration: prevTrack.duration,
        });
      }
      return;
    }

    if (shuffle) {
      const available = queue.filter((_, i) => i !== currentIndex);
      if (available.length === 0) {
        set({ isPlaying: false, currentTime: 0 });
        return;
      }
      const randomTrack = available[Math.floor(Math.random() * available.length)];
      set({
        currentTrack: randomTrack,
        isPlaying: true,
        currentTime: 0,
        duration: randomTrack.duration,
      });
      return;
    }

    let prevIndex = isReverseOrder ? currentIndex + 1 : currentIndex - 1;

    if (isReverseOrder) {
      if (prevIndex >= queue.length) {
        prevIndex = 0;
      }
    } else {
      if (prevIndex < 0) {
        if (repeat === 'all') {
          prevIndex = queue.length - 1;
        } else {
          set({ isPlaying: false, currentTime: 0 });
          return;
        }
      }
    }

    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      set({
        currentTrack: prevTrack,
        isPlaying: true,
        currentTime: 0,
        duration: prevTrack.duration,
      });
    } else {
      set({ isPlaying: false, currentTime: 0 });
    }
  },

  clearQueue: () => {
    set({
      queue: [],
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    });
  },

  removeFromQueue: (index) => {
    const state = get();
    const newQueue = [...state.queue];
    const removed = newQueue.splice(index, 1)[0];
    if (!removed) return;

    if (state.currentTrack && removed.id === state.currentTrack.id) {
      set({ isPlaying: false });
      if (newQueue.length > 0) {
        const nextIndex = Math.min(index, newQueue.length - 1);
        const nextTrack = newQueue[nextIndex];
        if (nextTrack) {
          set({
            currentTrack: nextTrack,
            isPlaying: true,
            currentTime: 0,
            duration: nextTrack.duration,
          });
        }
      } else {
        set({ currentTrack: null, duration: 0 });
      }
    }

    set({ queue: newQueue });
  },

  setRepeat: (mode) => set({ repeat: mode }),

  toggleRepeat: () => {
    const current = get().repeat;
    const next: RepeatMode = current === 'none' ? 'all' : current === 'all' ? 'one' : 'none';
    set({ repeat: next });
  },

  toggleShuffle: () => {
    const nextShuffle = !get().shuffle;
    set({ shuffle: nextShuffle, isReverseOrder: nextShuffle ? false : get().isReverseOrder });
  },

  toggleReverseOrder: () => {
    const nextReverse = !get().isReverseOrder;
    set({ isReverseOrder: nextReverse, shuffle: nextReverse ? false : get().shuffle });
  },

  reset: () => {
    set({
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      queue: [],
      repeat: 'none',
      shuffle: false,
      playbackRate: 1.0,
      isReverseOrder: false,
    });
  },
}));