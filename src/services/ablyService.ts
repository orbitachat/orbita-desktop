import Ably from 'ably';
import { Realtime, PresenceMessage } from 'ably';
import { useChatStore } from '../store/useChatStore';
import { gatewayManager } from './gatewayManager';

type UserStatusCallback = (isOnline: boolean, lastSeen?: number) => void;
type TypingCallback = (userId: string, isTyping: boolean) => void;
type DeliveryCallback = (messageId: string, userId: string, status: 'delivered' | 'read', timestamp: number) => void;
type HandshakeCallback = { onRequest: (data: any) => void; onConfirm?: (data: any) => void; };

class AblyService {
  private client: Realtime | null = null;
  private userId: string | null = null;
  private presenceSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private typingSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private deliverySubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private handshakeSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();
  private lastSeenTimers: Map<string, NodeJS.Timeout> = new Map();
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isConnected = false;

  private typingCallbacks: Map<string, TypingCallback> = new Map();
  private deliveryCallbacks: Map<string, DeliveryCallback> = new Map();
  private presenceCallbacks: Map<string, UserStatusCallback> = new Map();
  private handshakeCallbacks: Map<string, HandshakeCallback> = new Map();
  private chatMessageCallbacks: Map<string, Set<(data: any) => void>> = new Map();

  private chatMessageSubscriptions: Map<string, Ably.RealtimeChannel> = new Map();

  private typingHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private deliveredHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private readHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private presenceHandlers: Map<string, (member: PresenceMessage) => void> = new Map();
  private handshakeReqHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private handshakeConfHandlers: Map<string, (message: Ably.Message) => void> = new Map();
  private chatMessageHandlers: Map<string, (message: Ably.Message) => void> = new Map();

  private readonly ABLY_KEYS: string[] = [];
  private activeKeyIndex = 0;

  getConnectionState(): string {
    return this.client ? (this.client.connection as any).state : 'disconnected';
  }

  switchToNextServer(): Promise<void> {
    if (this.ABLY_KEYS.length <= 1) return Promise.resolve();
    this.activeKeyIndex = (this.activeKeyIndex + 1) % this.ABLY_KEYS.length;
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
    this.isConnected = false;
    const nextKey = this.ABLY_KEYS[this.activeKeyIndex];
    console.log(`[Ably] Failover: switched to key index ${this.activeKeyIndex} (${nextKey ? nextKey.slice(0, 12) + '...' : ''})`);
    if (this.userId) {
      return this.connect(this.userId);
    }
    return Promise.resolve();
  }

  getActiveKey(): string {
    return this.ABLY_KEYS[this.activeKeyIndex] || '';
  }

  reconnect(): void {
    if (this.client) {
      try {
        this.client.connection.connect();
      } catch (e) {
        console.warn('[Ably] Reconnect error:', e);
      }
    } else if (this.userId) {
      this.connect(this.userId).catch(() => {});
    }
  }

