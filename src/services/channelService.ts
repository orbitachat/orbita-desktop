import { getPusher } from '../utils/pusher';
import { type LinkPreviewData } from '../store/useChatStore';
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

class ChannelService {
  private getWorkerUrl(): string {
    return getVercelBaseUrl();
  }

  async getFeaturedChannels(): Promise<ChannelInfo[]> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/channels/featured`);
      if (res.ok) {
        const data = (await res.json()) as { channels: ChannelInfo[] };
        return data.channels || [];
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to fetch featured channels:', err);
    }
    return [];
  }

  async getChannel(channelId: string): Promise<ChannelInfo | null> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/channels/get?channelId=${encodeURIComponent(channelId.trim())}`);
      if (res.ok) {
        const data = (await res.json()) as { channel: ChannelInfo };
        return data.channel || null;
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to get channel:', err);
    }
    return null;
  }

  async createChannel(
    name: string,
    description: string,
    avatarUrl: string | null,
    creatorNickname: string,
    customId?: string
  ): Promise<ChannelInfo | null> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/channels/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customId?.trim() || undefined,
          name: name.trim(),
          description: description.trim(),
          avatarUrl: avatarUrl || null,
          creatorNickname,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { channel: ChannelInfo };
        return data.channel || null;
      }
    } catch (err) {
      console.error('[ChannelService] Failed to create channel:', err);
    }
    return null;
  }

  async getChannelPosts(channelId: string): Promise<ChannelPost[]> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/channels/posts?channelId=${encodeURIComponent(channelId.trim())}`);
      if (res.ok) {
        const data = (await res.json()) as { posts: ChannelPost[] };
        return data.posts || [];
      }
    } catch (err) {
      console.warn('[ChannelService] Failed to get channel posts:', err);
    }
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
    linkPreview?: LinkPreviewData
  ): Promise<ChannelPost | null> {
    try {
      const body = {
        channelId: channelId.trim(),
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

      const res = await fetch(`${this.getWorkerUrl()}/channels/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as { post: ChannelPost };
        return data.post || null;
      }
    } catch (err) {
      console.error('[ChannelService] Failed to publish post:', err);
    }
    return null;
  }

  async joinChannel(channelId: string, nickname?: string): Promise<number | null> {
    try {
      const res = await fetch(`${this.getWorkerUrl()}/channels/join`, {
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
      const res = await fetch(`${this.getWorkerUrl()}/channels/leave`, {
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
      const res = await fetch(`${this.getWorkerUrl()}/channels/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, postId, emoji, userId, action: action || 'toggle' }),
      });

      if (res.ok) {
        const data = (await res.json()) as { reactions: Record<string, string[]> };
        return data.reactions || null;
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
