// src/store/useConnectionStore.ts
import { create } from 'zustand';

export interface ProxyProfile {
  id: string;
  name: string;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
  ping?: number | null;
  pingStatus?: 'success' | 'error' | 'testing' | 'idle';
  lastChecked?: number;
}

export interface ConnectionState {
  proxyEnabled: boolean;
  activeProxyId: string | null;
  proxies: ProxyProfile[];
  killSwitch: boolean;
  proxyCalls: boolean;
  autoFallback: boolean;
  isApplying: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  isServerConnected: boolean;
  errorMessage: string | null;

  // Actions
  initConnection: () => Promise<void>;
  setServerConnected: (connected: boolean) => void;
  setProxyEnabled: (enabled: boolean) => Promise<void>;
  setActiveProxy: (id: string) => Promise<void>;
  addProxy: (proxy: Omit<ProxyProfile, 'id'>) => Promise<string>;
  updateProxy: (id: string, updates: Partial<ProxyProfile>) => Promise<void>;
  deleteProxy: (id: string) => Promise<void>;
  setKillSwitch: (enabled: boolean) => void;
  setProxyCalls: (enabled: boolean) => void;
  setAutoFallback: (enabled: boolean) => void;
  checkPing: (id: string) => Promise<number | null>;
  checkAllPings: () => Promise<void>;
  parseProxyUrl: (input: string) => Partial<ProxyProfile> | null;
}

const STORAGE_KEY = 'orbita_connection_settings';

const DEFAULT_PROXIES: ProxyProfile[] = [
  {
    id: 'default-socks5-1',
    name: 'SOCKS5 Пример',
    type: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    ping: null,
    pingStatus: 'idle',
  },
];

const loadSavedState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        proxyEnabled: Boolean(data.proxyEnabled),
        activeProxyId: data.activeProxyId || (data.proxies?.[0]?.id ?? null),
        proxies: Array.isArray(data.proxies) && data.proxies.length > 0 ? data.proxies : DEFAULT_PROXIES,
        killSwitch: Boolean(data.killSwitch),
        proxyCalls: data.proxyCalls !== undefined ? Boolean(data.proxyCalls) : true,
        autoFallback: Boolean(data.autoFallback),
      };
    }
  } catch (e) {
    console.error('[ConnectionStore] Failed to load settings:', e);
  }
  return {
    proxyEnabled: false,
    activeProxyId: 'default-socks5-1',
    proxies: DEFAULT_PROXIES,
    killSwitch: false,
    proxyCalls: true,
    autoFallback: false,
  };
};

