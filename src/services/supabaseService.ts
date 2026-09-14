import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { relayRouter } from './relayRouter';
import { getVercelBaseUrl } from './gatewayManager';
import { useChatStore } from '../store/useChatStore';

export interface OfflineMessageRecord {
  id: string;
  chat_id: string;
  sender_id: string;
  recipient_id: string;
  ciphertext: string;
  message_index: number;
  dh_public_key: string;
  created_at: string;
  expires_at: string;
  delivered: boolean;
}

export interface OfflineHandshakeRecord {
  id: string;
  chat_id: string;
  recipient_code: string;
  sender_code: string | null;
  sender_nickname: string;
  sender_public_key: string;
  sender_avatar_url: string | null;
  created_at: string;
  consumed: boolean;
}

export interface ProfileUpdateRecord {
  id: string;
  chat_id: string;
  nickname: string | null;
  avatar_url: string | null;
  hide_profile_id?: boolean | null;
  sender_code?: string | null;
  updated_at: string;
}

export interface UserDirectoryRecord {
  user_code: string;
  nickname: string;
  avatar_url: string | null;
  hide_profile_id?: boolean | null;
  public_key?: string | null;
  updated_at?: string;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private failedRelays: Map<string, number> = new Map();

  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (url && anonKey) {
      this.client = createClient(url, anonKey);
      console.log('[SupabaseService] Initialized direct Supabase client fallback.');
    } else {
      console.log('[SupabaseService] Running in pure Relay/Worker mode (no client API keys needed).');
    }
  }

  async sendOfflineMessage(
    chatId: string,
    senderId: string,
    recipientId: string,
    ciphertext: string,
    index: number,
    dhPublicKey: string,
    clientMsgId?: string
  ): Promise<void> {
    console.log('[Relay/Supabase] sendOfflineMessage called:', { chatId, senderId, recipientId, index, clientMsgId });

    const primaryRelay = relayRouter.getRelayForRecipient(recipientId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    let lastError: any = null;

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            senderId,
            recipientId,
            ciphertext,
            messageIndex: index,
            dhPublicKey,
            clientMsgId,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        console.log(`[Relay] Message dispatched to ${relay.name} (${relay.url})`);
        return;
      } catch (err) {
        console.warn(`[Relay] Failed on ${relay.name} (${relay.url}), trying next relay:`, err);
        lastError = err;
      }
    }

    if (this.client) {
      const row: any = {
        chat_id: chatId,
        sender_id: senderId,
        recipient_id: recipientId,
        ciphertext,
        message_index: index,
        dh_public_key: dhPublicKey,
      };
      if (clientMsgId) {
        row.id = clientMsgId;
      }
      const { error } = await this.client
        .from('messages')
        .insert(row);

      if (error) {
        console.error('[Supabase] Insert error:', error);
        throw new Error(`Failed to save offline message: ${error.message}`);
      }
      return;
    }

    throw lastError || new Error('All relays failed');
  }

  // --- non_messages (pre-handshake plaintext queue) ---
  async saveNonMessage(
    chatId: string,
    senderId: string,
    recipientId: string,
    plaintext: string,
    messageId: string,
  ): Promise<void> {
    console.log('[Supabase] saveNonMessage:', { chatId, senderId, recipientId, messageId });
    if (this.client) {
      const { error } = await this.client
        .from('non_messages')
        .insert({
          id: messageId,
          chat_id: chatId,
          sender_id: senderId,
          recipient_id: recipientId,
          ciphertext: plaintext, // plaintext until E2EE established
          message_index: 0,
        });
      if (error) {
        console.error('[Supabase] saveNonMessage error:', error);
      }
    }
  }

  async getPendingNonMessages(recipientId: string): Promise<OfflineMessageRecord[]> {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from('non_messages')
      .select('*')
      .eq('recipient_id', recipientId)
      .eq('delivered', false)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[Supabase] getPendingNonMessages error:', error);
      return [];
    }
    return data || [];
  }

  async markNonMessageDelivered(messageId: string): Promise<void> {
    if (!this.client) return;
    await this.client
      .from('non_messages')
      .update({ delivered: true })
      .eq('id', messageId)
      .then(({ error }) => {
        if (error) console.error('[Supabase] markNonMessageDelivered error:', error);
      });
  }

  async deleteMessage(
    chatId: string,
    messageId: string,
    recipientId?: string,
    senderId?: string
  ): Promise<void> {
    if (!chatId || !messageId) return;

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      try {
        await fetch(`${relay.url}/relay/delete-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, messageId, recipientId, senderId }),
        });
      } catch {}
    }

    if (this.client) {
      try {
        await this.client.from('non_messages').delete().eq('id', messageId);
      } catch {}
      try {
        await this.client.from('messages').delete().eq('id', messageId);
      } catch {}
      try {
        await this.client.from('non_messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
      } catch {}
      try {
        await this.client.from('messages').delete().eq('chat_id', chatId).ilike('ciphertext', `%${messageId}%`);
      } catch {}

      if (recipientId) {
        try {
          const deletePayload = JSON.stringify({
            type: 'delete-message',
            targetMessageId: messageId,
            chatId,
          });
          const deletionEventId = `del_${messageId}_${Date.now()}`;
          await this.client.from('non_messages').insert({
            id: deletionEventId,
            chat_id: chatId,
            sender_id: senderId || 'system',
            recipient_id: recipientId,
            ciphertext: deletePayload,
            delivered: false,
          });
        } catch {}
      }
    }
  }

  async getPendingMessages(recipientId: string): Promise<OfflineMessageRecord[]> {
    const activeRelays = relayRouter.getActiveRelaysForMe(recipientId);
    const allMessages: OfflineMessageRecord[] = [];
    const seenIds = new Set<string>();

    for (const relay of activeRelays) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 60000) continue;

      try {
        const res = await fetch(`${relay.url}/relay/messages?recipientId=${encodeURIComponent(recipientId)}`);
        if (res.ok) {
          const data = (await res.json()) as { messages: OfflineMessageRecord[] };
          for (const msg of data.messages || []) {
            if (!seenIds.has(msg.id)) {
              seenIds.add(msg.id);
              allMessages.push(msg);
            }
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch (err) {
        this.failedRelays.set(relay.url, Date.now());
        console.warn(`[Relay] Failed to fetch pending messages from ${relay.url}:`, err);
      }
    }

    if (allMessages.length > 0 || !this.client) {
      return allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('messages')
        .select('*')
        .eq('recipient_id', recipientId)
        .eq('delivered', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Supabase] Failed to fetch pending messages:', error);
        return allMessages;
      }

      return data || [];
    }

    return allMessages;
  }

  async markMessageDelivered(messageId: string, recipientId?: string): Promise<void> {
    console.log('[Relay/Supabase] markMessageDelivered:', { messageId });

    const relays = recipientId ? relayRouter.getActiveRelaysForMe(recipientId) : relayRouter.getNodes();

    await Promise.all(
      relays.map((relay) =>
        fetch(`${relay.url}/relay/message/delivered`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        }).catch((err) => console.warn(`[Relay] Error delivering ack to ${relay.url}:`, err))
      )
    );

    if (this.client) {
      await this.client
        .from('messages')
        .update({
          delivered: true,
          expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
        })
        .eq('id', messageId)
        .eq('delivered', false)
        .maybeSingle()
        .then(({ error }) => {
          if (error) console.error('[Supabase] Direct fallback mark delivered error:', error);
        });
    }
  }

  // --- Рукопожатия ---
  async sendOfflineHandshake(
    chatId: string,
    recipientCode: string,
    senderNickname: string,
    senderPublicKey: string,
    senderAvatarUrl: string | null,
    senderCode: string
  ): Promise<void> {
    console.log('[Relay/Supabase] sendOfflineHandshake called:', { chatId, recipientCode, senderNickname });

    const primaryRelay = relayRouter.getRelayForRecipient(recipientCode);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    let lastError: any = null;

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/handshake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            recipientCode,
            senderNickname,
            senderPublicKey,
            senderAvatarUrl,
            senderCode,
          }),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        console.log(`[Relay] Handshake dispatched to ${relay.name} (${relay.url})`);
        return;
      } catch (err) {
        console.warn(`[Relay] Handshake failed on ${relay.name} (${relay.url}), trying next relay:`, err);
        lastError = err;
      }
    }

    if (this.client) {
      const { error } = await this.client
        .from('handshakes')
        .insert({
          chat_id: chatId,
          recipient_code: recipientCode,
          sender_nickname: senderNickname,
          sender_public_key: senderPublicKey,
          sender_avatar_url: senderAvatarUrl,
          sender_code: senderCode,
        });

      if (error) {
        console.error('[Supabase] Handshake insert error:', error);
        throw new Error(`Failed to save offline handshake: ${error.message}`);
      }
      return;
    }

    throw lastError || new Error('All relay nodes failed');
  }

  async getPendingHandshakes(recipientCode: string): Promise<OfflineHandshakeRecord[]> {
    const nodes = relayRouter.getNodes();
    const allHandshakes: OfflineHandshakeRecord[] = [];
    const seenIds = new Set<string>();

    for (const relay of nodes) {
      const lastFail = this.failedRelays.get(relay.url) || 0;
      if (Date.now() - lastFail < 60000) continue;

      try {
        const res = await fetch(`${relay.url}/relay/handshakes?recipientCode=${encodeURIComponent(recipientCode)}`);
        if (res.ok) {
          const data = (await res.json()) as { handshakes: OfflineHandshakeRecord[] };
          for (const hs of data.handshakes || []) {
            if (!seenIds.has(hs.id)) {
              seenIds.add(hs.id);
              allHandshakes.push(hs);
            }
          }
        } else {
          this.failedRelays.set(relay.url, Date.now());
        }
      } catch (err) {
        this.failedRelays.set(relay.url, Date.now());
        console.warn(`[Relay] Failed to fetch pending handshakes from ${relay.url}:`, err);
      }
    }

    if (allHandshakes.length > 0 || !this.client) {
      return allHandshakes.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    if (this.client) {
      const { data, error } = await this.client
        .from('handshakes')
        .select('*')
        .eq('recipient_code', recipientCode)
        .eq('consumed', false)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[Supabase] Failed to fetch pending handshakes:', error);
        return allHandshakes;
      }

      return data || [];
    }

    return allHandshakes;
  }

  async markHandshakeConsumed(handshakeId: string, _recipientCode?: string): Promise<void> {
    console.log('[Relay/Supabase] markHandshakeConsumed:', { handshakeId });

    const relays = relayRouter.getNodes();

    await Promise.all(
      relays.map((relay) =>
        fetch(`${relay.url}/relay/handshake/consumed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ handshakeId }),
        }).catch((err) => console.warn(`[Relay] Error consuming handshake on ${relay.url}:`, err))
      )
    );

    if (this.client) {
      await this.client
        .from('handshakes')
        .update({ consumed: true })
        .eq('id', handshakeId)
        .then(({ error }) => {
          if (error) console.error('[Supabase] Direct fallback mark consumed error:', error);
        });
    }
  }

  // --- Профили ---
  async saveProfileUpdate(
    chatId: string,
    nickname: string | null,
    avatarUrl: string | null,
    senderCode?: string | null,
    hideProfileId?: boolean | null
  ): Promise<void> {
    if (!chatId || chatId === 'notes') return;
    console.log('[Relay/Supabase] saveProfileUpdate:', { chatId, nickname, avatarUrl, senderCode, hideProfileId });

    const primaryRelay = relayRouter.getRelayForRecipient(chatId);
    const allRelays = [
      primaryRelay,
      ...relayRouter.getNodes().filter((n) => n.url !== primaryRelay.url),
    ];

    for (const relay of allRelays) {
      try {
        const res = await fetch(`${relay.url}/relay/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, nickname, avatarUrl, senderCode, hideProfileId }),
        });

        if (res.ok) return;
      } catch (err) {
        console.warn(`[Relay] Failed to save profile update on ${relay.url}:`, err);
      }
    }

    if (this.client) {
      try {
        if (senderCode) {
          await this.client.from('profile_updates').delete().eq('chat_id', chatId).eq('sender_code', senderCode);
        }
      } catch {}
      const { error } = await this.client
        .from('profile_updates')
        .insert({
          chat_id: chatId,
          nickname,
          avatar_url: avatarUrl,
          hide_profile_id: hideProfileId !== undefined ? hideProfileId : null,
          sender_code: senderCode || null,
        });

      if (error) {
        console.error('[Supabase] Failed to save profile update:', error);
      }
    }
  }

  async getLatestProfileUpdate(chatId: string, excludeCode?: string): Promise<ProfileUpdateRecord | null> {
    if (!chatId || chatId === 'notes') return null;
    const nodes = relayRouter.getNodes();

    for (const relay of nodes) {
      try {
        const queryParam = excludeCode ? `&excludeCode=${encodeURIComponent(excludeCode)}` : '';
        const res = await fetch(`${relay.url}/relay/profile?chatId=${encodeURIComponent(chatId)}${queryParam}`);
        if (res.ok) {
          const data = (await res.json()) as { profile: ProfileUpdateRecord | null };
          if (data?.profile) return data.profile;
        }
      } catch (err) {
        console.warn(`[Relay] Failed to get profile update from ${relay.url}:`, err);
      }
    }

    if (this.client) {
      let queryBuilder = this.client
        .from('profile_updates')
        .select('*')
        .eq('chat_id', chatId);

      if (excludeCode) {
        queryBuilder = queryBuilder.neq('sender_code', excludeCode);
      }

      const { data, error } = await queryBuilder
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[Supabase] Failed to fetch latest profile update:', error);
        return null;
      }

      return data || null;
    }

    return null;
  }

  async getLatestProfileUpdatesForChats(chatIds: string[]): Promise<ProfileUpdateRecord[]> {
    if (chatIds.length === 0) return [];

    const updates = await Promise.all(chatIds.map((id) => this.getLatestProfileUpdate(id)));
    return updates.filter((u): u is ProfileUpdateRecord => u !== null);
  }

  async publishPublicProfile(
    userCode: string,
    nickname: string,
    avatarUrl: string | null,
    _publicKey?: string | null,
    hideProfileId?: boolean | null
  ): Promise<void> {
    if (!userCode || !nickname) return;
    const finalHide = hideProfileId !== undefined ? hideProfileId : useChatStore.getState().hideProfileId;
    try {
      await this.saveProfileUpdate(userCode, nickname, avatarUrl, finalHide ? null : userCode, finalHide);
    } catch (e) {
      console.warn('[Directory] Failed to publish profile update:', e);
    }
  }

  async lookupPublicProfile(userCode: string): Promise<UserDirectoryRecord | null> {
    if (!userCode) return null;

    try {
      const update = await this.getLatestProfileUpdate(userCode);
      if (update && update.nickname) {
        return {
          user_code: userCode,
          nickname: update.nickname,
          avatar_url: update.avatar_url,
          hide_profile_id: update.hide_profile_id,
          updated_at: update.updated_at,
        };
      }
    } catch (err) {
      console.warn('[Directory] Failed to lookup profile from relay:', err);
    }

    return null;
  }

  async getHandshakeRecordsForChat(chatId: string): Promise<OfflineHandshakeRecord[]> {
    if (!chatId || chatId === 'notes') return [];
    const nodes = relayRouter.getNodes();
    for (const relay of nodes) {
      try {
        const res = await fetch(`${relay.url}/relay/chat-handshakes?chatId=${encodeURIComponent(chatId)}`);
        if (res.ok) {
          const data = (await res.json()) as { handshakes: OfflineHandshakeRecord[] };
          if (data?.handshakes && data.handshakes.length > 0) return data.handshakes;
        }
      } catch (err) {
        console.warn(`[Relay] Failed to get handshakes for chat from ${relay.url}:`, err);
      }
    }
    if (this.client) {
      const { data, error } = await this.client
        .from('handshakes')
        .select('*')
        .eq('chat_id', chatId);
      if (!error && data) return data;
    }
    return [];
  }

  // --- Реакции ---
  async saveReaction(
    chatId: string,
    _messageIndex: number | undefined,
    messageId: string | undefined,
    emoji: string,
    userId: string,
    action: 'add' | 'remove'
  ): Promise<void> {
    if (!messageId || !this.client) return;
    try {
      if (action === 'add') {
        await this.client
          .from('message_reactions')
          .delete()
          .eq('chat_id', chatId)
          .eq('message_id', messageId)
          .eq('user_id', userId)
          .eq('emoji', emoji);

        await this.client
          .from('message_reactions')
          .insert({
            chat_id: chatId,
            message_id: messageId,
            emoji,
            user_id: userId,
          });
      } else {
        await this.client
          .from('message_reactions')
          .delete()
          .eq('chat_id', chatId)
          .eq('message_id', messageId)
          .eq('emoji', emoji)
          .eq('user_id', userId);
      }
    } catch (err) {
      console.error('[Supabase] saveReaction failed:', err);
    }
  }

  async getReactionsForChat(chatId: string): Promise<Array<{ message_id: string | null; emoji: string; user_id: string }>> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from('message_reactions')
        .select('message_id, emoji, user_id')
        .eq('chat_id', chatId);

      if (error) {
        console.error('[Supabase] getReactionsForChat error:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[Supabase] getReactionsForChat failed:', err);
      return [];
    }
  }

  async deleteReaction(chatId: string, messageId: string, emoji?: string): Promise<void> {
    if (!this.client || !chatId || !messageId) return;
    try {
      let query = this.client
        .from('message_reactions')
        .delete()
        .eq('chat_id', chatId)
        .eq('message_id', messageId);
      if (emoji) {
        query = query.eq('emoji', emoji);
      }
      await query;
    } catch (err) {
      console.error('[Supabase] deleteReaction failed:', err);
    }
  }

  async deleteReactionsForChat(chatId: string): Promise<void> {
    if (!this.client || !chatId) return;
    try {
      await this.client
        .from('message_reactions')
        .delete()
        .eq('chat_id', chatId);
    } catch (err) {
      console.error('[Supabase] deleteReactionsForChat failed:', err);
    }
  }

  // --- Разработчики Orbita ---
  async getDeveloperCodes(): Promise<string[]> {
    const allCodes = new Set<string>();

    // 1. Прямой Supabase клиент (если настроен)
    if (this.client) {
      try {
        const { data, error } = await this.client
          .from('developers')
          .select('code');

        if (!error && data && Array.isArray(data)) {
          data.forEach((row: any) => {
            if (row.code && typeof row.code === 'string') {
              allCodes.add(row.code.trim());
            }
          });
        }
      } catch (err) {
        console.warn('[Supabase] Direct getDeveloperCodes failed:', err);
      }
    }

    const primaryWorkerUrl = getVercelBaseUrl();
    const urlsToTry = [
      `${primaryWorkerUrl}/developers`,
      `${primaryWorkerUrl}/relay/developers`,
      'https://majmrtymawymomliowbz.supabase.co/functions/v1/gateway/developers',
    ];

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          const list = json.developers || json.codes || json.data || [];
          if (Array.isArray(list)) {
            list.forEach((c: any) => {
              const codeStr = typeof c === 'string' ? c : c?.code;
              if (codeStr && typeof codeStr === 'string') {
                allCodes.add(codeStr.trim());
              }
            });
            break;
          }
        }
      } catch (e) {}
    }

    return Array.from(allCodes);
  }

  subscribeToDevelopers(onChange: (codes: string[]) => void): () => void {
    if (!this.client) return () => {};

    const channel = this.client
      .channel('realtime:developers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'developers' },
        async () => {
          const codes = await this.getDeveloperCodes();
          onChange(codes);
        }
      )
      .subscribe();

    return () => {
      this.client?.removeChannel(channel);
    };
  }
}

export const supabaseService = new SupabaseService();