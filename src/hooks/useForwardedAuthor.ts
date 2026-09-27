import { useState, useEffect } from 'react';
import { ForwardedFrom, useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { supabaseService } from '../services/supabaseService';

interface CachedProfile {
  nickname?: string;
  avatarUrl?: string | null;
  timestamp: number;
}

const profileCache = new Map<string, CachedProfile>();
const listeners = new Map<string, Set<() => void>>();

function notifyListeners(senderId: string) {
  const set = listeners.get(senderId);
  if (set) {
    set.forEach((fn) => fn());
  }
}

export function fetchAuthorProfile(senderId: string) {
  if (!senderId || senderId === '000') return;
  const cached = profileCache.get(senderId);
  const now = Date.now();
  if (cached && now - cached.timestamp < 60000) return;

  supabaseService.lookupPublicProfile(senderId).then((record) => {
    if (record) {
      profileCache.set(senderId, {
        nickname: record.nickname || undefined,
        avatarUrl: record.avatar_url ?? null,
        timestamp: Date.now(),
      });
      notifyListeners(senderId);
    }
  }).catch(() => {});
}

export function useForwardedAuthor(forwarded: ForwardedFrom) {
  const senderId = forwarded.senderId;
  const isAnonymous = Boolean(forwarded.isAnonymous || (!forwarded.sender && !senderId));

  const myCode = useChatStore((s) => s.myCode);
  const chats = useChatStore((s) => s.chats);

  const myNickname = useAuthStore((s) => s.nickname);
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);

  const [, setTick] = useState(0);

  useEffect(() => {
    if (!senderId || isAnonymous) return;
    if (myCode && senderId === myCode) return;

    fetchAuthorProfile(senderId);

    const onUpdate = () => setTick((t) => t + 1);
    if (!listeners.has(senderId)) {
      listeners.set(senderId, new Set());
    }
    listeners.get(senderId)!.add(onUpdate);

    return () => {
      listeners.get(senderId)?.delete(onUpdate);
    };
  }, [senderId, isAnonymous, myCode]);

  if (isAnonymous) {
    return {
      nickname: '',
      avatarUrl: null,
      isIdHidden: false,
      senderId: undefined,
      isAnonymous: true,
    };
  }

  if (myCode && senderId === myCode) {
    return {
      nickname: myNickname || forwarded.sender || '',
      avatarUrl: myAvatarUrl || forwarded.senderAvatarUrl || null,
      isIdHidden: false,
      senderId,
      isAnonymous: false,
    };
  }

  const cached = senderId ? profileCache.get(senderId) : undefined;
  const localChat = senderId
    ? chats.find((c) => c.id !== 'notes' && (c.peerCode === senderId || (c.type === 'private' && (c.name === senderId || c.peerCode === senderId))))
    : undefined;

  const resolvedNickname =
    cached?.nickname ||
    localChat?.name ||
    forwarded.sender ||
    '';

  const resolvedAvatar = cached?.avatarUrl !== undefined
    ? cached.avatarUrl
    : (localChat?.avatarUrl ?? forwarded.senderAvatarUrl ?? null);

  return {
    nickname: resolvedNickname,
    avatarUrl: resolvedAvatar,
    isIdHidden: false,
    senderId,
    isAnonymous: false,
  };
}
