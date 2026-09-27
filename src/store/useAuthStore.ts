import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useChatStore } from './useChatStore';

type AuthStep = 'welcome' | 'nickname' | 'main';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthState {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  step: AuthStep;
  recoveryKey: string | null;
  masterSeed: string | null;
  configVersion: number;
  lastSyncTime: number | null;
  syncStatus: CloudSyncStatus;
  backupEnabled: boolean;
  backupFolder: string | null;
  lastBackupTime: number | null;
  setUserId: (id: string) => void;
  setStep: (step: AuthStep) => void;
  setNickname: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setRecoveryKey: (key: string) => void;
  setMasterSeed: (seed: string | null) => void;
  setConfigVersion: (version: number) => void;
  setSyncStatus: (status: CloudSyncStatus, lastSyncTime?: number | null) => void;
  setBackupConfig: (config: { enabled?: boolean; folder?: string | null; lastBackupTime?: number | null }) => void;
  deleteAccount: () => void;
  exportAuthState: () => any;
  importAuthState: (data: any) => void;
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

const lastSavedAuthValues: Record<string, string> = {};

const isBlankAuthState = (jsonStr: string): boolean => {
  try {
    const data = JSON.parse(jsonStr);
    const s = data?.state || data;
    return Boolean(!s?.nickname && (!s?.userId || s?.userId.length === 0) && s?.step === 'welcome');
  } catch {
    return false;
  }
};

const hasExistingAccount = (jsonStr: string | null | undefined): boolean => {
  if (!jsonStr) return false;
  try {
    const data = JSON.parse(jsonStr);
    const s = data?.state || data;
    return Boolean(s?.nickname || (s?.step === 'main' && s?.userId));
  } catch {
    return false;
  }
};

const ipcStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    let val: string | null = null;
    if ((window as any).orbita?.storageGet) {
      try {
        val = await (window as any).orbita.storageGet(name);
      } catch {}
    }
    const localVal = localStorage.getItem(name);
    if (!val || (!hasExistingAccount(val) && hasExistingAccount(localVal))) {
      val = localVal;
      if (val && (window as any).orbita?.storageSet) {
        (window as any).orbita.storageSet(name, val).catch(() => {});
      }
    }
    if (val && !localVal) {
      try {
        localStorage.setItem(name, val);
      } catch {}
    }
    if (val !== null) lastSavedAuthValues[name] = val;
    return val;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if (lastSavedAuthValues[name] === value) return;

    const previousSaved = lastSavedAuthValues[name] || localStorage.getItem(name);
    if (hasExistingAccount(previousSaved) && isBlankAuthState(value)) {
      return;
    }

    lastSavedAuthValues[name] = value;
    try {
      localStorage.setItem(name, value);
    } catch {}

    if ((window as any).orbita?.storageSet) {
      try {
        await (window as any).orbita.storageSet(name, value);
      } catch {}
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    delete lastSavedAuthValues[name];
    try {
      localStorage.removeItem(name);
    } catch {}
    if ((window as any).orbita?.storageRemove) {
      try {
        await (window as any).orbita.storageRemove(name);
      } catch {}
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: '',
      nickname: '',
      avatarUrl: null,
      step: 'welcome',
      recoveryKey: null,
      masterSeed: null,
      configVersion: 0,
      lastSyncTime: null,
      syncStatus: 'idle',
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
      setUserId: (userId) => set({ userId }),
      setStep: (step) => {
        set({ step });
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => {
            const accStore = m.useAccountStore.getState();
            if (accStore.activeAccountId === 'account_2' && step === 'main') {
              accStore.completeSecondAccountRegistration();
            } else {
              accStore.syncCurrentAccountMeta();
            }
          }).catch(() => {});
        }
      },
      setNickname: (nickname) => {
        set({ nickname });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { nickname });
        }
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => m.useAccountStore.getState().syncCurrentAccountMeta()).catch(() => {});
        }
      },
      setAvatarUrl: (avatarUrl) => {
        set({ avatarUrl });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { avatarUrl });
        }
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => m.useAccountStore.getState().syncCurrentAccountMeta()).catch(() => {});
        }
      },
      setRecoveryKey: (recoveryKey) => set({ recoveryKey }),
      setMasterSeed: (masterSeed) => set({ masterSeed }),
      setConfigVersion: (configVersion) => set({ configVersion }),
      setSyncStatus: (syncStatus, lastSyncTime) =>
        set((prev) => ({
          syncStatus,
          lastSyncTime: lastSyncTime !== undefined ? lastSyncTime : prev.lastSyncTime,
        })),
      setBackupConfig: (config) =>
        set((prev) => ({
          backupEnabled: config.enabled !== undefined ? config.enabled : prev.backupEnabled,
          backupFolder: config.folder !== undefined ? config.folder : prev.backupFolder,
          lastBackupTime: config.lastBackupTime !== undefined ? config.lastBackupTime : prev.lastBackupTime,
        })),
      deleteAccount: () => {
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => {
            m.useAccountStore.getState().deleteCurrentAccount();
          }).catch(() => {
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
              masterSeed: null,
              configVersion: 0,
              lastSyncTime: null,
              syncStatus: 'idle',
              backupEnabled: false,
              backupFolder: null,
              lastBackupTime: null,
            });
          });
        }
      },
      exportAuthState: () => ({
        userId: get().userId,
        nickname: get().nickname,
        avatarUrl: get().avatarUrl,
        step: get().step,
        recoveryKey: get().recoveryKey,
        masterSeed: get().masterSeed,
        configVersion: get().configVersion,
        lastSyncTime: get().lastSyncTime,
        syncStatus: get().syncStatus,
        backupEnabled: get().backupEnabled,
        backupFolder: get().backupFolder,
        lastBackupTime: get().lastBackupTime,
      }),
      importAuthState: (data: any) => {
        set({
          userId: data?.userId || getInitialUserId(),
          nickname: data?.nickname || '',
          avatarUrl: data?.avatarUrl || null,
          step: data?.step || 'welcome',
          recoveryKey: data?.recoveryKey || null,
          masterSeed: data?.masterSeed || null,
          configVersion: data?.configVersion || 0,
          lastSyncTime: data?.lastSyncTime || null,
          syncStatus: data?.syncStatus || 'idle',
          backupEnabled: data?.backupEnabled || false,
          backupFolder: data?.backupFolder || null,
          lastBackupTime: data?.lastBackupTime || null,
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
        masterSeed: state.masterSeed,
        configVersion: state.configVersion,
        lastSyncTime: state.lastSyncTime,
        syncStatus: state.syncStatus,
        backupEnabled: state.backupEnabled,
        backupFolder: state.backupFolder,
        lastBackupTime: state.lastBackupTime,
      }),
    }
  )
);