import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useChatStore } from './useChatStore';

type AuthStep = 'welcome' | 'nickname' | 'main';

interface AuthState {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  step: AuthStep;
  recoveryKey: string | null;
  backupEnabled: boolean;
  backupFolder: string | null;
  lastBackupTime: number | null;
  setUserId: (id: string) => void;
  setStep: (step: AuthStep) => void;
  setNickname: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setRecoveryKey: (key: string) => void;
  setBackupConfig: (config: { enabled?: boolean; folder?: string | null; lastBackupTime?: number | null }) => void;
  deleteAccount: () => void;
}

const getInitialUserId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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
    (set, get) => ({
      userId: getInitialUserId(),
      nickname: '',
      avatarUrl: null,
      step: 'welcome',
      recoveryKey: null,
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
      setUserId: (userId) => set({ userId }),
      setStep: (step) => set({ step }),
      setNickname: (nickname) => {
        set({ nickname });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { nickname });
        }
      },
      setAvatarUrl: (avatarUrl) => {
        set({ avatarUrl });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { avatarUrl });
        }
      },
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
          userId: getInitialUserId(),
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
      version: 1,
      migrate: (persistedState: any) => {
        if (persistedState && !persistedState.userId) {
          persistedState.userId = getInitialUserId();
        }
        return persistedState;
      },
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        userId: state.userId,
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