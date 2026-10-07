import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { useChatStore } from './useChatStore';

type AuthStep = 'welcome' | 'nickname' | 'main';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthState {
  userId: string;
  numericId: string;
  nickname: string;
  avatarUrl: string | null;
  username: string | null;
  bio: string | null;
  birthday: string | null;
  step: AuthStep;
  recoveryKey: string | null;
  masterSeed: string | null;
  configVersion: number;
  lastSyncTime: number | null;
  syncStatus: CloudSyncStatus;
  backupEnabled: boolean;
  backupFolder: string | null;
  lastBackupTime: number | null;
  identityKeyPair: { publicKey: string; privateKey: string } | null;
  signedPreKeyPair: { publicKey: string; privateKey: string } | null;
  identitySigningKeyPair: { publicKey: string; privateKey: string } | null;
  oneTimePreKeys: Array<{ id: string; keyId: number; publicKey: string; privateKey: string }>;
  setUserId: (id: string) => void;
  setNumericId: (numericId: string) => void;
  setStep: (step: AuthStep) => void;
  setNickname: (name: string) => void;
  setAvatarUrl: (url: string | null) => void;
  setUsername: (username: string | null) => void;
  setBio: (bio: string | null) => void;
  setBirthday: (birthday: string | null) => void;
  setRecoveryKey: (key: string) => void;
  setMasterSeed: (seed: string | null) => void;
  setConfigVersion: (version: number) => void;
  setSyncStatus: (status: CloudSyncStatus, lastSyncTime?: number | null) => void;
  setBackupConfig: (config: { enabled?: boolean; folder?: string | null; lastBackupTime?: number | null }) => void;
  setIdentityKeys: (keys: {
    identityKeyPair: { publicKey: string; privateKey: string };
    signedPreKeyPair: { publicKey: string; privateKey: string };
    identitySigningKeyPair: { publicKey: string; privateKey: string };
    oneTimePreKeys: Array<{ id: string; keyId: number; publicKey: string; privateKey: string }>;
  }) => void;
  consumeOneTimePreKey: (id: string) => void;
  deleteAccount: () => void;
  exportAuthState: () => any;
  importAuthState: (data: any) => void;
}

export const getInitialNumericId = (seed?: string): string => {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    const positive = Math.abs(hash);
    const id = 10000000000 + (positive % 90000000000);
    return id.toString();
  }
  const first = Math.floor(Math.random() * 9) + 1;
  let rest = '';
  for (let i = 0; i < 10; i++) {
    rest += Math.floor(Math.random() * 10).toString();
  }
  return `${first}${rest}`;
};

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
      numericId: '',
      nickname: '',
      avatarUrl: null,
      username: null,
      bio: null,
      birthday: null,
      step: 'welcome',
      recoveryKey: null,
      masterSeed: null,
      configVersion: 0,
      lastSyncTime: null,
      syncStatus: 'idle',
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
      identityKeyPair: null,
      signedPreKeyPair: null,
      identitySigningKeyPair: null,
      oneTimePreKeys: [],
      setUserId: (userId) => set({ userId }),
      setNumericId: (numericId) => set({ numericId }),
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
      setUsername: (username) => {
        set({ username });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { username });
        }
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => m.useAccountStore.getState().syncCurrentAccountMeta()).catch(() => {});
        }
      },
      setBio: (bio) => {
        set({ bio });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { bio });
        }
        if (typeof window !== 'undefined') {
          import('../services/accountManager').then((m) => m.useAccountStore.getState().syncCurrentAccountMeta()).catch(() => {});
        }
      },
      setBirthday: (birthday) => {
        set({ birthday });
        const uid = get().userId;
        if (uid) {
          useChatStore.getState().setUserProfile(uid, { birthday });
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
      setIdentityKeys: (keys) => set({ ...keys }),
      consumeOneTimePreKey: (id) =>
        set((prev) => ({
          oneTimePreKeys: prev.oneTimePreKeys.filter((k) => k.id !== id),
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
            const newUid = getInitialUserId();
            set({
              userId: newUid,
              numericId: getInitialNumericId(newUid),
              nickname: '',
              avatarUrl: null,
              username: null,
              bio: null,
              birthday: null,
              step: 'welcome',
              recoveryKey: null,
              masterSeed: null,
              configVersion: 0,
              lastSyncTime: null,
              syncStatus: 'idle',
              backupEnabled: false,
              backupFolder: null,
              lastBackupTime: null,
              identityKeyPair: null,
              signedPreKeyPair: null,
              identitySigningKeyPair: null,
              oneTimePreKeys: [],
            });
          });
        }
      },
      exportAuthState: () => ({
        userId: get().userId,
        numericId: get().numericId || getInitialNumericId(get().userId),
        nickname: get().nickname,
        avatarUrl: get().avatarUrl,
        username: get().username,
        bio: get().bio,
        birthday: get().birthday,
        step: get().step,
        recoveryKey: get().recoveryKey,
        masterSeed: get().masterSeed,
        configVersion: get().configVersion,
        lastSyncTime: get().lastSyncTime,
        syncStatus: get().syncStatus,
        backupEnabled: get().backupEnabled,
        backupFolder: get().backupFolder,
        lastBackupTime: get().lastBackupTime,
        identityKeyPair: get().identityKeyPair,
        signedPreKeyPair: get().signedPreKeyPair,
        identitySigningKeyPair: get().identitySigningKeyPair,
        oneTimePreKeys: get().oneTimePreKeys,
      }),
      importAuthState: (data: any) => {
        const uid = data?.userId || getInitialUserId();
        set({
          userId: uid,
          numericId: data?.numericId || getInitialNumericId(uid),
          nickname: data?.nickname || '',
          avatarUrl: data?.avatarUrl || null,
          username: data?.username || null,
          bio: data?.bio || null,
          birthday: data?.birthday || null,
          step: data?.step || 'welcome',
          recoveryKey: data?.recoveryKey || null,
          masterSeed: data?.masterSeed || null,
          configVersion: data?.configVersion || 0,
          lastSyncTime: data?.lastSyncTime || null,
          syncStatus: data?.syncStatus || 'idle',
          backupEnabled: data?.backupEnabled || false,
          backupFolder: data?.backupFolder || null,
          lastBackupTime: data?.lastBackupTime || null,
          identityKeyPair: data?.identityKeyPair || null,
          signedPreKeyPair: data?.signedPreKeyPair || null,
          identitySigningKeyPair: data?.identitySigningKeyPair || null,
          oneTimePreKeys: data?.oneTimePreKeys || [],
        });
      },
    }),
    {
      name: 'orbita-auth-storage',
      version: 2,
      migrate: (persistedState: any) => {
        if (persistedState && !persistedState.userId) {
          persistedState.userId = getInitialUserId();
        }
        if (persistedState && !persistedState.numericId) {
          persistedState.numericId = getInitialNumericId(persistedState.userId);
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state && !state.numericId && state.userId) {
          const generated = getInitialNumericId(state.userId);
          state.numericId = generated;
          state.setNumericId(generated);
        }
      },
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        userId: state.userId,
        numericId: state.numericId || getInitialNumericId(state.userId),
        nickname: state.nickname,
        avatarUrl: state.avatarUrl,
        username: state.username,
        bio: state.bio,
        birthday: state.birthday,
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