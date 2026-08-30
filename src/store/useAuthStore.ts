// src/store/useAuthStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useChatStore } from './useChatStore';

type AuthStep = 'welcome' | 'nickname' | 'main';

interface AuthState {
  nickname: string;
  avatarUrl: string | null;
  step: AuthStep;
  setStep: (step: AuthStep) => void;
  setNickname: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  deleteAccount: () => void;
}

// Кастомный storage через IPC с fallback на localStorage
const ipcStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    if ((window as any).orbita?.storageGet) {
      return await (window as any).orbita.storageGet(name);
    }
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if ((window as any).orbita?.storageSet) {
      await (window as any).orbita.storageSet(name, value);
    } else {
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if ((window as any).orbita?.storageRemove) {
      await (window as any).orbita.storageRemove(name);
    } else {
      localStorage.removeItem(name);
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      nickname: '',
      avatarUrl: null,
      step: 'welcome',
      setStep: (step) => set({ step }),
      setNickname: (nickname) => set({ nickname }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      deleteAccount: () => {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('orbita-auth-storage');
        localStorage.removeItem('orbita-chat-storage');
        useChatStore.getState().resetChats();
        set({ nickname: '', avatarUrl: null, step: 'welcome' });
      },
    }),
    {
      name: 'orbita-auth-storage',
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        nickname: state.nickname,
        avatarUrl: state.avatarUrl,
        step: state.step,
      }),
    }
  )
);