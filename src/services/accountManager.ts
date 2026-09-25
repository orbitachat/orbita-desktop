import { create } from 'zustand';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { ablyService } from './ablyService';
import { generateRandomCode } from '../lib/codes';
import { generateMasterSeedHex, deriveAccountKeys } from '../lib/zkAccountCrypto';

export interface AccountMeta {
  id: 'account_1' | 'account_2';
  nickname: string;
  avatarUrl: string | null;
  myCode: string | null;
  userId: string;
  isRegistered: boolean;
}

interface AccountRegistryData {
  activeAccountId: 'account_1' | 'account_2';
  accounts: AccountMeta[];
}

const REGISTRY_STORAGE_KEY = 'orbita-accounts-registry';
const AUTH_STORAGE_PREFIX = 'orbita-auth-storage_';
const CHAT_STORAGE_PREFIX = 'orbita-chat-storage_';

const storageGet = async (key: string): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  if ((window as any).orbita?.storageGet) {
    try {
      const val = await (window as any).orbita.storageGet(key);
      if (val !== null && val !== undefined) return val;
    } catch {}
  }
  return localStorage.getItem(key);
};

const storageSet = async (key: string, value: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  if ((window as any).orbita?.storageSet) {
    try {
      await (window as any).orbita.storageSet(key, value);
    } catch {}
  }
  try {
    localStorage.setItem(key, value);
  } catch {}
};

const storageRemove = async (key: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  if ((window as any).orbita?.storageRemove) {
    try {
      await (window as any).orbita.storageRemove(key);
    } catch {}
  }
  try {
    localStorage.removeItem(key);
  } catch {}
};

const syncActiveAccountScope = (accountId: 'account_1' | 'account_2') => {
  if (typeof window === 'undefined') return;
  try {
    (window as any).orbita?.setActiveAccountScope?.(accountId);
  } catch {}
};

if (typeof window !== 'undefined') {
  syncActiveAccountScope('account_1');
}

interface AccountStoreState {
  activeAccountId: 'account_1' | 'account_2';
  accounts: AccountMeta[];
  isSwitching: boolean;
  isAddingSecondAccount: boolean;
  init: () => Promise<void>;
  switchAccount: (targetId: 'account_1' | 'account_2') => Promise<void>;
  prepareAddSecondAccount: () => Promise<void>;
  cancelAddSecondAccount: () => Promise<void>;
  prepareSecondAccountForRestore: () => Promise<void>;
  finalizeSecondAccountRestore: () => Promise<void>;
  completeSecondAccountRegistration: (data?: { nickname: string; avatarUrl?: string | null; myCode?: string | null }) => Promise<void>;
  deleteCurrentAccount: () => Promise<void>;
  syncCurrentAccountMeta: () => Promise<void>;
}

let isInitialized = false;

