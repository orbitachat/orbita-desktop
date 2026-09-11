import { getPusher } from '../utils/pusher';
import { type LinkPreviewData } from '../store/useChatStore';
import { ablyService } from './ablyService';
import { generateChannelId } from '../lib/codes';
import { getVercelBaseUrl } from './gatewayManager';

export interface ChannelInfo {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  creatorNickname: string;
  subscribersCount: number;
  isOfficial?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface ChannelPost {
  id: string;
  channelId: string;
  sender: string;
  text: string;
  time: number;
  mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file' | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mime?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
  audioMetadata?: any | null;
  linkPreview?: LinkPreviewData | null;
  reactions?: Record<string, string[]>;
}

const W = getVercelBaseUrl();
const CHANNELS_SUPABASE_URL = 'https://rugqiezexuknqcppicma.supabase.co';
const CHANNELS_SUPABASE_KEY = 'sb_publishable_XYjE7C93LWA-P1OHZqNONg_QHlyZ9sZ';

class ChannelService {
  async getFeaturedChannels(): Promise<ChannelInfo[]> {
    try {
      const res = await fetch(`${W}/channels/featured`);
      if (res.ok) {
        const data = (await res.json()) as { channels: ChannelInfo[] };
        if (data.channels && data.channels.length > 0) return data.channels;
      }
    } catch {}

    try {
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?select=*&order=created_at.desc&limit=20`, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data)) {
          return data.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description || '',
            avatarUrl: c.avatar_url || null,
            creatorNickname: c.creator_nickname,
            subscribersCount: c.subscribers_count || 1,
            isOfficial: c.is_official || false,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
          }));
        }
      }
    } catch {}
    return [];
  }

  async getChannel(channelId: string): Promise<ChannelInfo | null> {
    const cleanId = channelId.trim();
    try {
      const res = await fetch(`${W}/channels/get?channelId=${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = (await res.json()) as { channel: ChannelInfo };
        if (data.channel) return data.channel;
      }
    } catch {}

    try {
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?id=eq.${encodeURIComponent(cleanId)}&select=*`, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data) && data.length > 0) {
          const c = data[0];
          return {
            id: c.id,
            name: c.name,
            description: c.description || '',
            avatarUrl: c.avatar_url || null,
            creatorNickname: c.creator_nickname,
            subscribersCount: c.subscribers_count || 1,
            isOfficial: c.is_official || false,
            createdAt: new Date(c.created_at).getTime(),
            updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : new Date(c.created_at).getTime(),
          };
        }
      }
    } catch {}
    return null;
  }

  async createChannel(
    name: string,
    description: string,
    avatarUrl: string | null,
    creatorNickname: string,
    customId?: string
  ): Promise<ChannelInfo | null> {
    const idToUse = customId?.trim() || generateChannelId();
    const now = Date.now();
    try {
      const res = await fetch(`${W}/channels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: idToUse,
          name: name.trim(),
          description: description.trim(),
          avatarUrl: avatarUrl || null,
          creatorNickname,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { channel: ChannelInfo };
        if (data.channel) return data.channel;
      }
    } catch (err) {
      console.error('[ChannelService] Failed to create channel via backend:', err);
    }

    try {
      const dbRow = {
        id: idToUse,
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatarUrl || null,
        creator_nickname: creatorNickname,
        subscribers_count: 1,
        is_official: false,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
      await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(dbRow),
      });
    } catch {}

    return {
      id: idToUse,
      name: name.trim(),
      description: description.trim(),
      avatarUrl: avatarUrl || null,
      creatorNickname,
      subscribersCount: 1,
      isOfficial: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateChannel(
    channelId: string,
    data: { name?: string; description?: string; avatarUrl?: string | null }
  ): Promise<boolean> {
    const cleanId = channelId.trim();
    const now = Date.now();
    const eventPayload = {
      type: 'channel-updated',
      channelId: cleanId,
      name: data.name,
      description: data.description,
      avatarUrl: data.avatarUrl,
      updatedAt: now,
    };

    try {
      ablyService.sendMessage(`public-channel-${cleanId}`, eventPayload).catch(() => {});
    } catch {}

    const directPatch: Record<string, any> = {
      updated_at: new Date(now).toISOString(),
    };
    if (data.name !== undefined) directPatch.name = data.name.trim();
    if (data.description !== undefined) directPatch.description = data.description.trim();
    if (data.avatarUrl !== undefined) directPatch.avatar_url = data.avatarUrl;

    try {
      fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/public_channels?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(directPatch),
      }).catch(() => {});
    } catch {}

