import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useChatStore } from './useChatStore';

type AuthStep = 'welcome' | 'nickname' | 'main';

interface AuthState {
  nickname: string;
  avatarUrl: string | null;
  step: AuthStep;
  recoveryKey: string | null;
  backupEnabled: boolean;
  backupFolder: string | null;
  lastBackupTime: number | null;
  setStep: (step: AuthStep) => void;
  setNickname: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setRecoveryKey: (key: string) => void;
  setBackupConfig: (config: { enabled?: boolean; folder?: string | null; lastBackupTime?: number | null }) => void;
  deleteAccount: () => void;
}

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
      recoveryKey: null,
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
      setStep: (step) => set({ step }),
      setNickname: (nickname) => set({ nickname }),
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
      setRecoveryKey: (recoveryKey) => set({ recoveryKey }),
      setBackupConfig: (config) =>
        set((prev) => ({
          backupEnabled: config.enabled !== undefined ? config.enabled : prev.backupEnabled,
          backupFolder: config.folder !== undefined ? config.folder : prev.backupFolder,
          lastBackupTime: config.lastBackupTime !== undefined ? config.lastBackupTime : prev.lastBackupTime,
        })),
      deleteAccount: () => {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('orbita-auth-storage');
        localStorage.removeItem('orbita-chat-storage');
        useChatStore.getState().resetChats();
        set({
          nickname: '',
          avatarUrl: null,
          step: 'welcome',
          recoveryKey: null,
          backupEnabled: false,
          backupFolder: null,
          lastBackupTime: null,
        });
      },
    }),
    {
      name: 'orbita-auth-storage',
      version: 0,
      migrate: (persistedState: any) => persistedState,
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        nickname: state.nickname,
        avatarUrl: state.avatarUrl,
        step: state.step,
        recoveryKey: state.recoveryKey,
        backupEnabled: state.backupEnabled,
        backupFolder: state.backupFolder,
        lastBackupTime: state.lastBackupTime,
      }),
    }
  )
);