  connect(userId: string): Promise<void> {
    if (this.client && this.userId === userId && this.isConnected) {
      return Promise.resolve();
    }

    if (this.client && this.userId !== userId) {
      this.client.close();
      this.client = null;
    }

    return new Promise((resolve, reject) => {
      try {
        const clientOptions: Ably.ClientOptions = {
          clientId: userId,
        };

        const activeKey = this.ABLY_KEYS[this.activeKeyIndex] || this.ABLY_KEYS[0];
        if (activeKey) {
          clientOptions.key = activeKey;
        } else {
          clientOptions.authCallback = async (_data, callback) => {
            try {
              const res = await gatewayManager.fetch(`/ably-auth?clientId=${encodeURIComponent(userId)}`, {
                method: 'GET',
              });
              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ably auth failed (${res.status}): ${errText}`);
              }
              const tokenDetails = await res.json();
              callback(null, tokenDetails);
            } catch (err: any) {
              console.error('[Ably] Auth callback error:', err);
              callback(err, null as any);
            }
          };
        }

        this.client = new Ably.Realtime(clientOptions);
        this.userId = userId;

        this.client.connection.on('connected', () => {
          this.isConnected = true;
          this.setOnline(userId);
          this.reattachAllSubscriptions();
          console.log(`[Ably] Connected with key index ${this.activeKeyIndex} (${activeKey ? activeKey.slice(0, 12) + '...' : 'worker'})`);
          if (typeof window !== 'undefined') {
            (window as any).ablyService = this;
            (window as any).switchToNextAblyServer = () => this.switchToNextServer();
            (window as any).getActiveAblyServer = () => ({ index: this.activeKeyIndex, key: this.getActiveKey() });
          }
          resolve();
        });

        this.client.connection.on('failed', (error) => {
          console.error('[Ably] Connection failed with key index', this.activeKeyIndex, error);
          this.isConnected = false;
          if (this.ABLY_KEYS.length > 1) {
            this.activeKeyIndex = (this.activeKeyIndex + 1) % this.ABLY_KEYS.length;
            this.client = null;
            this.connect(userId).then(resolve).catch(reject);
            return;
          }
          reject(error);
        });

        this.client.connection.on('disconnected', () => {
          this.isConnected = false;
        });

        this.client.connection.on('suspended', () => {
          this.isConnected = false;
        });

        this.client.connection.on('update', (stateChange) => {
          if (stateChange.current === 'connected') {
            this.isConnected = true;
            this.setOnline(userId);
            this.reattachAllSubscriptions();
          }
        });

        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Ably connection timeout'));
          }
        }, 10000);

        this.client.connection.once('connected', () => clearTimeout(timeout));
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.client) {
      this.presenceSubscriptions.forEach((channel) => {
        try {
          channel.presence.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.presenceSubscriptions.clear();

      this.typingSubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.typingSubscriptions.clear();

      this.deliverySubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.deliverySubscriptions.clear();

      this.chatMessageSubscriptions.forEach((channel) => {
        try {
          channel.unsubscribe();
          channel.detach();
        } catch {}
      });
      this.chatMessageSubscriptions.clear();

      this.lastSeenTimers.forEach((timer) => clearTimeout(timer));
      this.lastSeenTimers.clear();

      this.typingTimeouts.forEach((timer) => clearTimeout(timer));
      this.typingTimeouts.clear();

      this.typingCallbacks.clear();
      this.deliveryCallbacks.clear();
      this.presenceCallbacks.clear();
      this.typingHandlers.clear();
      this.deliveredHandlers.clear();
      this.readHandlers.clear();
      this.presenceHandlers.clear();
      this.chatMessageHandlers.clear();

      this.client.close();
      this.client = null;
      this.userId = null;
      this.isConnected = false;
    }
  }

  private reattachAllSubscriptions(): void {
    if (!this.client) return;

    this.handshakeCallbacks.forEach((callbacks, code) => {
      this._attachHandshakeChannel(code, callbacks);
    });

    this.typingCallbacks.forEach((callback, chatId) => {
      this._attachTypingChannel(chatId, callback);
    });

    this.deliveryCallbacks.forEach((callback, chatId) => {
      this._attachDeliveryChannel(chatId, callback);
    });

    this.presenceCallbacks.forEach((callback, userId) => {
      this._attachPresenceChannel(userId, callback);
    });

    this.chatMessageCallbacks.forEach((_cbs, chatId) => {
      this._attachChatMessageChannel(chatId);
    });
  }

  setOnline(userId: string): void {
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`presence:user:${userId}`);
    channel.presence.enter({
      status: 'online',
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to enter presence:', err);
    });
  }

  setOffline(userId: string): void {
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`presence:user:${userId}`);
    channel.presence.leave({
      status: 'offline',
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to leave presence:', err);
    });
  }

  subscribeToUserPresence(userId: string, callback: UserStatusCallback): () => void {
    if (!userId || typeof userId !== 'string' || userId === 'undefined' || userId === 'null' || !userId.trim()) {
      return () => {};
    }
    const cleanId = userId.trim();
    this.presenceCallbacks.set(cleanId, callback);

    if (this.client && this.isConnected) {
      this._attachPresenceChannel(cleanId, callback);
    }

    return () => {
      this.presenceCallbacks.delete(cleanId);

      const channel = this.presenceSubscriptions.get(cleanId);
      if (channel) {
        try {
          channel.presence.unsubscribe();
        } catch {}
        this.presenceSubscriptions.delete(cleanId);
        this.presenceHandlers.delete(cleanId);
      }
    };
  }

  private _attachPresenceChannel(userId: string, callback: UserStatusCallback): void {
    if (!this.client) return;

    const channel = this.client.channels.get(`presence:user:${userId}`);
    this.presenceSubscriptions.set(userId, channel);

    channel.presence.get((err, members) => {
      if (err) {
        console.error('[Ably] Failed to get presence:', err);
        return;
      }

      const activeMember = (members || []).find(
        (m) =>
          (m.clientId === userId || !m.clientId || m.clientId === '') &&
          (m.data ? (typeof m.data === 'object' && 'status' in m.data ? m.data.status === 'online' : true) : true)
      );

      const isOnline = !!activeMember;
      let lastSeen: number | undefined;

      if (!isOnline) {
        const sorted = (members || [])
          .filter((m) => m.clientId === userId || !m.clientId)
          .sort((a, b) => {
            const aTs = a.data && typeof a.data === 'object' && 'timestamp' in a.data ? (a.data as any).timestamp : 0;
            const bTs = b.data && typeof b.data === 'object' && 'timestamp' in b.data ? (b.data as any).timestamp : 0;
            return bTs - aTs;
          });

        if (sorted.length > 0) {
          const d = sorted[0].data;
          if (d && typeof d === 'object' && 'timestamp' in d) {
            lastSeen = (d as any).timestamp;
          }
        }
      } else {
        lastSeen = Date.now();
      }

      callback(isOnline, lastSeen);
    });

    const presenceHandler = (member: PresenceMessage) => {
      const action = member.action;
      if (action === 'enter' || action === 'present' || action === 'update') {
        const isStatusOnline = member.data ? (typeof member.data === 'object' && 'status' in member.data ? member.data.status === 'online' : true) : true;
        const timestamp = member.data && typeof member.data === 'object' && 'timestamp' in member.data ? (member.data as any).timestamp : Date.now();
        callback(isStatusOnline, timestamp);
      } else if (action === 'leave' || action === 'absent') {
        const timestamp = member.data && typeof member.data === 'object' && 'timestamp' in member.data ? (member.data as any).timestamp : Date.now();
        callback(false, timestamp);
      }
    };

    const oldHandler = this.presenceHandlers.get(userId);
    if (oldHandler) {
      try {
        channel.presence.unsubscribe();
      } catch {}
    }

    this.presenceHandlers.set(userId, presenceHandler);
    channel.presence.subscribe(presenceHandler);
  }

  updateLastSeen(userId: string, timestamp: number): void {
    if (!this.client || !this.isConnected) {
      return;
    }

    const channel = this.client.channels.get(`lastseen:user:${userId}`);
    channel.publish('update', { userId, timestamp }).catch((err) => {
      console.error('[Ably] Failed to update last seen:', err);
    });
  }

  sendTyping(chatId: string, isTyping: boolean): void {
    if (!this.client || !this.isConnected || !this.userId) {
      return;
    }

    const state = useChatStore.getState();
    if (!state.typingIndicatorsEnabled) {
      return;
    }

    const channel = this.client.channels.get(`chat:${chatId}`);
    channel.publish('typing', {
      userId: this.userId,
      isTyping,
    }).catch((err) => {
      console.error('[Ably] Failed to send typing:', err);
    });
  }

  subscribeToTyping(chatId: string, callback: TypingCallback): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) {
      return () => {};
    }
    const cleanId = chatId.trim();
    this.typingCallbacks.set(cleanId, callback);

    if (this.client && this.isConnected) {
      this._attachTypingChannel(cleanId, callback);
    }

    return () => {
      this.typingCallbacks.delete(cleanId);

      const channel = this.typingSubscriptions.get(cleanId);
      const handler = this.typingHandlers.get(cleanId);
      if (channel && handler) {
        channel.unsubscribe('typing', handler);
      }
      this.typingSubscriptions.delete(cleanId);
      this.typingHandlers.delete(cleanId);
    };
  }

  private _attachTypingChannel(chatId: string, callback: TypingCallback): void {
    if (!this.client || !chatId) return;

    const channel = this.client.channels.get(`chat:${chatId}`);
    this.typingSubscriptions.set(chatId, channel);

    const handler = (message: Ably.Message) => {
      if (message.data && message.data.userId && message.data.isTyping !== undefined) {
        callback(message.data.userId, message.data.isTyping);
      }
    };

    const oldHandler = this.typingHandlers.get(chatId);
    if (oldHandler) channel.unsubscribe('typing', oldHandler);

    this.typingHandlers.set(chatId, handler);
    channel.subscribe('typing', handler);
  }

  markMessageDelivered(chatId: string, messageId: string): void {
    if (!this.client || !this.isConnected || !this.userId || !chatId || !messageId) {
      return;
    }

    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled) {
      return;
    }

    const channel = this.client.channels.get(`chat:${chatId}`);
    channel.publish('delivered', {
      messageId,
      userId: this.userId,
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to mark delivered:', err);
    });
  }

  markMessageRead(chatId: string, messageId: string): void {
    if (!this.client || !this.isConnected || !this.userId || !chatId || !messageId) {
      return;
    }

    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled) {
      return;
    }

    const channel = this.client.channels.get(`chat:${chatId}`);
    channel.publish('read', {
      messageId,
      userId: this.userId,
      timestamp: Date.now(),
    }).catch((err) => {
      console.error('[Ably] Failed to mark read:', err);
    });
  }

  subscribeToDeliveryUpdates(chatId: string, callback: DeliveryCallback): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) {
      return () => {};
    }
    const cleanId = chatId.trim();
    this.deliveryCallbacks.set(cleanId, callback);

    if (this.client && this.isConnected) {
      this._attachDeliveryChannel(cleanId, callback);
    }

    return () => {
      this.deliveryCallbacks.delete(cleanId);

      const channel = this.deliverySubscriptions.get(cleanId);
      const deliveredHandler = this.deliveredHandlers.get(cleanId);
      const readHandler = this.readHandlers.get(cleanId);

      if (channel) {
        if (deliveredHandler) channel.unsubscribe('delivered', deliveredHandler);
        if (readHandler) channel.unsubscribe('read', readHandler);
      }

      this.deliverySubscriptions.delete(cleanId);
      this.deliveredHandlers.delete(cleanId);
      this.readHandlers.delete(cleanId);
    };
  }

  private _attachDeliveryChannel(chatId: string, callback: DeliveryCallback): void {
    if (!this.client) return;

    const channel = this.client.channels.get(`chat:${chatId}`);
    this.deliverySubscriptions.set(chatId, channel);

    const deliveredHandler = (message: Ably.Message) => {
      if (message.data && message.data.messageId && message.data.userId) {
        callback(
          message.data.messageId,
          message.data.userId,
          'delivered',
          message.data.timestamp || Date.now()
        );
      }
    };

    const readHandler = (message: Ably.Message) => {
      if (message.data && message.data.messageId && message.data.userId) {
        callback(
          message.data.messageId,
          message.data.userId,
          'read',
          message.data.timestamp || Date.now()
        );
      }
    };

    const oldDelivered = this.deliveredHandlers.get(chatId);
    const oldRead = this.readHandlers.get(chatId);
    if (oldDelivered) channel.unsubscribe('delivered', oldDelivered);
    if (oldRead) channel.unsubscribe('read', oldRead);

    this.deliveredHandlers.set(chatId, deliveredHandler);
    this.readHandlers.set(chatId, readHandler);

    channel.subscribe('delivered', deliveredHandler);
    channel.subscribe('read', readHandler);
  }

  private _attachHandshakeChannel(code: string, callbacks: HandshakeCallback): void {
    if (!this.client) return;
    const channel = this.client.channels.get(`handshake:${code}`);
    this.handshakeSubscriptions.set(code, channel);

    const reqHandler = (msg: Ably.Message) => {
      if (msg.data) callbacks.onRequest(msg.data);
    };

    const confirmHandler = (msg: Ably.Message) => {
      if (msg.data && callbacks.onConfirm) callbacks.onConfirm(msg.data);
    };

    const oldReq = this.handshakeReqHandlers.get(code);
    const oldConf = this.handshakeConfHandlers.get(code);
    if (oldReq) channel.unsubscribe('request-identity', oldReq);
    if (oldConf) channel.unsubscribe('identity-confirmed', oldConf);

    this.handshakeReqHandlers.set(code, reqHandler);
    this.handshakeConfHandlers.set(code, confirmHandler);

    channel.subscribe('request-identity', reqHandler);
    channel.subscribe('identity-confirmed', confirmHandler);
  }

  subscribeToHandshake(myCode: string, onRequest: (data: any) => void, onConfirm?: (data: any) => void): () => void {
    if (!myCode || typeof myCode !== 'string' || myCode === 'undefined' || myCode === 'null' || !myCode.trim()) {
      return () => {};
    }
    const cleanCode = myCode.trim();
    this.handshakeCallbacks.set(cleanCode, { onRequest, onConfirm });

    if (this.client && this.isConnected) {
      this._attachHandshakeChannel(cleanCode, { onRequest, onConfirm });
    }

    return () => {
      this.handshakeCallbacks.delete(cleanCode);
      const channel = this.handshakeSubscriptions.get(cleanCode);
      if (channel) {
        const reqHandler = this.handshakeReqHandlers.get(cleanCode);
        const confHandler = this.handshakeConfHandlers.get(cleanCode);
        if (reqHandler) channel.unsubscribe('request-identity', reqHandler);
        if (confHandler) channel.unsubscribe('identity-confirmed', confHandler);
        this.handshakeSubscriptions.delete(cleanCode);
        this.handshakeReqHandlers.delete(cleanCode);
        this.handshakeConfHandlers.delete(cleanCode);
      }
    };
  }

  async sendHandshakeRequest(friendCode: string, data: any): Promise<void> {
    if (!this.client || !friendCode || typeof friendCode !== 'string' || friendCode === 'undefined' || friendCode === 'null' || !friendCode.trim()) return;
    const cleanCode = friendCode.trim();
    const channel = this.client.channels.get(`handshake:${cleanCode}`);
    await channel.publish('request-identity', data);
  }

  async sendHandshakeConfirm(senderCode: string, data: any): Promise<void> {
    if (!this.client || !senderCode || typeof senderCode !== 'string' || senderCode === 'undefined' || senderCode === 'null' || !senderCode.trim()) return;
    const cleanCode = senderCode.trim();
    const channel = this.client.channels.get(`handshake:${cleanCode}`);
    await channel.publish('identity-confirmed', data);
  }

  private _attachChatMessageChannel(chatId: string): void {
    if (!this.client || !chatId) return;
    const channel = this.client.channels.get(`chat:${chatId}`);
    this.chatMessageSubscriptions.set(chatId, channel);

    const handler = (msg: Ably.Message) => {
      if (msg.data) {
        const cbs = this.chatMessageCallbacks.get(chatId);
        if (cbs) {
          cbs.forEach((cb) => {
            try { cb(msg.data); } catch (e) { console.error('[Ably] Callback error:', e); }
          });
        }
      }
    };

    const oldHandler = this.chatMessageHandlers.get(chatId);
    if (oldHandler) {
      try { channel.unsubscribe('client-message', oldHandler); } catch {}
    }

    this.chatMessageHandlers.set(chatId, handler);
    channel.subscribe('client-message', handler);
  }

  async sendMessage(chatId: string, payload: any): Promise<void> {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) return;
    const cleanId = chatId.trim();
    if (!this.client || !this.isConnected) {
      if (this.userId) {
        try { await this.connect(this.userId); } catch {}
      }
    }
    if (!this.client) return;
    try {
      const channel = this.client.channels.get(`chat:${cleanId}`);
      await channel.publish('client-message', payload);
    } catch (err) {
      console.error(`[Ably] Failed to publish message to chat:${chatId}:`, err);
    }
  }

  subscribeToChatMessages(chatId: string, onMessage: (data: any) => void): () => void {
    if (!chatId || typeof chatId !== 'string' || chatId === 'undefined' || chatId === 'null' || !chatId.trim()) return () => {};
    const cleanId = chatId.trim();
    if (!this.chatMessageCallbacks.has(cleanId)) {
      this.chatMessageCallbacks.set(cleanId, new Set());
    }
    this.chatMessageCallbacks.get(cleanId)!.add(onMessage);

    if (this.client && this.isConnected) {
      this._attachChatMessageChannel(cleanId);
    }

    return () => {
      const cbs = this.chatMessageCallbacks.get(cleanId);
      if (cbs) {
        cbs.delete(onMessage);
        if (cbs.size === 0) {
          this.chatMessageCallbacks.delete(cleanId);
          const channel = this.chatMessageSubscriptions.get(cleanId);
          const handler = this.chatMessageHandlers.get(cleanId);
          if (channel && handler) {
            try { channel.unsubscribe('client-message', handler); } catch {}
          }
          this.chatMessageSubscriptions.delete(cleanId);
          this.chatMessageHandlers.delete(cleanId);
        }
      }
    };
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  getCurrentUserId(): string | null {
    return this.userId;
  }
}

export const ablyService = new AblyService();

if (typeof window !== 'undefined') {
  (window as any).ablyService = ablyService;
  (window as any).switchToNextAblyServer = () => ablyService.switchToNextServer();
  (window as any).getActiveAblyServer = () => ({ index: (ablyService as any).activeKeyIndex, key: ablyService.getActiveKey() });
}