    try {
      const res = await fetch(`${W}/channels/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: cleanId,
          name: data.name,
          description: data.description,
          avatarUrl: data.avatarUrl,
        }),
      });
      if (res.ok) {
        return true;
      }
    } catch (err) {
      console.error('[ChannelService] Failed to update channel:', err);
    }
    return true;
  }

  async getChannelPosts(channelId: string): Promise<ChannelPost[]> {
    const cleanId = channelId.trim();
    try {
      const res = await fetch(`${W}/channels/posts?channelId=${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = (await res.json()) as { posts: ChannelPost[] };
        if (data.posts && data.posts.length > 0) return data.posts;
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to get channel posts via backend:', err);
    }

    try {
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/channel_posts?channel_id=eq.${encodeURIComponent(cleanId)}&order=created_at.asc&limit=100`, {
        headers: {
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
        },
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        if (Array.isArray(data)) {
          return data.map((p) => ({
            id: p.id,
            channelId: p.channel_id,
            sender: p.sender_nickname,
            text: p.text || '',
            time: new Date(p.created_at).getTime(),
            mediaType: p.media_type || null,
            mediaUrl: p.media_url || null,
            mediaName: p.media_name || null,
            mime: p.mime || null,
            duration: p.duration || null,
            width: p.width || null,
            height: p.height || null,
            waveform: p.waveform || null,
            audioMetadata: p.audio_metadata || null,
            linkPreview: p.link_preview || null,
            reactions: p.reactions || {},
          }));
        }
      }
    } catch {}
    return [];
  }

  async publishPost(
    channelId: string,
    senderNickname: string,
    text: string,
    mediaPayload?: {
      type: string;
      url: string;
      name?: string;
      mime?: string;
      duration?: number;
      width?: number;
      height?: number;
      waveform?: number[];
      audioMetadata?: any;
    },
    linkPreview?: LinkPreviewData,
    customId?: string
  ): Promise<ChannelPost | null> {
    const cleanId = channelId.trim();
    const postIdToUse = customId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    try {
      const body = {
        id: postIdToUse,
        channelId: cleanId,
        senderNickname,
        text,
        mediaType: mediaPayload?.type || null,
        mediaUrl: mediaPayload?.url || null,
        mediaName: mediaPayload?.name || null,
        mime: mediaPayload?.mime || null,
        duration: mediaPayload?.duration || null,
        width: mediaPayload?.width || null,
        height: mediaPayload?.height || null,
        waveform: mediaPayload?.waveform || null,
        audioMetadata: mediaPayload?.audioMetadata ? {
          title: mediaPayload.audioMetadata.title,
          artist: mediaPayload.audioMetadata.artist,
          duration: mediaPayload.audioMetadata.duration,
          size: mediaPayload.audioMetadata.size,
        } : null,
        linkPreview: linkPreview || null,
      };

      const res = await fetch(`${W}/channels/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as { post: ChannelPost };
        if (data.post) {
          return data.post;
        }
      }
    } catch (err) {
      console.error('[ChannelService] Failed to publish post via backend:', err);
    }

    try {
      const now = Date.now();
      const directRow = {
        id: postIdToUse,
        channel_id: cleanId,
        sender_nickname: senderNickname,
        text: text || '',
        media_type: mediaPayload?.type || null,
        media_url: mediaPayload?.url || null,
        media_name: mediaPayload?.name || null,
        mime: mediaPayload?.mime || null,
        duration: mediaPayload?.duration || null,
        width: mediaPayload?.width || null,
        height: mediaPayload?.height || null,
        waveform: mediaPayload?.waveform || null,
        audio_metadata: mediaPayload?.audioMetadata ? {
          title: mediaPayload.audioMetadata.title,
          artist: mediaPayload.audioMetadata.artist,
          duration: mediaPayload.audioMetadata.duration,
          size: mediaPayload.audioMetadata.size,
        } : null,
        link_preview: linkPreview || null,
        reactions: {},
        created_at: new Date(now).toISOString(),
      };
      const res = await fetch(`${CHANNELS_SUPABASE_URL}/rest/v1/channel_posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CHANNELS_SUPABASE_KEY,
          'Authorization': `Bearer ${CHANNELS_SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(directRow),
      });
      if (res.ok) {
        const postObj: ChannelPost = {
          id: postIdToUse,
          channelId: channelId.trim(),
          sender: senderNickname,
          text: text || '',
          time: now,
          mediaType: directRow.media_type as any,
          mediaUrl: directRow.media_url,
          mediaName: directRow.media_name,
          mime: directRow.mime,
          duration: directRow.duration,
          width: directRow.width,
          height: directRow.height,
          waveform: directRow.waveform,
          audioMetadata: directRow.audio_metadata,
          linkPreview: directRow.link_preview,
          reactions: directRow.reactions,
        };
        try {
          ablyService.sendMessage(`public-channel-${channelId.trim()}`, {
            type: 'channel-post',
            post: postObj,
          }).catch(() => {});
        } catch {}
        return postObj;
      }
    } catch {}

    return null;
  }