const saveState = (state: Partial<ConnectionState>) => {
  try {
    const toSave = {
      proxyEnabled: state.proxyEnabled,
      activeProxyId: state.activeProxyId,
      proxies: state.proxies,
      killSwitch: state.killSwitch,
      proxyCalls: state.proxyCalls,
      autoFallback: state.autoFallback,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error('[ConnectionStore] Failed to save settings:', e);
  }
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ...loadSavedState(),
  isApplying: false,
  connectionStatus: 'disconnected',
  isServerConnected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  errorMessage: null,

  setServerConnected: (connected: boolean) => set({ isServerConnected: connected }),

  initConnection: async () => {
    const state = get();
    if (state.proxyEnabled && state.activeProxyId) {
      const active = state.proxies.find((p) => p.id === state.activeProxyId);
      if (active && window.orbita?.setProxy) {
        try {
          await window.orbita.setProxy({
            host: active.host,
            port: active.port,
            username: active.username,
            password: active.password,
            type: active.type,
            proxyCalls: state.proxyCalls,
          });
          set({ connectionStatus: 'connected' });
        } catch (err: any) {
          console.error('[ConnectionStore] Init proxy failed:', err);
          set({ connectionStatus: 'error', errorMessage: err?.message });
        }
      }
    } else if (window.orbita?.clearProxy) {
      await window.orbita.clearProxy();
      set({ connectionStatus: 'disconnected' });
    }
  },

  setProxyEnabled: async (enabled: boolean) => {
    set({ proxyEnabled: enabled, isApplying: true, errorMessage: null });
    saveState(get());

    const state = get();
    if (enabled && state.activeProxyId) {
      const active = state.proxies.find((p) => p.id === state.activeProxyId);
      if (active && window.orbita?.setProxy) {
        set({ connectionStatus: 'connecting' });
        const res = await window.orbita.setProxy({
          host: active.host,
          port: active.port,
          username: active.username,
          password: active.password,
          type: active.type,
          proxyCalls: state.proxyCalls,
        });
        if (res?.success) {
          set({ connectionStatus: 'connected', isApplying: false });
          get().checkPing(active.id);
        } else {
          set({ connectionStatus: 'error', isApplying: false, errorMessage: res?.error || 'Ошибка прокси' });
          if (state.killSwitch && window.orbita?.setKillSwitchIsolation) {
            await window.orbita.setKillSwitchIsolation(true);
          }
        }
      } else {
        set({ isApplying: false });
      }
    } else {
      if (window.orbita?.clearProxy) {
        await window.orbita.clearProxy();
      }
      if (window.orbita?.setKillSwitchIsolation) {
        await window.orbita.setKillSwitchIsolation(false);
      }
      set({ connectionStatus: 'disconnected', isApplying: false });
    }
  },

  setActiveProxy: async (id: string) => {
    set({ activeProxyId: id });
    saveState(get());

    const state = get();
    if (state.proxyEnabled) {
      const active = state.proxies.find((p) => p.id === id);
      if (active && window.orbita?.setProxy) {
        set({ isApplying: true, connectionStatus: 'connecting' });
        const res = await window.orbita.setProxy({
          host: active.host,
          port: active.port,
          username: active.username,
          password: active.password,
          type: active.type,
          proxyCalls: state.proxyCalls,
        });
        if (res?.success) {
          set({ connectionStatus: 'connected', isApplying: false });
          get().checkPing(active.id);
        } else {
          set({ connectionStatus: 'error', isApplying: false, errorMessage: res?.error });
        }
      }
    }
  },

  addProxy: async (proxyData) => {
    const id = 'proxy-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const newProxy: ProxyProfile = {
      ...proxyData,
      id,
      ping: null,
      pingStatus: 'idle',
    };

    set((prev) => {
      const nextProxies = [...prev.proxies, newProxy];
      const activeId = prev.activeProxyId || id;
      return { proxies: nextProxies, activeProxyId: activeId };
    });
    saveState(get());

    // Auto check ping
    get().checkPing(id);
    return id;
  },

  updateProxy: async (id: string, updates: Partial<ProxyProfile>) => {
    set((prev) => ({
      proxies: prev.proxies.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    saveState(get());

    const state = get();
    if (state.proxyEnabled && state.activeProxyId === id) {
      const active = state.proxies.find((p) => p.id === id);
      if (active && window.orbita?.setProxy) {
        await window.orbita.setProxy({
          host: active.host,
          port: active.port,
          username: active.username,
          password: active.password,
          type: active.type,
          proxyCalls: state.proxyCalls,
        });
      }
    }
  },

  deleteProxy: async (id: string) => {
    const state = get();
    const remaining = state.proxies.filter((p) => p.id !== id);
    const nextActive = state.activeProxyId === id ? remaining[0]?.id || null : state.activeProxyId;

    set({
      proxies: remaining,
      activeProxyId: nextActive,
    });
    saveState(get());

    if (state.proxyEnabled) {
      if (nextActive) {
        get().setActiveProxy(nextActive);
      } else {
        get().setProxyEnabled(false);
      }
    }
  },

  setKillSwitch: (enabled: boolean) => {
    set({ killSwitch: enabled });
    saveState(get());
  },

  setProxyCalls: async (enabled: boolean) => {
    set({ proxyCalls: enabled });
    saveState(get());

    const state = get();
    if (state.proxyEnabled && state.activeProxyId) {
      const active = state.proxies.find((p) => p.id === state.activeProxyId);
      if (active && window.orbita?.setProxy) {
        await window.orbita.setProxy({
          host: active.host,
          port: active.port,
          username: active.username,
          password: active.password,
          type: active.type,
          proxyCalls: enabled,
        });
      }
    }
  },

  setAutoFallback: (enabled: boolean) => {
    set({ autoFallback: enabled });
    saveState(get());
  },

  checkPing: async (id: string) => {
    const target = get().proxies.find((p) => p.id === id);
    if (!target) return null;

    set((prev) => ({
      proxies: prev.proxies.map((p) => (p.id === id ? { ...p, pingStatus: 'testing' } : p)),
    }));

    if (window.orbita?.checkProxyPing) {
      const res = await window.orbita.checkProxyPing(target.host, target.port, 4000);
      const pingVal = res?.success && res.ping !== undefined ? res.ping : null;
      const status = res?.success ? 'success' : 'error';

      set((prev) => ({
        proxies: prev.proxies.map((p) =>
          p.id === id
            ? {
                ...p,
                ping: pingVal,
                pingStatus: status,
                lastChecked: Date.now(),
              }
            : p
        ),
      }));

      // If active proxy failed and autoFallback is on, switch to another working proxy
      const state = get();
      if (state.proxyEnabled && state.activeProxyId === id && !res?.success && state.autoFallback) {
        const nextWorking = state.proxies.find((p) => p.id !== id && p.pingStatus === 'success');
        if (nextWorking) {
          console.log('[ConnectionStore] Auto-failing over to proxy:', nextWorking.name);
          get().setActiveProxy(nextWorking.id);
        }
      }

      return pingVal;
    } else {
      // Fallback in browser dev mode
      const fakePing = Math.floor(Math.random() * 80) + 30;
      set((prev) => ({
        proxies: prev.proxies.map((p) =>
          p.id === id ? { ...p, ping: fakePing, pingStatus: 'success', lastChecked: Date.now() } : p
        ),
      }));
      return fakePing;
    }
  },

  checkAllPings: async () => {
    const proxies = get().proxies;
    await Promise.all(proxies.map((p) => get().checkPing(p.id)));
  },

  parseProxyUrl: (input: string): Partial<ProxyProfile> | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Pattern 1: socks5://user:pass@host:port or http://user:pass@host:port
    const urlMatch = trimmed.match(/^(socks5|http|https):\/\/(?:([^:]+)(?::([^@]+))?@)?([^:]+):(\d+)/i);
    if (urlMatch) {
      const protocol = urlMatch[1].toLowerCase();
      const username = urlMatch[2] ? decodeURIComponent(urlMatch[2]) : undefined;
      const password = urlMatch[3] ? decodeURIComponent(urlMatch[3]) : undefined;
      const host = urlMatch[4];
      const port = parseInt(urlMatch[5], 10);
      return {
        type: protocol.startsWith('http') ? 'http' : 'socks5',
        name: `${host}:${port}`,
        host,
        port,
        username,
        password,
      };
    }

    // Pattern 2: host:port:user:pass or host:port
    const colonParts = trimmed.split(':');
    if (colonParts.length === 2 && !isNaN(Number(colonParts[1]))) {
      return {
        type: 'socks5',
        name: `${colonParts[0]}:${colonParts[1]}`,
        host: colonParts[0],
        port: parseInt(colonParts[1], 10),
      };
    }
    if (colonParts.length === 4 && !isNaN(Number(colonParts[1]))) {
      return {
        type: 'socks5',
        name: `${colonParts[0]}:${colonParts[1]}`,
        host: colonParts[0],
        port: parseInt(colonParts[1], 10),
        username: colonParts[2],
        password: colonParts[3],
      };
    }

    return null;
  },
}));