export const useAccountStore = create<AccountStoreState>((set, get) => ({
  activeAccountId: 'account_1',
  accounts: [],
  isSwitching: false,
  isAddingSecondAccount: false,

  init: async () => {
    syncActiveAccountScope('account_1');
    if (isInitialized) return;
    isInitialized = true;

    let registry: AccountRegistryData = {
      activeAccountId: 'account_1',
      accounts: [],
    };

    try {
      const raw = await storageGet(REGISTRY_STORAGE_KEY);
      if (raw) {
        registry = JSON.parse(raw);
      }
    } catch {}

    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    let account1 = registry.accounts.find((a) => a.id === 'account_1');
    const account2 = registry.accounts.find((a) => a.id === 'account_2');

    if (!account1) {
      account1 = {
        id: 'account_1',
        nickname: auth.nickname || '',
        avatarUrl: auth.avatarUrl || null,
        myCode: chat.myCode || null,
        userId: auth.userId || '',
        isRegistered: Boolean(auth.nickname && auth.step === 'main'),
      };
      registry.accounts = [account1, ...(account2 ? [account2] : [])];
    } else if (auth.nickname && auth.step === 'main') {
      account1.nickname = auth.nickname;
      account1.avatarUrl = auth.avatarUrl;
      account1.myCode = chat.myCode || account1.myCode;
      account1.userId = auth.userId || account1.userId;
      account1.isRegistered = true;
    }

    registry.activeAccountId = 'account_1';
    await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

    const account1AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`);
    const account1ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`);

    if (account1AuthRaw) {
      try {
        const parsed = JSON.parse(account1AuthRaw);
        auth.importAuthState(parsed);
      } catch {}
    } else {
      await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(auth.exportAuthState()));
    }

    if (account1ChatRaw) {
      try {
        const parsed = JSON.parse(account1ChatRaw);
        chat.importChatState(parsed);
      } catch {}
    } else {
      await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(chat.exportChatState()));
    }

    set({
      activeAccountId: 'account_1',
      accounts: registry.accounts,
      isSwitching: false,
    });
  },

  syncCurrentAccountMeta: async () => {
    const { activeAccountId, accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const currentAccount = accounts.find((a) => a.id === activeAccountId);
    if (!currentAccount) return;

    let changed = false;
    if (auth.nickname && currentAccount.nickname !== auth.nickname) {
      currentAccount.nickname = auth.nickname;
      changed = true;
    }
    if (currentAccount.avatarUrl !== auth.avatarUrl) {
      currentAccount.avatarUrl = auth.avatarUrl;
      changed = true;
    }
    if (chat.myCode && currentAccount.myCode !== chat.myCode) {
      currentAccount.myCode = chat.myCode;
      changed = true;
    }
    if (auth.userId && currentAccount.userId !== auth.userId) {
      currentAccount.userId = auth.userId;
      changed = true;
    }
    if (auth.step === 'main' && !currentAccount.isRegistered) {
      currentAccount.isRegistered = true;
      changed = true;
    }

    if (changed) {
      const updatedAccounts = accounts.map((a) => (a.id === activeAccountId ? { ...currentAccount } : a));
      set({ accounts: updatedAccounts });
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify({ activeAccountId, accounts: updatedAccounts }));
    }

    await storageSet(`${AUTH_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(auth.exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(chat.exportChatState()));
    if (activeAccountId === 'account_1') {
      await storageSet('orbita-auth-storage', JSON.stringify({ state: auth.exportAuthState(), version: 1 }));
      await storageSet('orbita-chat-storage', JSON.stringify({ state: chat.exportChatState(), version: 0 }));
    }
  },

  switchAccount: async (targetId: 'account_1' | 'account_2') => {
    const { activeAccountId, accounts, isSwitching } = get();
    if (isSwitching || activeAccountId === targetId) return;

    set({ isSwitching: true });

    try {
      const auth = useAuthStore.getState();
      const chat = useChatStore.getState();

      const currentAuthData = auth.exportAuthState();
      const currentChatData = chat.exportChatState();

      await storageSet(`${AUTH_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(currentAuthData));
      await storageSet(`${CHAT_STORAGE_PREFIX}${activeAccountId}`, JSON.stringify(currentChatData));

      if (activeAccountId === 'account_1') {
        await storageSet('orbita-auth-storage', JSON.stringify({ state: currentAuthData, version: 1 }));
        await storageSet('orbita-chat-storage', JSON.stringify({ state: currentChatData, version: 0 }));
      }

      const activeClientId = chat.myCode || auth.userId;
      if (activeClientId) {
        ablyService.setOffline(activeClientId);
      }
      ablyService.disconnect();

      const targetAuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}${targetId}`);
      const targetChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}${targetId}`);

      if (targetAuthRaw) {
        try {
          auth.importAuthState(JSON.parse(targetAuthRaw));
        } catch {}
      }

      if (targetChatRaw) {
        try {
          chat.importChatState(JSON.parse(targetChatRaw));
        } catch {}
      } else {
        chat.resetChats();
      }

      const updatedRegistry: AccountRegistryData = {
        activeAccountId: targetId,
        accounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(updatedRegistry));

      set({
        activeAccountId: targetId,
        isSwitching: false,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope(targetId);
    } catch {
      set({ isSwitching: false });
    }
  },

  prepareAddSecondAccount: async () => {
    const { isSwitching } = get();
    if (isSwitching) return;
    set({ isAddingSecondAccount: true });
  },

  cancelAddSecondAccount: async () => {
    set({ isAddingSecondAccount: false, isSwitching: false });
  },

  prepareSecondAccountForRestore: async () => {
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();
    const currentAuthData = auth.exportAuthState();
    const currentChatData = chat.exportChatState();
    await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(currentAuthData));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(currentChatData));
    const activeClientId = chat.myCode || auth.userId;
    if (activeClientId) {
      ablyService.setOffline(activeClientId);
    }
    ablyService.disconnect();
    useChatStore.setState({
      chats: [],
      messagesByChatId: {},
      usersById: {},
      pinnedChatIds: [],
      deletedChatIds: [],
      deletedChatSessions: {},
      incomingFriendRequests: [],
      activeChatId: null,
      activeProfileChatId: null,
      myCode: '',
    });
    syncActiveAccountScope('account_2');
  },

  finalizeSecondAccountRestore: async () => {
    const { accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    let account1 = accounts.find((a) => a.id === 'account_1');
    if (!account1) {
      const raw1 = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`);
      if (raw1) {
        try {
          const parsed = JSON.parse(raw1);
          account1 = {
            id: 'account_1',
            nickname: parsed.nickname || 'User',
            avatarUrl: parsed.avatarUrl || null,
            myCode: null,
            userId: parsed.userId || '',
            isRegistered: true,
          };
        } catch {}
      }
    }

    const account2: AccountMeta = {
      id: 'account_2',
      nickname: auth.nickname || 'User',
      avatarUrl: auth.avatarUrl || null,
      myCode: chat.myCode || null,
      userId: auth.userId || '',
      isRegistered: true,
    };

    const updatedAccounts = [account1!, account2];
    const registry: AccountRegistryData = {
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
    };

    await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
    await storageSet(`${AUTH_STORAGE_PREFIX}account_2`, JSON.stringify(auth.exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_2`, JSON.stringify(chat.exportChatState()));

    set({
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
      isAddingSecondAccount: false,
      isSwitching: false,
    });
    syncActiveAccountScope('account_2');

    const client = chat.myCode || auth.userId;
    if (client) {
      ablyService.connect(client).catch(() => {});
    }
  },

  completeSecondAccountRegistration: async (data) => {
    const { accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const currentAuthData = auth.exportAuthState();
    const currentChatData = chat.exportChatState();

    await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, JSON.stringify(currentAuthData));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, JSON.stringify(currentChatData));

    const activeClientId = chat.myCode || auth.userId;
    if (activeClientId) {
      ablyService.setOffline(activeClientId);
    }
    ablyService.disconnect();

    const newSeed = generateMasterSeedHex();
    const derived = deriveAccountKeys(newSeed);
    const newCode = data?.myCode || generateRandomCode();
    const newUserId = derived.userId;
    const nick = data?.nickname || 'User';
    const avatar = data?.avatarUrl || null;

    useChatStore.setState({
      chats: [],
      messagesByChatId: {},
      usersById: {},
      pinnedChatIds: [],
      deletedChatIds: [],
      deletedChatSessions: {},
      incomingFriendRequests: [],
      activeChatId: null,
      activeProfileChatId: null,
      myCode: newCode,
    });

    auth.importAuthState({
      userId: newUserId,
      nickname: nick,
      avatarUrl: avatar,
      step: 'main',
      recoveryKey: null,
      masterSeed: newSeed,
      configVersion: 0,
      lastSyncTime: null,
      syncStatus: 'idle',
      backupEnabled: false,
      backupFolder: null,
      lastBackupTime: null,
    });

    const account1: AccountMeta = accounts.find((a) => a.id === 'account_1') || {
      id: 'account_1',
      nickname: currentAuthData.nickname || 'User',
      avatarUrl: currentAuthData.avatarUrl || null,
      myCode: currentChatData.myCode || null,
      userId: currentAuthData.userId || '',
      isRegistered: true,
    };

    const account2: AccountMeta = {
      id: 'account_2',
      nickname: nick,
      avatarUrl: avatar,
      myCode: newCode,
      userId: newUserId,
      isRegistered: true,
    };

    const updatedAccounts = [account1, account2];
    const registry: AccountRegistryData = {
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
    };

    await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));
    await storageSet(`${AUTH_STORAGE_PREFIX}account_2`, JSON.stringify(useAuthStore.getState().exportAuthState()));
    await storageSet(`${CHAT_STORAGE_PREFIX}account_2`, JSON.stringify(useChatStore.getState().exportChatState()));

    set({
      activeAccountId: 'account_2',
      accounts: updatedAccounts,
      isAddingSecondAccount: false,
      isSwitching: false,
    });
    syncActiveAccountScope('account_2');

    ablyService.connect(newCode).catch(() => {});
  },

  deleteCurrentAccount: async () => {
    const { activeAccountId, accounts } = get();
    const auth = useAuthStore.getState();
    const chat = useChatStore.getState();

    const account1 = accounts.find((a) => a.id === 'account_1');
    const account2 = accounts.find((a) => a.id === 'account_2');

    if (activeAccountId === 'account_1' && account2 && account2.isRegistered) {
      await storageRemove(`${AUTH_STORAGE_PREFIX}account_1`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_1`);

      const account2AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_2`);
      const account2ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_2`);

      await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);

      if (account2AuthRaw) {
        await storageSet(`${AUTH_STORAGE_PREFIX}account_1`, account2AuthRaw);
        await storageSet('orbita-auth-storage', account2AuthRaw);
        try {
          const parsed = JSON.parse(account2AuthRaw);
          auth.importAuthState(parsed.state || parsed);
        } catch {}
      }

      if (account2ChatRaw) {
        await storageSet(`${CHAT_STORAGE_PREFIX}account_1`, account2ChatRaw);
        await storageSet('orbita-chat-storage', account2ChatRaw);
        try {
          const parsed = JSON.parse(account2ChatRaw);
          chat.importChatState(parsed.state || parsed);
        } catch {}
      }

      const promotedAccount: AccountMeta = {
        ...account2,
        id: 'account_1',
      };

      const newAccounts: AccountMeta[] = [promotedAccount];
      const registry: AccountRegistryData = {
        activeAccountId: 'account_1',
        accounts: newAccounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

      set({
        activeAccountId: 'account_1',
        accounts: newAccounts,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope('account_1');

      const promotedClient = useChatStore.getState().myCode || useAuthStore.getState().userId;
      if (promotedClient) {
        ablyService.connect(promotedClient).catch(() => {});
      }

      return;
    }

    if (activeAccountId === 'account_2' && account1 && account1.isRegistered) {
      await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
      await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);

      const activeClientId = chat.myCode || auth.userId;
      if (activeClientId) {
        ablyService.setOffline(activeClientId);
      }
      ablyService.disconnect();

      const account1AuthRaw = await storageGet(`${AUTH_STORAGE_PREFIX}account_1`) || await storageGet('orbita-auth-storage');
      const account1ChatRaw = await storageGet(`${CHAT_STORAGE_PREFIX}account_1`) || await storageGet('orbita-chat-storage');

      if (account1AuthRaw) {
        try {
          const parsed = JSON.parse(account1AuthRaw);
          auth.importAuthState(parsed.state || parsed);
        } catch {}
      }

      if (account1ChatRaw) {
        try {
          const parsed = JSON.parse(account1ChatRaw);
          chat.importChatState(parsed.state || parsed);
        } catch {}
      }

      const newAccounts = accounts.filter((a) => a.id !== 'account_2');
      const registry: AccountRegistryData = {
        activeAccountId: 'account_1',
        accounts: newAccounts,
      };
      await storageSet(REGISTRY_STORAGE_KEY, JSON.stringify(registry));

      set({
        activeAccountId: 'account_1',
        accounts: newAccounts,
        isAddingSecondAccount: false,
      });
      syncActiveAccountScope('account_1');

      const restoredClient = useChatStore.getState().myCode || useAuthStore.getState().userId;
      if (restoredClient) {
        ablyService.connect(restoredClient).catch(() => {});
      }

      return;
    }

    await storageRemove(REGISTRY_STORAGE_KEY);
    await storageRemove(`${AUTH_STORAGE_PREFIX}account_1`);
    await storageRemove(`${CHAT_STORAGE_PREFIX}account_1`);
    await storageRemove(`${AUTH_STORAGE_PREFIX}account_2`);
    await storageRemove(`${CHAT_STORAGE_PREFIX}account_2`);
    await storageRemove('orbita-auth-storage');
    await storageRemove('orbita-chat-storage');

    document.documentElement.removeAttribute('data-theme');
    chat.resetChats();

    const newUserId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    auth.importAuthState({
      userId: newUserId,
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

    set({
      activeAccountId: 'account_1',
      accounts: [],
      isAddingSecondAccount: false,
    });
    syncActiveAccountScope('account_1');
  },
}));