  async joinChannel(channelId: string, nickname?: string): Promise<number | null> {
    try {
      const res = await fetch(`${W}/channels/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelId.trim(), nickname }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscribersCount: number };
        return typeof data.subscribersCount === 'number' ? data.subscribersCount : null;
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to join channel:', err);
    }
    return null;
  }

  async leaveChannel(channelId: string, nickname?: string): Promise<number | null> {
    try {
      const res = await fetch(`${W}/channels/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelId.trim(), nickname }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscribersCount: number };
        return typeof data.subscribersCount === 'number' ? data.subscribersCount : null;
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to leave channel:', err);
    }
    return null;
  }

  async toggleReaction(
    channelId: string,
    postId: string,
    emoji: string,
    userId: string,
    action?: 'add' | 'remove' | 'toggle'
  ): Promise<Record<string, string[]> | null> {
    try {
      const res = await fetch(`${W}/channels/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, postId, emoji, userId, action: action || 'toggle' }),
      });

      if (res.ok) {
        const data = (await res.json()) as { reactions: Record<string, string[]> };
        const reactions = data.reactions || null;
        if (reactions) {
          try {
            ablyService.sendMessage(`public-channel-${channelId.trim()}`, {
              type: 'reaction-updated',
              postId,
              emoji,
              userId,
              action: action || 'toggle',
              reactions,
            }).catch(() => {});
          } catch {}
        }
        return reactions;
      }
    } catch (err) {
      console.error('[ChannelService] Failed to toggle reaction:', err);
    }
    return null;
  }

  subscribeToChannel(
    channelId: string,
    onNewPost: (post: ChannelPost) => void,
    onReactionUpdated?: (data: { postId: string; emoji: string; userId: string; action: 'add' | 'remove' | 'toggle'; reactions: Record<string, string[]> }) => void,
    onSubscribersUpdated?: (data: { channelId: string; subscribersCount: number; action?: 'join' | 'leave'; nickname?: string }) => void
  ): () => void {
    const pusher = getPusher();
    const channelName = `public-channel-${channelId.trim()}`;
    const channel = pusher.subscribe(channelName);

    const postHandler = (data: ChannelPost) => {
      console.log('[ChannelService] Received new post via Pusher:', data);
      onNewPost(data);
    };

    const reactionHandler = (data: any) => {
      console.log('[ChannelService] Received reaction update via Pusher:', data);
      if (onReactionUpdated) onReactionUpdated(data);
    };

    const subscribersHandler = (data: any) => {
      console.log('[ChannelService] Received subscribers update via Pusher:', data);
      if (onSubscribersUpdated) onSubscribersUpdated(data);
    };

    channel.bind('new-post', postHandler);
    channel.bind('reaction-updated', reactionHandler);
    channel.bind('subscribers-updated', subscribersHandler);

    return () => {
      channel.unbind('new-post', postHandler);
      channel.unbind('reaction-updated', reactionHandler);
      channel.unbind('subscribers-updated', subscribersHandler);
      pusher.unsubscribe(channelName);
    };
  }
}

export const channelService = new ChannelService();
