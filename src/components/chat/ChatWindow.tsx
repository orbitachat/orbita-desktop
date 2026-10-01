import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
  File,
  ChevronDown
} from 'lucide-react';
import { GroupEmptyCard } from './GroupEmptyCard';
import { AddGroupMemberModal } from './AddGroupMemberModal';
import { useChatStore, type Message, type MediaItem, type LinkPreviewData, isMessageOutgoing } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { getPusher, getGroupPusher, CLIENT_SESSION_ID } from '../../utils/pusher';
import { ablyService } from '../../services/ablyService';
import { MessageStatus } from '../MessageStatus';
import { DoubleRatchet } from '../../lib/double-ratchet';
import { deriveChannelKey, decryptMessage, encryptMessage, generateKeyPair, generateChatId } from '../../lib/crypto';
import { isValidGroupCode, deriveGroupKey, extractGroupCode } from '../../lib/groupCrypto';
import { useTranslation } from 'react-i18next';
import { useCallStore } from '../../store/useCallStore';
import { useConnectionStore } from '../../store/useConnectionStore';
import { supabaseService } from '../../services/supabaseService';
import { AttachedFile } from './FileAttachmentModal';
import { Avatar } from '../common/Avatar';
import {
  isEmojiOnly,
} from '../../lib/emoji-data';
import { getOrbitaMediaUrl } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { stripExifMetadata } from '../../lib/exifStripper';
import { AudioMessageBubble } from './AudioMessageBubble';
import { useSelection } from '../../hooks/useSelection';
import { SelectionPanel } from './SelectionPanel';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { MessageInput } from './MessageInput';
import { TelegramAlbumGrid } from './TelegramAlbumGrid';
import { GroupedAudioBubble } from './GroupedAudioBubble';
import { useUploadProgressStore } from '../../store/useUploadProgressStore';
import { useShallow } from 'zustand/react/shallow';
import { parseReplyChain, countEmojis, formatTimeOfDay, arrayBufferToBase64 } from '../../utils/messageUtils';
import { useToastStore } from '../../store/useToastStore';
import { MessageItem } from './MessageItem';
import { MessageReactions } from './ReactionBadge';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { groupService } from '../../services/groupService';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { type MediaViewerItem } from './TelegramMediaViewer';
import { channelService, type ChannelPost } from '../../services/channelService';
import { EmojiPicker } from './EmojiPicker';
import { TgsPlayer } from './TgsPlayer';
import { resolveStickerUrl } from '../../lib/stickers-and-gifs';
import { DiscordFileLimitModal } from './DiscordFileLimitModal';
import { SendAsTxtModal } from './SendAsTxtModal';
import { FileAttachmentModal } from './FileAttachmentModal';
import { TelegramMediaViewer } from './TelegramMediaViewer';
import { ActionConfirmModal } from '../common/ActionConfirmModal';
import { useDevicePermissionStore } from '../../store/useDevicePermissionStore';
import { EmptyChatGreeting } from './EmptyChatGreeting';
import { ChannelEmptyCard } from './ChannelEmptyCard';
import { sendEncryptedReadReceipt } from '../../services/receiptService';
import { supportService } from '../../services/supportService';
import { SupportTicketsModal } from './SupportTicketsModal';
import { CustomPinIcon } from './ChatIcons';
export {
  CustomPinIcon,
  CustomUnpinIcon,
  CustomEditIcon,
  CustomReplyIcon,
  CustomClearHistoryIcon,
  CustomMuteIcon,
  CustomUnmuteIcon
} from './ChatIcons';
import { orbitFs } from './chatUtils';
import { CallMessage } from './CallMessage';
import { MessageText } from './MessageText';
import { EncryptedMedia } from './EncryptedMedia';
import { FileMessage } from './FileMessage';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import { MessageContextMenu, clampMenuPosition, type ContextMenuState } from './MessageContextMenu';
import { UnsafeLinkModal } from './UnsafeLinkModal';
import { ChatPinnedBar } from './ChatPinnedBar';
import { ChatHeader } from './ChatHeader';

declare global {
  interface Window {
    _lastSendTime?: number;
  }
}

const MAX_FILE_MB = 10;

const getOptimalMessageBatchSize = (): number => {
  if (typeof window === 'undefined') return 20;
  const height = window.innerHeight || 800;
  const width = window.innerWidth || 1200;

  if (width < 768 || height < 650) {
    return 20;
  }
  if (height < 900) {
    return 25;
  }
  if (height < 1200) {
    return 30;
  }
  return 35;
};

const MessageRowWrapper = memo(
  ({ index, msg, renderFn }: { index: number; msg: Message; renderFn: (i: number, m: Message) => React.ReactNode }) =>
    renderFn(index, msg) as React.ReactElement,
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.status === next.msg.status &&
    prev.msg.text === next.msg.text &&
    prev.msg.reactions === next.msg.reactions &&
    prev.msg.time === next.msg.time &&
    prev.renderFn === next.renderFn
);
MessageRowWrapper.displayName = 'MessageRowWrapper';

const MessageList = memo(
  ({
    messages,
    startIndex,
    renderFn,
  }: {
    messages: Message[];
    startIndex: number;
    renderFn: (i: number, m: Message) => React.ReactNode;
  }) => {
    const virtualTopHeight = startIndex > 0 ? startIndex * 46 : 0;
    return (
      <>
        {virtualTopHeight > 0 ? (
          <div style={{ height: `${virtualTopHeight}px`, flexShrink: 0 }} />
        ) : (
          <div style={{ flex: '1 1 auto', minHeight: '8px' }} />
        )}
        {messages.map((msg, idx) => (
          <MessageRowWrapper
            key={msg.id || `msg_${msg.time}_${startIndex + idx}`}
            index={startIndex + idx}
            msg={msg}
            renderFn={renderFn}
          />
        ))}
      </>
    );
  },
  (prev, next) =>
    prev.messages === next.messages &&
    prev.startIndex === next.startIndex
);
MessageList.displayName = 'MessageList';

const EMPTY_ARRAY: Message[] = [];

const parseMedia = (msg: Message): { type: 'image' | 'video' | 'audio' | 'music' | 'voice' | 'file' | 'call' | 'sticker' | 'gif' | null; url: string | null; fileName?: string; mime?: string; size?: number } => {
  if (msg.mediaType === 'call') {
    return { type: 'call', url: null, fileName: msg.mediaName };
  }

  if (msg.mediaItems && msg.mediaItems.length > 0) {
    const first = msg.mediaItems[0];
    const type = first.type === 'video' ? 'video' : first.type === 'audio' ? 'music' : first.type === 'file' ? 'file' : 'image';
    return { type, url: first.url, fileName: first.name, mime: first.mime };
  }

  const isVoice =
    msg.mediaType === 'voice' ||
    (msg.mime && (msg.mime.includes('ogg') || msg.mime.includes('opus'))) ||
    (msg.mediaName && (/^voice_/i.test(msg.mediaName) || /\.ogg$/i.test(msg.mediaName) || /\.opus$/i.test(msg.mediaName))) ||
    (msg.text && (/^\[Audio\]\s+voice_/i.test(msg.text) || /^voice_\d+\.ogg/i.test(msg.text.trim()) || /\.ogg(\?.*)?$/i.test(msg.text.trim()) || /^\[Audio\]\s+\S+\.ogg/i.test(msg.text))) ||
    (msg.mediaUrl && (/voice_\d+\.(ogg|opus|webm)/i.test(msg.mediaUrl) || /\.ogg(\?.*)?$/i.test(msg.mediaUrl) || /\.opus(\?.*)?$/i.test(msg.mediaUrl)));

  if (isVoice) {
    const url = msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || null;
    const fileName = msg.mediaName || msg.text?.match(/voice_\S+/)?.[0] || 'voice.ogg';
    return { type: 'voice', url, fileName, mime: msg.mime || (fileName.endsWith('.webm') ? 'audio/webm' : 'audio/ogg') };
  }

  if (msg.mediaType && (msg.mediaUrl || msg.uploading)) {
    if (msg.mediaType === 'photo') return { type: 'image', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
    if (msg.mediaType === 'video') return { type: 'video', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };
    if (msg.mediaType === 'audio') return { type: 'music', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'audio/mpeg' };
    if (msg.mediaType === 'file') return { type: 'file', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'application/octet-stream', size: msg.fileSize || (msg as any).size || (msg as any).file_size };
    if (msg.mediaType === ('sticker' as any)) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || null), fileName: msg.mediaName, mime: msg.mime || (msg.mediaUrl?.endsWith('.tgs') ? 'application/x-tgsticker' : 'image/webp') };
    if (msg.mediaType === 'gif') return { type: 'gif', url: msg.mediaUrl || null, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const text = msg.text || '';
  const stickerMatch = text.match(/^\[Sticker\]\s*(\S+.*)$/i);
  if (stickerMatch) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || stickerMatch[1].trim()), fileName: msg.mediaName, mime: msg.mime || (stickerMatch[1].trim().endsWith('.tgs') ? 'application/x-tgsticker' : 'image/webp') };
  const stickerMatchGeneric = text.match(/^\[Sticker\]/i);
  if (stickerMatchGeneric) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || null), fileName: msg.mediaName, mime: msg.mime || 'image/webp' };

  const gifMatch = text.match(/^\[GIF\]\s*(.+)$/i);
  if (gifMatch) return { type: 'gif', url: gifMatch[1].trim(), fileName: msg.mediaName || 'animation.mp4', mime: 'video/mp4' };

  const isGifMsg =
    (msg.mime === 'image/gif' && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaName && /\.gif$/i.test(msg.mediaName) && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaUrl && (msg.mediaUrl.includes('giphy.com') || msg.mediaUrl.includes('tenor.com')));

  if (isGifMsg) {
    const url = msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || null;
    return { type: 'gif', url, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const imageMatch = text.match(/^\[Photo\]\s*(\S+.*)$/i);
  if (imageMatch) return { type: 'image', url: msg.mediaUrl || imageMatch[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
  const imageMatchGeneric = text.match(/^\[Photo\]/i);
  if (imageMatchGeneric) return { type: 'image', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };

  const videoMatch = text.match(/^\[Video\]\s*(\S+.*)$/i);
  if (videoMatch) return { type: 'video', url: msg.mediaUrl || videoMatch[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };
  const videoMatchGeneric = text.match(/^\[Video\]/i);
  if (videoMatchGeneric) return { type: 'video', url: msg.mediaUrl || null, fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };

  const voiceMatch = text.match(/^\[Audio\]\s+(voice_\S+)\s+(https?:\/\/\S+)\s*$/i);
  if (voiceMatch) return { type: 'voice', url: voiceMatch[2], fileName: voiceMatch[1], mime: msg.mime || (voiceMatch[1].endsWith('.webm') ? 'audio/webm' : 'audio/ogg') };
  const audioMatch = text.match(/^\[Audio\]\s+(.*?)\s+(https?:\/\/\S+)\s*$/i);
  if (audioMatch && !audioMatch[1].match(/^voice_/i) && !audioMatch[1].endsWith('.ogg')) return { type: 'music', url: audioMatch[2], fileName: audioMatch[1], mime: msg.mime || 'audio/mpeg' };
  const audioMatchSingle = text.match(/^\[Audio\]\s+(\S+.*)$/i);
  if (audioMatchSingle) return { type: 'music', url: msg.mediaUrl || audioMatchSingle[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'audio/mpeg' };

  const fileMatch = text.match(/^\[File\]\s+(.*?)\s+(https?:\/\/\S+)\s*$/i);
  if (fileMatch) return { type: 'file', url: fileMatch[2], fileName: fileMatch[1], mime: msg.mime || 'application/octet-stream' };
  const fileMatchSingle = text.match(/^\[File\]\s+(\S+.*)$/i);
  if (fileMatchSingle) return { type: 'file', url: msg.mediaUrl || fileMatchSingle[1].trim(), fileName: msg.mediaName, mime: msg.mime || 'application/octet-stream' };

  return { type: null, url: null };
};

function generateEphemeralKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < 32; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

async function deriveFileKey(sharedSecret: string): Promise<CryptoKey> {
  const cleanHex = sharedSecret.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HKDF' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('orbita-file-key'), info: new TextEncoder().encode('file-encryption') },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptFile(file: ArrayBuffer, keyHex: string): Promise<Blob> {
  if (window.orbita?.rustEncryptFile) {
    try {
      const encrypted = await window.orbita.rustEncryptFile(file, keyHex);
      if (encrypted) {
        return new Blob([encrypted as unknown as BlobPart], { type: 'application/octet-stream' });
      }
    } catch (e) {
      console.warn('[ChatWindow] Rust encryptFile fallback:', e);
    }
  }
  const cleanHex = keyHex.trim().toLowerCase();
  const len = Math.floor(cleanHex.length / 2);
  const raw = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    raw[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  let key: CryptoKey;
  if (raw.length === 32) {
    try {
      key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
    } catch {
      key = await deriveFileKey(keyHex);
    }
  } else {
    key = await deriveFileKey(keyHex);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, file);
  const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.byteLength);
  return new Blob([result as unknown as BlobPart], { type: 'application/octet-stream' });
}

const decryptedUrlCache = new Map<string, string>();

interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover?: string | null;
}


interface ChatScrollState {
  scrollTop: number;
  scrollHeight: number;
  atBottom: boolean;
  timestamp: number;
}

const chatScrollRegistry = new Map<string, ChatScrollState>();

const saveChatScroll = (chatId: string, el: HTMLElement) => {
  if (!chatId || !el) return;
  const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  chatScrollRegistry.set(chatId, {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    atBottom: isBottom,
    timestamp: Date.now(),
  });
};

const restoreChatScroll = (chatId: string, el: HTMLElement): boolean => {
  if (!chatId || !el) return false;
  const saved = chatScrollRegistry.get(chatId);
  if (!saved) return false;
  if (saved.atBottom) {
    el.scrollTop = el.scrollHeight;
    return true;
  }
  const diff = el.scrollHeight - saved.scrollHeight;
  const targetTop = Math.max(0, saved.scrollTop + (diff > 0 ? diff : 0));
  el.scrollTop = targetTop;
  return true;
};

interface ChatWindowProps {
  isMobileView?: boolean;
  onBack?: () => void;
}

export const ChatWindow = memo(({ isMobileView = false, onBack }: ChatWindowProps) => {
  const { t, i18n } = useTranslation();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeChat = useChatStore(
    useShallow((s) => {
      const chat = s.chats.find((c) => c.id === activeChatId);
      if (!chat) return undefined;
      return {
        ...chat,
        lastMsg: '',
        updatedAt: 0,
        unreadCount: 0,
        ratchetState: undefined,
      };
    })
  );
  const rawMessages = useChatStore(useShallow((s) => {
    const chatId = activeChatId || '';
    return chatId ? s.messagesByChatId[chatId] || EMPTY_ARRAY : EMPTY_ARRAY;
  }));

  const messages = useMemo(() => {
    let hasAnyLargeMediaGroup = false;
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      if (m.mediaItems && m.mediaItems.length > 10) {
        hasAnyLargeMediaGroup = true;
        break;
      }
    }
    if (!hasAnyLargeMediaGroup) return rawMessages;

    const result: Message[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i];
      if (msg.mediaItems && msg.mediaItems.length > 10) {
        for (let j = 0; j < msg.mediaItems.length; j += 10) {
          const chunk = msg.mediaItems.slice(j, j + 10);
          const isFirst = j === 0;
          result.push({
            ...msg,
            id: isFirst ? msg.id : `${msg.id}_part_${Math.floor(j / 10)}`,
            mediaItems: chunk,
            text: isFirst ? msg.text : '',
            time: msg.time + Math.floor(j / 10),
          });
        }
      } else {
        result.push(msg);
      }
    }
    return result;
  }, [rawMessages]);

  const [renderedCount, setRenderedCount] = useState<number>(getOptimalMessageBatchSize);
  const [prevChatId, setPrevChatId] = useState<string | null>(activeChatId);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);

  if (prevChatId !== activeChatId) {
    setPrevChatId(activeChatId);
    setRenderedCount(getOptimalMessageBatchSize());
  }

  useEffect(() => {
    decryptedUrlCache.clear();
    prevScrollHeightRef.current = null;
    prevScrollTopRef.current = null;
  }, [activeChatId]);

  const hasMoreAbove = messages.length > renderedCount;
  const startIndex = hasMoreAbove ? messages.length - renderedCount : 0;
  const visibleMessages = useMemo(() => {
    if (!hasMoreAbove) return messages;
    return messages.slice(startIndex);
  }, [messages, hasMoreAbove, startIndex]);

  const loadMoreAbove = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || !hasMoreAbove) return;
    prevScrollHeightRef.current = el.scrollHeight;
    prevScrollTopRef.current = el.scrollTop;
    const batch = getOptimalMessageBatchSize();
    setRenderedCount((prev) => Math.min(messages.length, prev + batch));
  }, [hasMoreAbove, messages.length]);

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && prevScrollTopRef.current !== null && messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      if (diff !== 0) {
        el.scrollTop = prevScrollTopRef.current + diff;
      }
      prevScrollHeightRef.current = null;
      prevScrollTopRef.current = null;
    }
  }, [renderedCount]);

  const addMessage = useChatStore((s) => s.addMessage);
  const updateChat = useChatStore((s) => s.updateChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const setActiveProfileChatId = useChatStore((s) => s.setActiveProfileChatId);
  const myNickname = useAuthStore((s) => s.nickname) || 'YOU';
  const myAvatarUrl = useAuthStore((s) => s.avatarUrl);
  const myUserId = useAuthStore((s) => s.userId);
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const voiceCallsEnabled = useChatStore((s) => s.voiceCallsEnabled);
  const typingIndicatorsEnabled = useChatStore((s) => s.typingIndicatorsEnabled);
  const readReceiptsEnabled = useChatStore((s) => s.readReceiptsEnabled);
  const myCode = useChatStore((s) => s.myCode);

  const [inputText, setInputText] = useState('');
  const [isDiscordFileLimitModalOpen, setIsDiscordFileLimitModalOpen] = useState(false);
  const [isSendAsTxtModalOpen, setIsSendAsTxtModalOpen] = useState(false);
  const [isSupportTicketsModalOpen, setIsSupportTicketsModalOpen] = useState(false);
  const [unsafeLinkData, setUnsafeLinkData] = useState<{ isOpen: boolean; url: string }>({ isOpen: false, url: '' });
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  useEffect(() => {
    const handleReplyTicketEvent = (e: any) => {
      const tNum = e?.detail?.ticketNumber;
      if (tNum) {
        setInputText(`/reply ${tNum} `);
      }
    };
    window.addEventListener('orbita:reply-ticket', handleReplyTicketEvent);
    return () => window.removeEventListener('orbita:reply-ticket', handleReplyTicketEvent);
  }, []);

  const emojiHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLinkClick = useCallback((url: string) => {
    const cleanUrl = url.trim();
    const groupCode = extractGroupCode(cleanUrl);
    if (groupCode && isValidGroupCode(groupCode)) {
      window.dispatchEvent(new CustomEvent('orbita:deep-link', { detail: { url: cleanUrl } }));
      return;
    }
    const channelMatch = cleanUrl.match(/\/(?:c|channel)\/([A-Z0-9_-]{10,})/i);
    if (channelMatch && channelMatch[1]) {
      const chId = channelMatch[1];
      const existing = useChatStore.getState().chats.find((c) => c.id === chId);
      if (existing) {
        useChatStore.getState().setActiveChat(chId);
      } else {
        channelService.getChannel(chId).then((info) => {
          if (info) {
            useChatStore.getState().addChat({
              id: info.id,
              type: 'channel',
              name: info.name,
              description: info.description || '',
              lastMsg: '',
              online: false,
              creatorNickname: info.creatorNickname,
              creatorId: info.creatorId || undefined,
              avatarUrl: info.avatarUrl || undefined,
              subscribersCount: info.subscribersCount || 1,
              isOfficial: info.isOfficial,
              createdAt: info.createdAt || Date.now(),
              unreadCount: 0,
              lastReadTimestamp: Date.now(),
              muted: false,
              notificationsEnabled: true,
            });
            useChatStore.getState().setActiveChat(info.id);
          }
        });
      }
      return;
    }
    setUnsafeLinkData({ isOpen: true, url: cleanUrl });
  }, []);

  const handleEmojiMouseEnter = useCallback(() => {
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    if (!useChatStore.getState().isEmojiPanelOpen) {
      if (emojiHoverOpenTimerRef.current) clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = setTimeout(() => {
        useChatStore.getState().setEmojiPanelOpen(true);
      }, 200);
    }
  }, []);

  const handleEmojiMouseLeave = useCallback(() => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (useChatStore.getState().isEmojiPanelOpen) {
      if (emojiHoverCloseTimerRef.current) clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = setTimeout(() => {
        useChatStore.getState().setEmojiPanelOpen(false);
      }, 150);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (emojiHoverOpenTimerRef.current) clearTimeout(emojiHoverOpenTimerRef.current);
      if (emojiHoverCloseTimerRef.current) clearTimeout(emojiHoverCloseTimerRef.current);
    };
  }, []);

  const draftsByChatId = useChatStore((s) => s.draftsByChatId);
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);

  useEffect(() => {
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) {
      const savedDraft = draftsByChatId[activeChatId] || '';
      setInputText(savedDraft);
    } else {
      setInputText('');
    }
    return () => {
      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
        draftDebounceTimerRef.current = null;
      }
    };
  }, [activeChatId]);

  useEffect(() => {
    if (activeChat?.type === 'group' && activeChatId) {
      groupService.getGroup(activeChatId).then((info) => {
        if (info && info.members && info.members.length > 0) {
          useChatStore.getState().updateChat(activeChatId, {
            members: info.members as any[],
            membersCount: Math.max(info.membersCount || 0, info.members.length),
          });
        }
      }).catch(() => {});
    }
  }, [activeChatId, activeChat?.type]);

  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!activeChat || activeChat.type !== 'group' || !activeChat.members) return;
    let isMounted = true;
    activeChat.members.forEach((m) => {
      const code = m.userId || (m as any).userCode;
      const nick = m.nickname?.toLowerCase().trim();
      if (!code && !nick) return;
      if (m.avatarUrl || (m as any).avatar_url) return;
      if (code && memberAvatars[code]) return;
      if (nick && memberAvatars[nick]) return;

      const lookupKey = code || m.nickname;
      if (lookupKey) {
        supabaseService.lookupPublicProfile(lookupKey).then((profile) => {
          if (isMounted && profile?.avatar_url) {
            setMemberAvatars((prev) => {
              const next = { ...prev };
              if (code) next[code] = profile.avatar_url!;
              if (nick) next[nick] = profile.avatar_url!;
              return next;
            });
            const updatedMembers = (activeChat.members || []).map((mem) => {
              const memCode = mem.userId || (mem as any).userCode;
              if ((code && memCode === code) || (nick && mem.nickname?.toLowerCase().trim() === nick)) {
                return { ...mem, avatarUrl: profile.avatar_url };
              }
              return mem;
            });
            useChatStore.getState().updateChat(activeChat.id, { members: updatedMembers });
          }
        }).catch(() => {});
      }
    });
    return () => {
      isMounted = false;
    };
  }, [activeChat?.id, activeChat?.type, activeChat?.members, memberAvatars]);

  const handleOpenDirectChat = useCallback((senderId?: string, senderName?: string, memberObj?: any) => {
    const chatStore = useChatStore.getState();
    const myCode = chatStore.myCode;
    const myNickname = useAuthStore.getState().nickname;
    const myUserId = useAuthStore.getState().userId;

    const targetCode = memberObj?.userCode || memberObj?.userId || (senderId && senderId !== myCode && senderId !== myUserId ? senderId : null);
    const targetName = senderName || memberObj?.nickname || targetCode;
    const targetAvatar = memberObj?.avatarUrl || memberObj?.avatar_url || (targetCode ? memberAvatars[targetCode] : null) || (targetName ? memberAvatars[targetName.toLowerCase().trim()] : null) || null;

    if (!targetCode && !targetName) return;

    if (
      (targetCode && (targetCode === myCode || targetCode === myUserId)) ||
      (targetName && myNickname && targetName.toLowerCase().trim() === myNickname.toLowerCase().trim())
    ) {
      return;
    }

    const existing = chatStore.chats.find(
      (c) =>
        c.type === 'private' &&
        ((targetCode && (c.peerCode === targetCode || c.originalPeerCode === targetCode || c.name === targetCode)) ||
          (targetName && c.name?.toLowerCase().trim() === targetName.toLowerCase().trim()))
    );

    if (existing) {
      chatStore.setActiveChat(existing.id);
    } else {
      const myKeys = generateKeyPair();
      const newChatId = generateChatId();
      chatStore.addChat({
        id: newChatId,
        type: 'private',
        name: targetName || targetCode,
        lastMsg: '',
        online: false,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: targetAvatar || undefined,
        peerCode: targetCode || undefined,
        originalPeerCode: targetCode || undefined,
      });
      chatStore.setActiveChat(newChatId);
    }
  }, [memberAvatars]);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSentRef = useRef<boolean>(false);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (activeChatId && activeChatId !== 'notes' && isTypingSentRef.current) {
      ablyService.sendTyping(activeChatId, false);
      isTypingSentRef.current = false;
    }
  }, [activeChatId]);

  const draftDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSetInputText = useCallback((text: string) => {
    setInputText(text);
    if (activeChatId) {
      const currentActiveId = activeChatId;
      if (text) {
        if (draftDebounceTimerRef.current) clearTimeout(draftDebounceTimerRef.current);
        draftDebounceTimerRef.current = setTimeout(() => {
          if (useChatStore.getState().activeChatId === currentActiveId) {
            setDraft(currentActiveId, text);
          }
        }, 500);

        if (activeChatId !== 'notes' && typingIndicatorsEnabled) {
          if (!isTypingSentRef.current) {
            ablyService.sendTyping(activeChatId, true);
            isTypingSentRef.current = true;
          }
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => {
            if (activeChatId && activeChatId !== 'notes') {
              ablyService.sendTyping(activeChatId, false);
            }
            isTypingSentRef.current = false;
          }, 2500);
        }
      } else {
        if (draftDebounceTimerRef.current) {
          clearTimeout(draftDebounceTimerRef.current);
          draftDebounceTimerRef.current = null;
        }
        clearDraft(activeChatId);
        stopTyping();
      }
    }
  }, [activeChatId, setDraft, clearDraft, typingIndicatorsEnabled, stopTyping]);

  useEffect(() => {
    return () => {
      stopTyping();
    };
  }, [activeChatId, stopTyping]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
  const [isSendingFiles, setIsSendingFiles] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditText('');
  }, []);
  const handleOpenTxtModal = useCallback(() => {
    setIsSendAsTxtModalOpen(true);
  }, []);
  const [replyingTo, setReplyingTo] = useState<{ id?: string; senderId?: string; index: number; sender: string; text: string; time: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, messageIndex: -1, isOwn: false, type: 'text', hasMultipleImages: false });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    messageIndex?: number;
    selectedIndices?: number[];
  }>({
    isOpen: false,
    type: null,
  });
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const reactionDebounceTimers = useRef<Map<string, any>>(new Map());
  const [mediaViewerState, setMediaViewerState] = useState<{
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  }>({
    isOpen: false,
    initialIndex: 0,
  });

  const sharedSecret = useMemo(() => {
    if (activeChat?.type === 'channel') {
      return activeChat.sharedSecret || deriveChannelKey(activeChat.id);
    }
    return activeChat?.sharedSecret;
  }, [activeChat?.id, activeChat?.type, activeChat?.sharedSecret]);

  const chatMediaViewerItems = useMemo(() => {
    const list: MediaViewerItem[] = [];
    messages.forEach((msg, msgIdx) => {
      const media = parseMedia(msg);
      if (msg.mediaItems && msg.mediaItems.length > 0) {
        const isAlbum = msg.mediaItems.length > 1;
        const albumGroupId = msg.id || `album_${msgIdx}`;
        msg.mediaItems.forEach((mi, miIdx) => {
          if (mi.type === 'photo' || mi.type === 'video' || mi.type === 'gif') {
            const effectiveSecret = mi.key || msg.mediaKey || sharedSecret;
            const directUrl = getOrbitaMediaUrl(mi.url, effectiveSecret, activeChatId || undefined, msg.id, mi.name || msg.mediaName) || undefined;
            const isMiGif = mi.type === 'gif' || mi.mime === 'image/gif' || /\.gif(\?.*)?$/i.test(mi.name || mi.url || '');
            list.push({
              id: `${msg.id || msgIdx}_${miIdx}`,
              url: mi.url,
              directUrl,
              chatId: activeChatId || undefined,
              type: isMiGif ? 'gif' : (mi.type === 'video' ? 'video' : 'photo'),
              name: mi.name || msg.mediaName,
              sender: msg.sender,
              time: msg.time,
              messageId: msg.id,
              messageIndex: msgIdx,
              duration: mi.duration,
              width: mi.width,
              height: mi.height,
              caption: msg.text,
              isAlbum: isAlbum,
              albumGroupId: isAlbum ? albumGroupId : undefined,
              key: mi.key || msg.mediaKey,
              sharedSecret: effectiveSecret,
            });
          }
        });
      } else if (media.type === 'image' || media.type === 'video' || media.type === 'gif') {
        const isGif = Boolean(
          media.type === 'gif' ||
          msg.mediaType === 'gif' ||
          (media.url && (/\.gif(\?.*)?$/i.test(media.url) || media.url.toLowerCase().includes('.gif'))) ||
          (msg.mediaUrl && (
            /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
            msg.mediaUrl.toLowerCase().includes('.gif') ||
            msg.mediaUrl.includes('tenor.com') ||
            msg.mediaUrl.includes('giphy.com') ||
            msg.mediaUrl.includes('.giphy.') ||
            msg.mediaUrl.includes('c.tenor.com')
          )) ||
          (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
        );
        const effectiveSecret = msg.mediaKey || sharedSecret;
        const mediaUrl = media.url || msg.mediaUrl || '';
        const directUrl = getOrbitaMediaUrl(mediaUrl, effectiveSecret, activeChatId || undefined, msg.id, media.fileName || msg.mediaName) || undefined;
        list.push({
          id: msg.id || `${msg.time}_${msgIdx}`,
          url: mediaUrl,
          directUrl,
          chatId: activeChatId || undefined,
          type: isGif ? 'gif' : (media.type === 'video' ? 'video' : 'photo'),
          name: media.fileName || msg.mediaName,
          sender: msg.sender,
          time: msg.time,
          messageId: msg.id,
          messageIndex: msgIdx,
          duration: msg.duration || msg.audioMetadata?.duration,
          width: msg.width,
          height: msg.height,
          caption: msg.text,
          isAlbum: false,
          key: msg.mediaKey,
          sharedSecret: effectiveSecret,
        });
      }
    });
    return list;
  }, [messages, sharedSecret, activeChatId]);

  const openMediaViewer = useCallback((url: string, messageId?: string, customItems?: MediaViewerItem[], explicitIndex?: number) => {
    const items = customItems || chatMediaViewerItems;
    let index = typeof explicitIndex === 'number' && explicitIndex >= 0 && customItems ? explicitIndex : -1;
    if (index === -1) {
      if (url) {
        index = items.findIndex((it) => it.url === url && (!messageId || it.messageId === messageId));
        if (index === -1) {
          index = items.findIndex((it) => it.url === url);
        }
      }
      if (index === -1 && messageId) {
        index = items.findIndex((it) => it.messageId === messageId);
      }
    }
    const targetMsg = messages.find((m) => m.id === messageId);
    const targetMedia = targetMsg ? parseMedia(targetMsg) : null;
    const isTargetGif = targetMedia?.type === 'gif' || /\.gif(\?.*)?$/i.test(url) || Boolean(url && (url.includes('tenor.com') || url.includes('giphy.com')));
    const isTargetVideo = !isTargetGif && (targetMedia?.type === 'video' || /\.(mp4|mov|avi|webm|mkv|m4v)(\?.*)?$/i.test(url) || Boolean(targetMsg?.mime?.startsWith('video/')));
    const fallbackType = isTargetGif ? ('gif' as const) : (isTargetVideo ? ('video' as const) : ('photo' as const));
    const finalItems = customItems || (index === -1 && items.length === 0 ? [{
      id: messageId || url,
      url,
      directUrl: getOrbitaMediaUrl(url, targetMsg?.mediaKey || sharedSecret, activeChatId || undefined, messageId) || undefined,
      chatId: activeChatId || undefined,
      type: fallbackType,
      time: Date.now(),
      key: targetMsg?.mediaKey,
      sharedSecret: targetMsg?.mediaKey || sharedSecret,
    }] : items);
    const initialIndex = index !== -1 ? index : 0;

    const orbita = (window as any).orbita;
    if (orbita?.openMediaWindow) {
      orbita.openMediaWindow({
        items: finalItems,
        initialIndex,
        sharedSecret,
        chatId: activeChatId,
      });
      return;
    }

    setMediaViewerState({
      isOpen: true,
      initialIndex,
      customItems: customItems || (index === -1 ? finalItems : undefined),
    });
  }, [chatMediaViewerItems, messages, sharedSecret, activeChatId]);
  const {
    isRecording,
    isPaused: isRecordingPaused,
    recordingTime,
    amplitude: recordingAmplitude,
    startRecording: startAudioRecording,
    pauseRecording: pauseAudioRecording,
    resumeRecording: resumeAudioRecording,
    stopRecording: stopAudioRecording,
    cancelRecording: cancelAudioRecording,
  } = useAudioRecorder();
  const atBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const lastChatSwitchTimeRef = useRef(0);

  const unreadCount = useMemo(() => {
    if (!showScrollDown || !messages || messages.length === 0) return 0;
    return messages.filter((m) => !isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId) && !m.read).length;
  }, [showScrollDown, messages, myCode, myNickname, activeChat, myUserId]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const selection = useSelection();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const prevMessagesLengthRef = useRef(messages.length);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !inputRef.current) return;
      const anchorNode = sel.anchorNode;
      if (anchorNode && inputRef.current.contains(anchorNode)) {
        savedSelectionRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const activeChatIdRef = useRef<string | null>(activeChatId);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (activeChatIdRef.current && el && activeChatIdRef.current !== activeChatId) {
      saveChatScroll(activeChatIdRef.current, el);
    }
    activeChatIdRef.current = activeChatId;
    sendQueueRef.current = Promise.resolve();
    setShowScrollDown(false);
    lastChatSwitchTimeRef.current = performance.now();
    if (el && activeChatId) {
      const restored = restoreChatScroll(activeChatId, el);
      if (!restored) {
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
        setShowScrollDown(false);
      } else {
        const isBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
        atBottomRef.current = isBottom;
        setShowScrollDown(!isBottom);
      }
      requestAnimationFrame(() => {
        if (el) {
          const r = restoreChatScroll(activeChatId, el);
          if (!r) el.scrollTop = el.scrollHeight;
        }
      });
      setTimeout(() => {
        if (el) {
          const r = restoreChatScroll(activeChatId, el);
          if (!r) el.scrollTop = el.scrollHeight;
        }
      }, 50);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [activeChatId]);

  useEffect(() => {
    const handleForceScroll = (e?: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      if (!customDetail?.chatId || customDetail.chatId === activeChatId) {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        });
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    };

    window.addEventListener('orbita:scroll-to-bottom', handleForceScroll);
    return () => window.removeEventListener('orbita:scroll-to-bottom', handleForceScroll);
  }, [activeChatId]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const wasAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (wasAdded) {
      const lastMsg = messages[messages.length - 1];
      const isOutgoing = lastMsg && isMessageOutgoing(lastMsg, myCode, myNickname, activeChat, myUserId);
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 180;

      if (isOutgoing || isNearBottom) {
        requestAnimationFrame(() => {
          if (el) {
            el.scrollTop = el.scrollHeight;
            if (activeChatId) {
              saveChatScroll(activeChatId, el);
            }
          }
        });
      }
    }
  }, [messages, myCode, myNickname, activeChat, activeChatId]);

  useEffect(() => {
    if (otherUserTyping) {
      const el = messagesContainerRef.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 180;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [otherUserTyping]);

  useEffect(() => {
    if (activeChatId) {
      inputRef.current?.focus();
    }
  }, [activeChatId]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!activeChatId) return;
      if (useChatStore.getState().currentView !== 'chats') return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || activeEl.isContentEditable) {
          return;
        }
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key.length === 1 || e.key === 'Backspace') {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeChatId]);

  useEffect(() => {
    const handleWindowFocus = () => {
      if (activeChatId && useChatStore.getState().currentView === 'chats') {
        inputRef.current?.focus();
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [activeChatId]);

  const handleChatWindowMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, input, textarea, a, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], .emoji-picker, .modal, .custom-chat-scrollbar, .rich-editor, [contenteditable="true"], .select-text, .message-bubble-selectable, [data-message], [data-message-id]'
      );
      if (isInteractive) {
        return;
      }
    }
  }, []);

  const handleChatWindowClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, input, textarea, a, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], .emoji-picker, .modal, .custom-chat-scrollbar, .rich-editor, [contenteditable="true"], .select-text, .message-bubble-selectable, [data-message], [data-message-id]'
      );
      if (isInteractive) {
        return;
      }
    }

    inputRef.current?.focus();
  }, []);

  const showToast = (message: string) => {
    useToastStore.getState().showToast(message, 'text');
  };

  const isOnline = activeChat?.online ?? false;
  const isServerConnected = useConnectionStore((s) => s.isServerConnected);
  const pinnedMessage = activeChat?.pinnedMessage;
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const [showFloatingDate, setShowFloatingDate] = useState(false);
  const [floatingDateOffsetY, setFloatingDateOffsetY] = useState(0);
  const floatingDateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const themeColor = 'var(--accent-color)';

  const startCall = useCallStore((state) => state.startCall);
  const isUserInCall = useCallStore((state) => state.callState !== 'idle' && state.callState !== 'ended' && !!state.activeCall);

  const handleAudioCallPress = useCallback(async () => {
    if (!activeChatId) return;
    if (activeChatId === 'notes') {
      showToast(t('chatWindow.calls_not_available'));
      return;
    }
    if (!voiceCallsEnabled) {
      showToast(t('settings.voice_calls_disabled'));
      return;
    }
    const micGranted = await useDevicePermissionStore.getState().requestPermission('microphone');
    if (!micGranted) return;
    startCall(activeChatId, 'audio', myNickname).catch((err) => {
      console.error('[Call] Error starting call:', err);
      showToast(t('call.connection_error'));
    });
  }, [activeChatId, myNickname, startCall, t, showToast, voiceCallsEnabled]);

  const handleCallPress = handleAudioCallPress;

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      if (smooth) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      } else {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }
  }, []);

  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIsScrolling = useCallback((scrolling: boolean) => {
    const el = document.querySelector('.custom-chat-scrollbar');
    if (!el) return;
    if (scrolling) {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
      el.classList.add('is-scrolling');
    } else {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = setTimeout(() => {
        el.classList.remove('is-scrolling');
      }, 900);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) clearTimeout(scrollbarTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    readMessageIdsRef.current.clear();
  }, [activeChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.ctrlKey && e.key === 'o') { e.preventDefault(); closeChat(); } };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChat]);

  useEffect(() => {
    const blockBrowserMenu = (e: MouseEvent) => { const target = e.target as HTMLElement; if (!target.closest('[data-message]')) e.preventDefault(); };
    document.addEventListener('contextmenu', blockBrowserMenu);
    return () => document.removeEventListener('contextmenu', blockBrowserMenu);
  }, []);

  const typingRemoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeChatId) return;
    if (activeChatId === 'notes') {
      setOtherUserTyping(false);
      return;
    }
    if (!typingIndicatorsEnabled) {
      setOtherUserTyping(false);
      return;
    }
    const typingUnsubscribe = ablyService.subscribeToTyping(activeChatId, (userId, isTyping) => {
      const isSelf = Boolean((myCode && userId === myCode) || (userId === myNickname && activeChat?.type !== 'private'));
      if (!isSelf) {
        if (isTyping) {
          setOtherUserTyping(true);
          if (typingRemoteTimeoutRef.current) clearTimeout(typingRemoteTimeoutRef.current);
          typingRemoteTimeoutRef.current = setTimeout(() => {
            setOtherUserTyping(false);
          }, 3500);
        } else {
          if (typingRemoteTimeoutRef.current) clearTimeout(typingRemoteTimeoutRef.current);
          setOtherUserTyping(false);
        }
      }
    });
    return () => {
      if (typingRemoteTimeoutRef.current) clearTimeout(typingRemoteTimeoutRef.current);
      typingUnsubscribe();
      setOtherUserTyping(false);
    };
  }, [activeChatId, myCode, myNickname, activeChat, typingIndicatorsEnabled]);

  useEffect(() => {
    if (!activeChatId) return;
    const currentChat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
    if (currentChat?.type !== 'channel') return;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = window.localStorage.getItem(`orbita_channel_posts_${activeChatId}`);
        if (cachedStr) {
          const cachedPosts: ChannelPost[] = JSON.parse(cachedStr);
          if (Array.isArray(cachedPosts) && cachedPosts.length > 0) {
            const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId];
            if (!currentMsgs || currentMsgs.length === 0) {
              const myNick = myNickname;
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: cachedPosts.map((post) => {
                    const isMine = (myUserId && post.senderId) ? post.senderId === myUserId : (myNick ? post.sender === myNick : false);
                    return {
                      id: post.id,
                      sender: post.sender,
                      senderId: post.senderId,
                      text: post.text,
                      time: post.time,
                      read: true,
                      status: isMine ? 'read' : undefined,
                      isOutgoing: isMine,
                      mediaType: post.mediaType || undefined,
                      mediaUrl: post.mediaUrl || undefined,
                      mediaName: post.mediaName || undefined,
                      mime: post.mime || undefined,
                      duration: post.duration || undefined,
                      width: post.width || undefined,
                      height: post.height || undefined,
                      waveform: post.waveform || undefined,
                      audioMetadata: post.audioMetadata || undefined,
                      linkPreview: post.linkPreview || undefined,
                      reactions: post.reactions || undefined,
                    };
                  }),
                },
              }));
            }
          }
        }
      }
    } catch {}

    const targetChannelId = activeChatId;
    channelService.getChannelPosts(targetChannelId).then((posts) => {
      if (posts) {
        useChatStore.setState((state) => {
          if (useChatStore.getState().activeChatId !== targetChannelId) return state;
          const currentMsgs = state.messagesByChatId[targetChannelId] || [];
          const fetchedIds = new Set(posts.map((p) => p.id));
          const existingIds = new Set<string>();

          const validExisting = currentMsgs.filter((m) =>
            !m.id || fetchedIds.has(m.id) || m.isOutgoing || (Date.now() - (m.time || 0) < 60000)
          );

          const updatedExisting = validExisting.map((m) => {
            const fetched = posts.find(
              (p) =>
                p.id === m.id ||
                (m.isOutgoing &&
                  ((m.senderId && p.senderId && m.senderId === p.senderId) || m.sender === p.sender) &&
                  ((p.text && m.text === p.text) || (p.mediaUrl && m.mediaUrl === p.mediaUrl) || (p.mediaName && m.mediaName === p.mediaName)) &&
                  Math.abs(m.time - (p.time || 0)) < 60000)
            );
            if (fetched) {
              existingIds.add(fetched.id);
              return {
                ...m,
                id: fetched.id,
                text: fetched.text || m.text,
                time: fetched.time || m.time,
                reactions: fetched.reactions || m.reactions,
                status: 'read' as const,
              };
            }
            if (m.id) existingIds.add(m.id);
            return m;
          });

          const newItems: Message[] = [];
          posts.forEach((post) => {
            if (!existingIds.has(post.id)) {
              const isMine = (myUserId && post.senderId) ? post.senderId === myUserId : (myNickname ? post.sender === myNickname : false);
              const safeTime = (typeof post.time === 'number' && !isNaN(post.time) && post.time > 0) ? post.time : Date.now();
              newItems.push({
                id: post.id,
                sender: post.sender,
                senderId: post.senderId,
                text: post.text,
                time: safeTime,
                read: true,
                status: isMine ? 'read' : undefined,
                isOutgoing: isMine,
                mediaType: post.mediaType || undefined,
                mediaUrl: post.mediaUrl || undefined,
                mediaName: post.mediaName || undefined,
                mime: post.mime || undefined,
                duration: post.duration || undefined,
                width: post.width || undefined,
                height: post.height || undefined,
                waveform: post.waveform || undefined,
                audioMetadata: post.audioMetadata || undefined,
                linkPreview: post.linkPreview || undefined,
                reactions: post.reactions || undefined,
              });
            }
          });

          const merged = [...updatedExisting, ...newItems].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
          const staleOptimistics = (state.messagesByChatId[targetChannelId] || []).filter(
            (m) => m.status === 'sending' && m.id != null && !fetchedIds.has(m.id) && (Date.now() - (m.time || 0)) > 120000
          );
          staleOptimistics.forEach((m) => {
            try {
              (window as any).orbita?.storageDeleteMessage?.(m.id).catch(() => {});
            } catch {}
          });
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetChannelId]: merged,
            },
          };
        });
      }
    });
  }, [activeChatId]);

  const isChannelOwner = useMemo(() => {
    if (activeChat?.type !== 'channel') return false;
    if (activeChat.isOwner) return true;
    if (activeChat.role === 'owner' || activeChat.role === 'admin') return true;
    if (myUserId) {
      if (activeChat.creatorId && activeChat.creatorId === myUserId) return true;
      if (activeChat.members?.some((m) => m.userId === myUserId && (m.role === 'owner' || m.role === 'admin'))) return true;
    }
    return false;
  }, [activeChat, myUserId]);

  useEffect(() => {
    if (activeChat?.type === 'channel' && !activeChat.isOwner && isChannelOwner) {
      useChatStore.getState().updateChat(activeChat.id, { isOwner: true });
    }
  }, [activeChat?.id, activeChat?.type, activeChat?.isOwner, isChannelOwner]);

  const handleMediaGoToMessage = useCallback((msgId: string) => {
    const el = document.querySelector(`[data-message-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx !== -1) {
        setHighlightedIndex(idx);
        setTimeout(() => setHighlightedIndex(null), 2000);
      }
    }
  }, [messages]);

  const handleMediaForwardMessage = useCallback((msgId: string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const msg = messages.find((m) => m.id === msgId);
    if (msg) {
      setReplyingTo({
        id: msg.id,
        index: messages.indexOf(msg),
        sender: msg.sender,
        text: msg.text,
        time: msg.time,
      });
    }
  }, [activeChat?.type, isChannelOwner, messages]);

  const handleMediaDeleteMessage = useCallback((msgId: string) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    if (activeChatId) {
      useChatStore.getState().deleteMessage(activeChatId, msgId);
      const payload = {
        sender: myNickname,
        text: '',
        type: 'delete-message',
        targetMessageId: msgId,
      };
      ablyService.sendMessage(activeChatId, payload).catch(() => {});
      const isGroup = activeChat?.type === 'group';
      const pusher = isGroup ? getGroupPusher() : getPusher();
      const channel = pusher.subscribe(
        activeChat?.type === 'channel'
          ? `public-channel-${activeChatId}`
          : isGroup
          ? `presence-group-${activeChatId}`
          : `private-chat-${activeChatId}`
      );
      const send = () => {
        channel.trigger('client-message', payload);
      };
      if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
      if (activeChat?.type === 'channel') {
        channelService.deletePost(activeChatId, msgId, myUserId);
      } else {
        const recipientTargets = Array.from(new Set([
          activeChat?.peerCode,
          activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
        ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
        for (const rId of recipientTargets) {
          supabaseService.deleteMessage(activeChatId, msgId, rId, myCode).catch(() => {});
        }
      }
    }
  }, [activeChat?.type, activeChat?.peerCode, activeChat?.name, activeChatId, isChannelOwner, myCode, myNickname, myUserId]);

  useEffect(() => {
    const handleAction = (action: any) => {
      if (!action) return;
      if (action.chatId && action.chatId !== activeChatId) return;
      if (action.type === 'GOTO_MESSAGE' && action.messageId) {
        handleMediaGoToMessage(action.messageId);
      } else if (action.type === 'FORWARD_MESSAGE' && action.messageId) {
        handleMediaForwardMessage(action.messageId);
      } else if (action.type === 'DELETE_MESSAGE' && action.messageId) {
        handleMediaDeleteMessage(action.messageId);
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('orbita-media-action-channel');
      bc.onmessage = (e) => handleAction(e.data);
    } catch {}

    const orbita = (window as any).orbita;
    const unsub = orbita?.onMediaAction?.((action: any) => handleAction(action));

    return () => {
      bc?.close();
      unsub?.();
    };
  }, [activeChatId, handleMediaGoToMessage, handleMediaForwardMessage, handleMediaDeleteMessage]);

  const isSubscribed = useMemo(() => {
    if (activeChat?.type !== 'channel') return true;
    if (isChannelOwner) return true;
    return activeChat?.isSubscribed !== false;
  }, [activeChat?.type, activeChat?.isSubscribed, isChannelOwner]);

  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleSubscribeToChannel = useCallback(async () => {
    if (!activeChatId || isSubscribing) return;
    setIsSubscribing(true);
    try {
      const newCount = await channelService.joinChannel(activeChatId, myNickname || 'User');
      const currentCount = activeChat?.subscribersCount || 1;
      const finalCount = typeof newCount === 'number' ? newCount : currentCount + 1;
      useChatStore.getState().updateChat(activeChatId, {
        isSubscribed: true,
        subscribersCount: finalCount,
      });
      try {
        ablyService.sendMessage(`public-channel-${activeChatId}`, {
          type: 'subscribers-updated',
          channelId: activeChatId,
          subscribersCount: finalCount,
          action: 'join',
          nickname: myNickname,
        }).catch(() => {});
      } catch {}
    } catch {} finally {
      setIsSubscribing(false);
    }
  }, [activeChatId, isSubscribing, myNickname, activeChat?.subscribersCount]);

  useEffect(() => {
    if (activeChat?.type !== 'channel' || !activeChatId) return;
    const encryptedMsgs = messages.filter((m) => m.text?.startsWith('orb_e2e:'));
    if (encryptedMsgs.length === 0) return;

    const channelKey = deriveChannelKey(activeChatId);
    Promise.all(
      encryptedMsgs.map(async (m) => {
        const plain = await decryptMessage(m.text.slice(8), channelKey);
        return {
          id: m.id,
          text: plain && plain !== '[ENCRYPTED MESSAGE]' ? plain : m.text,
        };
      })
    ).then((decryptedList) => {
      const decMap = new Map(decryptedList.map((d) => [d.id, d.text]));
      useChatStore.setState((state) => {
        const list = state.messagesByChatId[activeChatId] || [];
        let hasChanges = false;
        const updated = list.map((m) => {
          if (decMap.has(m.id)) {
            const newText = decMap.get(m.id)!;
            if (newText !== m.text) {
              hasChanges = true;
              return { ...m, text: newText };
            }
          }
          return m;
        });
        if (!hasChanges) return state;
        return {
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        };
      });
    });
  }, [activeChatId, activeChat?.type, messages]);

  const handleMessageButtonClick = useCallback((btn: { text: string; action: string; channelId?: string; url?: string; data?: string }) => {
    if (btn.action === 'open_channel' && btn.channelId) {
      const channelId = btn.channelId.trim();
      const existing = useChatStore.getState().chats.find((c) => c.id === channelId);
      if (existing) {
        useChatStore.getState().setActiveChat(channelId);
      } else {
        channelService.getChannel(channelId).then((info) => {
          if (info) {
            useChatStore.getState().addChannelChat({
              id: info.id,
              name: info.name,
              description: info.description,
              avatarUrl: info.avatarUrl,
              creatorNickname: info.creatorNickname,
              subscribersCount: info.subscribersCount,
              isOfficial: info.isOfficial,
              isOwner: false,
              isSubscribed: false,
            });
            useChatStore.getState().setActiveChat(channelId);
          } else {
            useChatStore.getState().setActiveChat(channelId);
          }
        }).catch(() => {
          useChatStore.getState().setActiveChat(channelId);
        });
      }
      return;
    }

    if (btn.action === 'open_backup') {
      useChatStore.getState().openSettings('backup');
      return;
    }

    if (btn.action === 'send_command') {
      return;
    }

    if (btn.action === 'reply_ticket' && btn.data) {
      setInputText(`/reply ${btn.data} `);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return;
    }

    if (btn.action === 'close_ticket' && btn.data) {
      supportService.closeTicket(btn.data);
      return;
    }

    if (btn.action === 'open_url' && btn.url) {
      window.open(btn.url, '_blank', 'noopener,noreferrer');
      return;
    }
  }, [t]);

  useEffect(() => {
    if (!activeChatId) return;
    if (activeChatId === 'notes') return; // для заметок не обрабатываем вставку
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          let ext = item.type.split('/')[1] || 'png';
          if (ext === 'jpeg') ext = 'jpg';
          const fileName = `image.${ext}`;
          const arrayBuffer = await file.arrayBuffer();
          const sizeMb = arrayBuffer.byteLength / (1024 * 1024);
          if (sizeMb > MAX_FILE_MB) {
            setIsDiscordFileLimitModalOpen(true);
            return;
          }
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });
          const preview = `data:${item.type};base64,${base64}`;
          const tempPath = await window.orbita.writeTempFile(base64);
          if (!tempPath) return;

          let dimensions: { width?: number; height?: number } = {};
          try {
            const img = new Image();
            img.src = preview;
            await new Promise((r) => { img.onload = r; img.onerror = r; });
            if (img.width && img.height) {
              dimensions = { width: img.width, height: img.height };
            }
          } catch { }

          setAttachedFiles(prev => [...prev, {
            filePath: tempPath,
            preview,
            name: fileName,
            sizeMb,
            fileType: 'photo',
            uploadedMb: 0,
            uploading: false,
            error: null,
            uploadedUrl: null,
            width: dimensions.width,
            height: dimensions.height,
          }]);
          if (!isAttachmentModalOpen) {
            setIsAttachmentModalOpen(true);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeChatId, sharedSecret, t]);

  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragOver && e.dataTransfer?.types?.includes('Files')) {
      setIsDragOver(true);
    }
  }, [isDragOver]);

  const handleDropFiles = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles || droppedFiles.length === 0) return;

    const newFiles: AttachedFile[] = [];

    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles[i];
      const rawPath = window.orbita?.getPathForFile?.(file) || (file as any).path || '';
      const fileName = file.name || (rawPath ? rawPath.split(/[\\/]/).pop() : 'file') || 'file';
      const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
      let fileType: 'photo' | 'video' | 'audio' | 'document' = 'document';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || file.type.startsWith('image/')) fileType = 'photo';
      else if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext) || file.type.startsWith('video/')) fileType = 'video';
      else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac'].includes(ext) || file.type.startsWith('audio/')) fileType = 'audio';

      const arrayBuffer = await file.arrayBuffer();
      const sizeMb = arrayBuffer.byteLength / (1024 * 1024);

      if (sizeMb > MAX_FILE_MB) {
        setIsDiscordFileLimitModalOpen(true);
        continue;
      }

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      let tempPath = rawPath;
      if (!tempPath && window.orbita?.writeTempFile) {
        try {
          tempPath = await window.orbita.writeTempFile(base64, ext);
        } catch {}
      }

      let preview: string | null = null;
      let dimensions: { width?: number; height?: number } = {};
      let blurPreview: string | undefined = undefined;
      let videoDuration: number | undefined = undefined;

      if (fileType === 'photo') {
        preview = `data:${file.type || 'image/jpeg'};base64,${base64}`;
        try {
          const img = new Image();
          img.src = preview;
          await new Promise((r) => { img.onload = r; img.onerror = r; });
          if (img.width && img.height) {
            dimensions = { width: img.width, height: img.height };
            try {
              const canvas = document.createElement('canvas');
              const scale = Math.min(24 / img.width, 24 / img.height, 1);
              canvas.width = Math.max(1, Math.round(img.width * scale));
              canvas.height = Math.max(1, Math.round(img.height * scale));
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                blurPreview = canvas.toDataURL('image/jpeg', 0.4);
              }
            } catch {}
          }
        } catch { }
      } else if (fileType === 'video') {
        try {
          const vUrl = URL.createObjectURL(file);
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.muted = true;
          v.playsInline = true;
          v.src = vUrl;
          await new Promise<void>((res) => {
            v.onloadedmetadata = () => {
              if (v.duration && isFinite(v.duration)) {
                videoDuration = Math.round(v.duration);
              }
              if (v.videoWidth && v.videoHeight) {
                dimensions = { width: v.videoWidth, height: v.videoHeight };
              }
              v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
            };
            v.onseeked = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(640, v.videoWidth || 320);
                canvas.height = Math.round(canvas.width * ((v.videoHeight || 180) / (v.videoWidth || 320)));
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                  const frameData = canvas.toDataURL('image/jpeg', 0.7);
                  preview = frameData;
                  blurPreview = frameData;
                }
              } catch {}
              res();
            };
            v.onerror = () => res();
            setTimeout(res, 1500);
          });
          URL.revokeObjectURL(vUrl);
        } catch {
          preview = `data:${file.type || 'video/mp4'};base64,${base64}`;
        }
      }

      let audioMetadata: AudioMetadata | undefined = undefined;
      if (fileType === 'audio') {
        if (rawPath && window.orbita?.getAudioMetadata) {
          try {
            const metadata = await window.orbita.getAudioMetadata(rawPath);
            audioMetadata = {
              title: metadata.title || fileName.replace(/\.[^.]+$/, ''),
              artist: metadata.artist || '',
              duration: metadata.duration || 0,
              size: metadata.size || (sizeMb * 1024 * 1024),
              cover: metadata.cover || null,
            };
          } catch {}
        }
        if (!audioMetadata) {
          audioMetadata = {
            title: fileName.replace(/\.[^.]+$/, ''),
            artist: '',
            duration: 0,
            size: sizeMb * 1024 * 1024,
            cover: null,
          };
        }
        if (!audioMetadata.duration) {
          try {
            const audioDataUrl = `data:${file.type || 'audio/mpeg'};base64,${base64}`;
            const dur = await new Promise<number>((res) => {
              const a = new Audio();
              a.preload = 'metadata';
              a.onloadedmetadata = () => res(a.duration || 0);
              a.onerror = () => res(0);
              a.src = audioDataUrl;
            });
            if (dur > 0) {
              audioMetadata.duration = Math.round(dur);
            }
          } catch {}
        }
        if (!audioMetadata.cover && typeof window.jsmediatags !== 'undefined') {
          try {
            await new Promise<void>((res) => {
              window.jsmediatags.read(file, {
                onSuccess: (tag: any) => {
                  const tags = tag.tags;
                  if (tags && audioMetadata) {
                    if (tags.title && audioMetadata.title === fileName.replace(/\.[^.]+$/, '')) {
                      audioMetadata.title = tags.title;
                    }
                    if (tags.artist && !audioMetadata.artist) {
                      audioMetadata.artist = tags.artist;
                    }
                    const pic = tags.picture;
                    if (pic && pic.data && pic.format) {
                      const b64 = btoa(
                        new Uint8Array(pic.data).reduce((acc, b) => acc + String.fromCharCode(b), '')
                      );
                      audioMetadata.cover = `data:${pic.format};base64,${b64}`;
                    }
                  }
                  res();
                },
                onError: () => res(),
              });
            });
          } catch {}
        }
      }

      newFiles.push({
        filePath: tempPath || preview || fileName,
        preview,
        name: fileName,
        sizeMb,
        fileType,
        uploadedMb: 0,
        uploading: false,
        error: null,
        uploadedUrl: null,
        audioMetadata,
        width: dimensions.width,
        height: dimensions.height,
        duration: videoDuration || audioMetadata?.duration,
        blurPreview,
      });
    }

    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles]);
      setIsAttachmentModalOpen(true);
    }
  }, []);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const truncateText = (text: string, maxLen: number): string => text.length <= maxLen ? text : text.substring(0, maxLen) + '...';

  const isSameDay = (ts1: number, ts2: number): boolean => {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const getDateLabel = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isRu = (i18n.language || 'ru').startsWith('ru');

    if (msgDate.getTime() === today.getTime()) {
      return isRu ? 'Сегодня' : 'Today';
    }
    if (msgDate.getTime() === yesterday.getTime()) {
      return isRu ? 'Вчера' : 'Yesterday';
    }

    const isDifferentYear = date.getFullYear() !== now.getFullYear();

    if (isRu) {
      const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
      const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const wd = weekdays[date.getDay()];
      const d = date.getDate();
      const m = months[date.getMonth()];
      const yr = isDifferentYear ? ` ${date.getFullYear()}` : '';
      return `${wd}, ${d} ${m}${yr}`;
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const wd = weekdays[date.getDay()];
    const d = date.getDate();
    const m = months[date.getMonth()];
    const yr = isDifferentYear ? `, ${date.getFullYear()}` : '';
    return `${wd}, ${m} ${d}${yr}`;
  }, [i18n.language]);

  const floatingDateRef = useRef<string | null>(null);

  const scrollRafRef = useRef<number | null>(null);

  const [chatThumb, setChatThumb] = useState<{ top: number; height: number } | null>(null);
  const [isChatActive, setIsChatActive] = useState(false);
  const chatActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateChatThumb = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setChatThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setChatThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerChatActive = useCallback(() => {
    updateChatThumb();
    setIsChatActive(true);
    if (chatActiveTimerRef.current) clearTimeout(chatActiveTimerRef.current);
    chatActiveTimerRef.current = setTimeout(() => {
      setIsChatActive(false);
    }, 1000);
  }, [updateChatThumb]);

  const handleChatMouseLeave = useCallback(() => {
    if (chatActiveTimerRef.current) clearTimeout(chatActiveTimerRef.current);
    setIsChatActive(false);
  }, []);

  useEffect(() => {
    updateChatThumb();
  }, [visibleMessages.length, updateChatThumb]);
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let prevHeight = el.clientHeight;
    const ro = new ResizeObserver((entries) => {
      updateChatThumb();
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        if (prevHeight && Math.abs(newHeight - prevHeight) > 1) {
          const isCurrentlyAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
          if (isCurrentlyAtBottom && atBottomRef.current) {
            el.scrollTop = el.scrollHeight;
            requestAnimationFrame(() => {
              if (el) {
                el.scrollTop = el.scrollHeight;
                atBottomRef.current = true;
                setShowScrollDown(false);
              }
            });
          }
          prevHeight = newHeight;
        } else if (!prevHeight) {
          prevHeight = newHeight;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateChatThumb]);

  const handleMessagesWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      atBottomRef.current = false;
    }
  }, []);

  useEffect(() => {
    const handleAbortUpload = () => {
      try {
        (window as any).orbita?.cancelUpload?.();
      } catch {}
      useUploadProgressStore.getState().clearAll();
      useChatStore.getState().setIsUploadingMedia(false);
      if (activeChatId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId];
          if (!currentMsgs) return state;
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.filter((m) => !m.uploading && m.status !== 'sending'),
            },
          };
        });
      }
    };

    window.addEventListener('orbita:abort-media-upload', handleAbortUpload);
    return () => window.removeEventListener('orbita:abort-media-upload', handleAbortUpload);
  }, [activeChatId]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    if (performance.now() - lastChatSwitchTimeRef.current < 250) {
      setShowScrollDown(false);
      atBottomRef.current = true;
      return;
    }

    handleIsScrolling(true);
    triggerChatActive();

    const hasOverflow = el.scrollHeight > el.clientHeight + 20;
    const isAtBottom = !hasOverflow || (el.scrollHeight - el.scrollTop - el.clientHeight <= 60);
    if (atBottomRef.current !== isAtBottom) {
      atBottomRef.current = isAtBottom;
      setShowScrollDown(!isAtBottom && hasOverflow);
    }
    if (activeChatId) {
      saveChatScroll(activeChatId, el);
    }

    const virtualTopHeight = startIndex * 46;
    if (el.scrollTop <= virtualTopHeight + 400 && hasMoreAbove) {
      loadMoreAbove();
    }

    if (floatingDateTimeoutRef.current) {
      clearTimeout(floatingDateTimeoutRef.current);
    }
    floatingDateTimeoutRef.current = setTimeout(() => {
      setShowFloatingDate(false);
      setFloatingDateOffsetY(0);
      if (messagesContainerRef.current) {
        messagesContainerRef.current.querySelectorAll<HTMLElement>('[data-date-divider]').forEach((d) => {
          d.style.opacity = '1';
        });
      }
    }, 1200);

    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      if (!messagesContainerRef.current) return;
      const container = messagesContainerRef.current;
      const rect = container.getBoundingClientRect();
      const TARGET_TOP = 12;

      const allDividers = Array.from(container.querySelectorAll<HTMLElement>('[data-date-divider]'));
      const passedDividers: { el: HTMLElement; label: string; top: number }[] = [];
      const upcomingDividers: { el: HTMLElement; label: string; top: number }[] = [];

      for (const div of allDividers) {
        const pill = div.querySelector<HTMLElement>('.date-badge-pill') || div;
        const top = pill.getBoundingClientRect().top - rect.top;
        const label = div.getAttribute('data-date-divider') || '';
        if (top <= TARGET_TOP) {
          passedDividers.push({ el: div, label, top });
        } else {
          upcomingDividers.push({ el: div, label, top });
        }
      }

      let activeDate: string | null = null;
      let pushOffsetY = 0;

      if (passedDividers.length > 0) {
        const current = passedDividers[passedDividers.length - 1];
        activeDate = current.label;
      } else if (startIndex > 0 && visibleMessages.length > 0) {
        activeDate = getDateLabel(visibleMessages[0].time);
      }

      if (upcomingDividers.length > 0 && activeDate) {
        const nextDist = upcomingDividers[0].top;
        if (nextDist < 42) {
          pushOffsetY = nextDist - 42;
        }
      }

      if (activeDate) {
        floatingDateRef.current = activeDate;
        setFloatingDate(activeDate);
        setShowFloatingDate(true);
        setFloatingDateOffsetY(pushOffsetY);
        for (const div of allDividers) {
          const isHidden = div.getAttribute('data-date-divider') === activeDate;
          div.style.opacity = isHidden ? '0' : '1';
        }
      } else {
        setShowFloatingDate(false);
        setFloatingDateOffsetY(0);
        for (const div of allDividers) {
          div.style.opacity = '1';
        }
      }
    });
  }, [handleIsScrolling, hasMoreAbove, loadMoreAbove, startIndex, visibleMessages, getDateLabel]);

  const notifyPeerReadBatch = useCallback((lastMsgId: string, lastTime: number, readIds?: string[]) => {
    if (!readReceiptsEnabled || !activeChatId || activeChatId === 'notes') return;
    const allIds = readIds && readIds.length > 0 ? readIds : (lastMsgId ? [lastMsgId] : []);
    const isGroup = activeChat?.type === 'group';

    try {
      const pusher = isGroup ? getGroupPusher() : getPusher();
      const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
      const channel = pusher.subscribe(channelName);
      const sendRead = () => channel.trigger('client-message', {
        type: 'read',
        messageId: lastMsgId,
        readIds: allIds,
        time: lastTime,
        sender: myNickname,
        senderUserId: myUserId,
        senderCode: myCode,
        senderId: myUserId || myCode,
      });
      if (channel.subscribed) sendRead();
      else channel.bind('pusher:subscription_succeeded', sendRead);
    } catch {}

    allIds.forEach((id) => {
      ablyService.markMessageRead(activeChatId, id);
    });

    ablyService.sendMessage(activeChatId, {
      type: 'read',
      messageId: lastMsgId,
      readIds: allIds,
      time: lastTime,
      sender: myNickname,
      senderUserId: myUserId,
      senderCode: myCode,
      senderId: myUserId || myCode,
    }).catch(() => {});

    if (isGroup) {
      groupService.markGroupMessagesRead({
        groupId: activeChatId,
        messageId: lastMsgId,
        readIds: allIds,
        time: lastTime,
        sender: myNickname,
        senderUserId: myUserId,
        senderCode: myCode,
      });
    } else {
      sendEncryptedReadReceipt(activeChatId, allIds, lastTime);
    }
  }, [readReceiptsEnabled, activeChatId, activeChat?.type, myNickname, myUserId, myCode]);

  useEffect(() => {
    if (!readReceiptsEnabled || !activeChatId || activeChatId === 'notes') return;

    const markUnreadInViewAsRead = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const state = useChatStore.getState();
      const currentMessages = state.messagesByChatId[activeChatId] || [];
      let hasChanges = false;
      let latestReadMsg: { id: string; time: number } | null = null;
      const readIds: string[] = [];

      const updatedMessages = currentMessages.map((m) => {
        if (!isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId) && !m.read) {
          hasChanges = true;
          if (m.id) {
            readMessageIdsRef.current.add(m.id);
            readIds.push(m.id);
            ablyService.markMessageRead(activeChatId, m.id);
            latestReadMsg = { id: m.id, time: m.time };
          }
          return { ...m, read: true, status: 'read' as const };
        }
        return m;
      });

      if (hasChanges) {
        if (latestReadMsg) {
          notifyPeerReadBatch((latestReadMsg as any).id, (latestReadMsg as any).time, readIds);
        }
        useChatStore.setState((s) => ({
          messagesByChatId: {
            ...s.messagesByChatId,
            [activeChatId]: updatedMessages,
          },
        }));

        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
          const readMediaUrls: string[] = [];
          for (const m of updatedMessages) {
            if (m.id && readIds.includes(m.id)) {
              if (m.mediaUrl) readMediaUrls.push(m.mediaUrl);
              if (m.mediaItems && Array.isArray(m.mediaItems)) {
                for (const item of m.mediaItems) {
                  if (item?.url) readMediaUrls.push(item.url);
                }
              }
              if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                (window as any).orbita.storageAddMessage(activeChatId, m.id, m).catch(() => {});
              }
            }
          }
          if (readMediaUrls.length > 0) {
            mediaManager.purgeServerMedia(readMediaUrls);
          }
        }
      }
    };

    markUnreadInViewAsRead();

    const handleFocus = () => markUnreadInViewAsRead();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markUnreadInViewAsRead();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const container = messagesContainerRef.current;
    if (!container) {
      return () => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const state = useChatStore.getState();
        const currentMessages = state.messagesByChatId[activeChatId] || [];
        let hasChanges = false;
        let updatedMessages = currentMessages;
        let latestReadMsg: { id: string; time: number } | null = null;
        const readIds: string[] = [];

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const msgId = entry.target.getAttribute('data-message-id');
            if (msgId && !readMessageIdsRef.current.has(msgId)) {
              const msg = currentMessages.find((m) => m.id === msgId);
              if (msg && !isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId) && !msg.read) {
                readMessageIdsRef.current.add(msgId);
                readIds.push(msgId);
                hasChanges = true;
                ablyService.markMessageRead(activeChatId, msgId);
                latestReadMsg = { id: msgId, time: msg.time };

                if (updatedMessages === currentMessages) updatedMessages = [...currentMessages];
                const idx = updatedMessages.findIndex((m) => m.id === msgId);
                if (idx !== -1) {
                  updatedMessages[idx] = { ...updatedMessages[idx], read: true, status: 'read' as const };
                }
              }
            }
          }
        }

        if (hasChanges) {
          if (latestReadMsg) {
            notifyPeerReadBatch((latestReadMsg as any).id, (latestReadMsg as any).time, readIds);
          }
          useChatStore.setState((s) => ({
            messagesByChatId: {
              ...s.messagesByChatId,
              [activeChatId]: updatedMessages,
            },
          }));

          if (readIds.length > 0) {
            supabaseService.purgeServerMessages(activeChatId, readIds);
            const readMediaUrls: string[] = [];
            for (const m of updatedMessages) {
              if (m.id && readIds.includes(m.id)) {
                if (m.mediaUrl) readMediaUrls.push(m.mediaUrl);
                if (m.mediaItems && Array.isArray(m.mediaItems)) {
                  for (const item of m.mediaItems) {
                    if (item?.url) readMediaUrls.push(item.url);
                  }
                }
                if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
                  (window as any).orbita.storageAddMessage(activeChatId, m.id, m).catch(() => {});
                }
              }
            }
            if (readMediaUrls.length > 0) {
              mediaManager.purgeServerMedia(readMediaUrls);
            }
          }
        }
      },
      { root: container, threshold: 0.2 }
    );

    const messageElements = container.querySelectorAll('[data-message="true"]');
    messageElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeChatId, readReceiptsEnabled, myCode, myNickname, activeChat?.type, activeChat?.peerCode]);

  const scrollToPinnedMessage = () => {
    if (pinnedMessage) {
      let index = -1;
      if (pinnedMessage.id || pinnedMessage.messageId) {
        const targetId = pinnedMessage.id || pinnedMessage.messageId;
        index = messages.findIndex(m => m.id === targetId);
      }
      if (index === -1) {
        index = messages.findIndex(m => m.time === pinnedMessage.time && m.sender === pinnedMessage.sender);
      }
      if (index === -1) {
        index = messages.findIndex(m => m.text === pinnedMessage.text && m.sender === pinnedMessage.sender);
      }
      if (index >= 0) {
        const neededCount = messages.length - index;
        if (neededCount > renderedCount) {
          setRenderedCount(neededCount + 10);
        }
        setTimeout(() => {
          const msg = messages[index];
          const el = messagesContainerRef.current?.querySelector(`[data-message-id="${msg.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setHighlightedIndex(index);
          setTimeout(() => {
            setHighlightedIndex(current => current === index ? null : current);
          }, 1200);
        }, 30);
      }
    }
  };

  const handleJumpToSearchMessage = useCallback((targetIndex: number, messageId?: string) => {
    if (targetIndex < 0 || targetIndex >= messages.length) return;
    const neededCount = messages.length - targetIndex;
    if (neededCount > renderedCount) {
      setRenderedCount(neededCount + 15);
    }
    setTimeout(() => {
      const msg = messages[targetIndex];
      const targetId = messageId || msg?.id;
      const el = targetId
        ? messagesContainerRef.current?.querySelector(`[data-message-id="${targetId}"]`)
        : null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setHighlightedIndex(targetIndex);
      setTimeout(() => {
        setHighlightedIndex((current) => (current === targetIndex ? null : current));
      }, 1500);
    }, 40);
  }, [messages, renderedCount]);

  const jumpTarget = useChatStore((s) => s.inChatSearch?.jumpTarget);
  useEffect(() => {
    if (jumpTarget && jumpTarget.chatId === activeChatId) {
      handleJumpToSearchMessage(jumpTarget.messageIndex, jumpTarget.messageId);
    }
  }, [jumpTarget, activeChatId, handleJumpToSearchMessage]);

  const handleQuoteClick = useCallback(
    (q: { id?: string; sender: string; text: string; time: string }, currentMsgIndex: number) => {
      if (!messagesContainerRef.current) return;
      let targetIndex = -1;

      // 1. Поиск по абсолютно ТОЧНОМУ messageId (message_id)
      if (q.id) {
        targetIndex = messages.findIndex((m) => m.id === q.id);
      }

      // 2. Если по ID не нашлось (для старых сообщений), ищем по отправителю + времени + точному тексту
      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          const timeStr = formatTimeOfDay(m.time);
          const cleanMBody = body.trim();
          const cleanQText = q.text.trim();
          if (m.sender === q.sender && cleanMBody === cleanQText && timeStr === q.time) {
            targetIndex = i;
            break;
          }
        }
      }

      // 3. Отправитель + время + начало текста (для обкусанных длинных текстов)
      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          const timeStr = formatTimeOfDay(m.time);
          const cleanMBody = body.trim();
          const cleanQText = q.text.trim();
          if (
            m.sender === q.sender &&
            timeStr === q.time &&
            (cleanMBody.startsWith(cleanQText) || cleanQText.startsWith(cleanMBody))
          ) {
            targetIndex = i;
            break;
          }
        }
      }

      // 4. Отправитель + точный текст (без учета времени)
      if (targetIndex === -1) {
        for (let i = currentMsgIndex - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          const { body } = parseReplyChain(m.text);
          if (m.sender === q.sender && body.trim() === q.text.trim()) {
            targetIndex = i;
            break;
          }
        }
      }

      if (targetIndex >= 0) {
        const neededCount = messages.length - targetIndex;
        if (neededCount > renderedCount) {
          setRenderedCount(neededCount + 10);
        }
        setTimeout(() => {
          const msg = messages[targetIndex];
          const el = messagesContainerRef.current?.querySelector(`[data-message-id="${msg.id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setHighlightedIndex(targetIndex);
          setTimeout(() => {
            setHighlightedIndex((current) => (current === targetIndex ? null : current));
          }, 1200);
        }, 30);
      }
    },
    [messages, renderedCount]
  );

  const isPrivateChat = activeChat?.type === 'private';

  const triggerMessage = async (
    text: string,
    mediaPayload?: { type: string; url: string; key?: string; name?: string; mime?: string; audioMetadata?: AudioMetadata; duration?: number; waveform?: number[] },
    linkPreviewPayload?: LinkPreviewData,
    existingMessageId?: string
  ) => {
    if (!activeChatId) return;

    if (activeChatId === 'notes') {
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text,
                      status: 'sent' as const,
                      uploading: false,
                      mediaUrl: mediaPayload?.url,
                      mediaKey: mediaPayload?.key,
                      mediaName: mediaPayload?.name,
                      mime: mediaPayload?.mime,
                      duration: mediaPayload?.duration,
                      waveform: mediaPayload?.waveform,
                    }
                  : m
              ),
            },
          };
        });
      } else {
        const localMessage: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: text,
          time: Date.now(),
          read: true,
          status: 'sent',
          mediaType: mediaPayload?.type as any,
          mediaUrl: mediaPayload?.url,
          mediaName: mediaPayload?.name,
          mediaKey: mediaPayload?.key,
          mime: mediaPayload?.mime,
          audioMetadata: mediaPayload?.audioMetadata,
          duration: mediaPayload?.duration,
          waveform: mediaPayload?.waveform,
          linkPreview: linkPreviewPayload,
        };
        addMessage(activeChatId, localMessage);
      }
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      return;
    }

    if (activeChatId === 'system_support') {
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text,
                      status: 'sent' as const,
                      uploading: false,
                      mediaUrl: mediaPayload?.url,
                      mediaKey: mediaPayload?.key,
                      mediaName: mediaPayload?.name,
                      mime: mediaPayload?.mime,
                      duration: mediaPayload?.duration,
                      waveform: mediaPayload?.waveform,
                    }
                  : m
              ),
            },
          };
        });
      } else {
        const localMessage: Message = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: text,
          time: Date.now(),
          read: true,
          status: 'sent',
          mediaType: mediaPayload?.type as any,
          mediaUrl: mediaPayload?.url,
          mediaName: mediaPayload?.name,
          mediaKey: mediaPayload?.key,
          mime: mediaPayload?.mime,
          audioMetadata: mediaPayload?.audioMetadata,
          duration: mediaPayload?.duration,
          waveform: mediaPayload?.waveform,
        };
        addMessage(activeChatId, localMessage);
      }
      updateChat(activeChatId, { lastMsg: mediaPayload?.name || text || '📎' });
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      supportService.handleUserMessage(text, t, mediaPayload?.url, mediaPayload?.type);
      return;
    }

    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId);

    if (chat?.type === 'channel') {
      if (!isChannelOwner) return;

      const sentText = text;
      const sentMedia = mediaPayload;
      const sentPreview = linkPreviewPayload;

      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));

      const optimisticId = existingMessageId || `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (existingMessageId) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) =>
                m.id === existingMessageId
                  ? {
                      ...m,
                      text: sentText || '',
                      mediaUrl: sentMedia?.url || m.mediaUrl,
                      mediaKey: sentMedia?.key || m.mediaKey,
                      uploading: false,
                    }
                  : m
              ),
            },
          };
        });
      } else {
        const optimisticMessage: Message = {
          id: optimisticId,
          sender: myNickname,
          senderId: myUserId,
          text: sentText || '',
          time: Date.now(),
          read: true,
          status: 'sending',
          isOutgoing: true,
          mediaType: (sentMedia?.type as Message['mediaType']) || undefined,
          mediaUrl: sentMedia?.url || undefined,
          mediaName: sentMedia?.name || undefined,
          mediaKey: sentMedia?.key,
          mime: sentMedia?.mime || undefined,
          audioMetadata: sentMedia?.audioMetadata || undefined,
          duration: sentMedia?.duration || undefined,
          waveform: sentMedia?.waveform || undefined,
          linkPreview: sentPreview || undefined,
        };
        addMessage(activeChatId, optimisticMessage);
      }
      updateChat(activeChatId, { lastMsg: sentText || sentMedia?.name || 'Новый пост' });

      const targetChannelId = activeChatId;
      channelService.publishPost(
        targetChannelId,
        myNickname,
        sentText,
        sentMedia ? {
          type: sentMedia.type,
          url: sentMedia.url,
          name: sentMedia.name,
          mime: sentMedia.mime,
          duration: sentMedia.duration,
          waveform: sentMedia.waveform,
          audioMetadata: sentMedia.audioMetadata,
        } : undefined,
        sentPreview,
        optimisticId,
        myUserId
      ).then((post) => {
        if (post) {
          const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
          try {
            (window as any).orbita?.storageDeleteMessage?.(optimisticId).catch(() => {});
          } catch {}
          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[targetChannelId] || [];
            const updated = currentMsgs.map((m) =>
              m.id === optimisticId || m.id === post.id
                ? { ...m, id: post.id, time: validPostTime, status: 'read' as const }
                : m
            );
            const saved = updated.find((m) => m.id === post.id);
            if (saved) {
              try {
                (window as any).orbita?.storageAddMessage?.(targetChannelId, post.id, saved).catch(() => {});
              } catch {}
            }
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [targetChannelId]: updated,
              },
            };
          });
        }
      });
      return;
    }

    const pusher = getPusher();
    if (!chat) return;

    const messageId = existingMessageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const networkAudioMetadata = mediaPayload?.audioMetadata ? {
      title: mediaPayload.audioMetadata.title,
      artist: mediaPayload.audioMetadata.artist,
      duration: mediaPayload.audioMetadata.duration,
      size: mediaPayload.audioMetadata.size,
    } : null;

    const localMessage: Message = {
      id: messageId,
      senderId: myCode,
      sender: myNickname,
      isOutgoing: true,
      text: text,
      time: Date.now(),
      read: false,
      status: activeChatId === 'notes' ? 'sent' : 'sending',
      mediaType: mediaPayload?.type as any,
      mediaUrl: mediaPayload?.url,
      mediaName: mediaPayload?.name,
      mediaKey: mediaPayload?.key,
      mime: mediaPayload?.mime,
      audioMetadata: mediaPayload?.audioMetadata,
      duration: mediaPayload?.duration,
      waveform: mediaPayload?.waveform,
      linkPreview: linkPreviewPayload,
    };

    if (existingMessageId) {
      useChatStore.setState((state) => {
        const currentMsgs = state.messagesByChatId[activeChatId] || [];
        const updated = currentMsgs.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text,
                status: (activeChatId === 'notes' ? 'sent' : 'sending') as Message['status'],
                uploading: false,
                mediaUrl: mediaPayload?.url || m.mediaUrl,
                mediaKey: mediaPayload?.key || m.mediaKey,
                mediaName: mediaPayload?.name || m.mediaName,
                mime: mediaPayload?.mime || m.mime,
                duration: mediaPayload?.duration || m.duration,
                waveform: mediaPayload?.waveform || m.waveform,
                audioMetadata: mediaPayload?.audioMetadata || m.audioMetadata,
              }
            : m
        );
        const target = updated.find((m) => m.id === messageId);
        if (target) {
          (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, target).catch(() => {});
        }
        return {
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        };
      });
    } else {
      addMessage(activeChatId, localMessage);
    }

    sendQueueRef.current = sendQueueRef.current.then(async () => {
      try {
        const messageData = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          avatarUrl: myAvatarUrl || null,
          text,
          mediaType: mediaPayload?.type || null,
          mediaUrl: mediaPayload?.url || null,
          mediaName: mediaPayload?.name || null,
          mediaKey: mediaPayload?.key || null,
          mime: mediaPayload?.mime || null,
          audioMetadata: networkAudioMetadata,
          duration: mediaPayload?.duration || null,
          waveform: mediaPayload?.waveform || null,
          linkPreview: linkPreviewPayload || null,
        };

        const freshChat = useChatStore.getState().chats.find(c => c.id === activeChatId);

        if (freshChat?.type === 'group') {

          let groupSecret = freshChat.sharedSecret;
          if (!groupSecret && freshChat.id && freshChat.id.length === 36) {
            groupSecret = deriveGroupKey(freshChat.id);
          }
          if (!groupSecret && freshChat.inviteCode && isValidGroupCode(freshChat.inviteCode)) {
            groupSecret = deriveGroupKey(freshChat.inviteCode);
          }
          if (!groupSecret && freshChat.code && isValidGroupCode(freshChat.code)) {
            groupSecret = deriveGroupKey(freshChat.code);
          }
          if (!groupSecret) {
            const fetched = await groupService.getGroup(activeChatId);
            groupSecret = fetched?.sharedSecret || deriveGroupKey(activeChatId);
          }

          if (groupSecret) {
            const ciphertext = await encryptMessage(JSON.stringify(messageData), groupSecret);
            const groupPusher = getGroupPusher();
            const channel = groupPusher.subscribe(`presence-group-${activeChatId}`);
            const payload = {
              ...(mediaPayload ? { mediaType: mediaPayload.type, mediaUrl: mediaPayload.url, mediaName: mediaPayload.name, mime: mediaPayload.mime } : {}),
              sender: myNickname,
              senderCode: myCode,
              senderId: myUserId || myCode,
              senderUserId: myUserId,
              ciphertext,
              type: 'message',
              messageId,
              chatId: activeChatId,
              time: Date.now(),
            };
            const doSendPusher = () => {
              try { channel.trigger('client-message', payload); } catch {}
            };
            if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);

            groupService.sendGroupMessage({
              id: messageId,
              groupId: activeChatId,
              senderCode: myCode,
              senderId: myUserId || myCode,
              senderNickname: myNickname,
              ciphertext,
              mediaType: mediaPayload?.type || null,
              mediaUrl: mediaPayload?.url || null,
              mediaName: mediaPayload?.name || null,
              mediaKey: mediaPayload?.key || null,
              mime: mediaPayload?.mime || null,
              duration: mediaPayload?.duration || null,
              width: null,
              height: null,
              waveform: mediaPayload?.waveform || null,
              audioMetadata: networkAudioMetadata,
              linkPreview: linkPreviewPayload || null,
            }).catch(() => {});
            useChatStore.getState().updateMessageStatus(activeChatId, messageId, 'sent');
          }
          return;
        }

        if (!freshChat?.ratchetState) {
          const recipientTargets = Array.from(new Set([
            activeChat?.peerCode,
            activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
            freshChat?.peerCode,
            freshChat?.name && freshChat.name.length === 36 ? freshChat.name : undefined,
          ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
          if (activeChat?.type === 'private' || freshChat?.type === 'private') {
            const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
            const targetIdx = currentMsgs.findIndex((m) => m.id === messageId);
            const preHandshakeIndex = targetIdx >= 0 ? targetIdx : currentMsgs.length;
            const plaintext = JSON.stringify(messageData);
            for (const recipientId of recipientTargets) {
              supabaseService.sendOfflineMessage(
                activeChatId,
                myUserId || myCode || myNickname,
                recipientId,
                plaintext,
                preHandshakeIndex,
                'PRE_HANDSHAKE',
                messageId,
              ).catch(() => {});
            }

            const preHandshakePayload = {
              ...(mediaPayload ? { mediaType: mediaPayload.type, mediaUrl: mediaPayload.url, mediaName: mediaPayload.name, mime: mediaPayload.mime } : {}),
              sender: myNickname,
              avatarUrl: myAvatarUrl || null,
              senderCode: myCode,
              senderId: myUserId || myCode,
              senderUserId: myUserId,
              ciphertext: plaintext,
              type: 'message',
              index: preHandshakeIndex,
              dhPublicKey: 'PRE_HANDSHAKE',
              messageId,
              chatId: activeChatId,
            };
            try {
              ablyService.sendMessage(activeChatId, preHandshakePayload).catch(() => {});
            } catch {}
            try {
              const channel = pusher.subscribe(`private-chat-${activeChatId}`);
              const doSendPusher = () => {
                try {
                  channel.trigger('client-message', preHandshakePayload);
                } catch {}
              };
              if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);
            } catch {}

            useChatStore.getState().updateMessageStatus(activeChatId, messageId, 'sent');
          }
          return;
        }

        const ratchet = DoubleRatchet.fromState(freshChat.ratchetState);

        if (!ratchet.canSend()) {
          return;
        }

        const plaintext = JSON.stringify(messageData);
        const { ciphertext, index, dhPublicKey, prevChainCount } = await ratchet.encrypt(plaintext);

        updateChat(activeChatId, { ratchetState: ratchet.getState() });

        const payload = {
          ...(mediaPayload ? { mediaType: mediaPayload.type, mediaUrl: mediaPayload.url, mediaName: mediaPayload.name, mime: mediaPayload.mime } : {}),
          sender: myNickname,
          avatarUrl: myAvatarUrl || null,
          senderCode: myCode,
          senderId: myUserId || myCode,
          senderUserId: myUserId,
          ciphertext,
          type: 'message',
          index,
          dhPublicKey,
          prevChainCount,
          messageId,
          chatId: activeChatId,
        };

        const recipientTargets = Array.from(new Set([
          freshChat?.peerCode || activeChat?.peerCode,
          (freshChat?.name || activeChat?.name) && (freshChat?.name || activeChat?.name)!.length === 36 ? (freshChat?.name || activeChat?.name) : undefined,
        ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));

        (async () => {
          try {
            await ablyService.sendMessage(activeChatId, payload);
          } catch {}

          try {
            const channel = pusher.subscribe(`private-chat-${activeChatId}`);
            const doSendPusher = () => {
              try {
                channel.trigger('client-message', payload);
              } catch {}
            };
            if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);
          } catch {}

          if (freshChat?.type === 'private' || activeChat?.type === 'private') {
            for (const recipientId of recipientTargets) {
              supabaseService.sendOfflineMessage(
                activeChatId,
                myUserId || myCode || myNickname,
                recipientId,
                ciphertext,
                index,
                dhPublicKey,
                messageId,
                prevChainCount
              ).catch(() => {});
            }
          }

          useChatStore.getState().updateMessageStatus(activeChatId, messageId, 'sent');
        })().catch(() => {});
      } catch (err) {
        console.error('[ChatWindow] Failed to encrypt/send message:', err);
      }
    }).catch(() => {});
  };

  const handleSendMessage = useCallback((overrideText?: string, linkPreview?: LinkPreviewData) => {
    const textToSend = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    if (!textToSend) return;
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) clearDraft(activeChatId);
    if (inputText !== '') setInputText('');
    stopTyping();
    if (replyingTo) {
      let cleanText = replyingTo.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
      if (/^\[Sticker\]/i.test(cleanText) || cleanText.includes('/stickers/') || cleanText.includes('\\stickers\\') || cleanText.includes('.stickers')) {
        cleanText = '[Sticker]';
      }
      const idTag = replyingTo.senderId ? `[id:${replyingTo.id || ''}:${replyingTo.senderId}] ` : (replyingTo.id ? `[id:${replyingTo.id}] ` : '');
      triggerMessage(`↩ ${idTag}${replyingTo.sender}: ${truncateText(cleanText, 200)}, ${formatTime(replyingTo.time)}\n${textToSend}`, undefined, linkPreview);
    } else {
      triggerMessage(textToSend, undefined, linkPreview);
    }
    setReplyingTo(null);
    inputRef.current?.focus();

    atBottomRef.current = true;
    setShowScrollDown(false);

    scrollToBottom(false);
    requestAnimationFrame(() => {
      scrollToBottom(false);
    });
  }, [inputText, activeChatId, clearDraft, stopTyping, replyingTo, triggerMessage, scrollToBottom]);

  const handleSendAsTxt = async (_caption: string) => {
    if (!activeChatId || !inputText.trim()) return;
    const textContent = inputText.trim();

    try {
      const base64Content = btoa(unescape(encodeURIComponent(textContent)));
      const tempPath = await window.orbita.writeTempFile(base64Content);
      if (!tempPath) return;

      const sizeMb = new Blob([textContent]).size / (1024 * 1024);

      const txtFile: AttachedFile = {
        filePath: tempPath,
        preview: null,
        name: 'message.txt',
        sizeMb,
        fileType: 'document',
        uploadedMb: 0,
        uploading: false,
        error: null,
        uploadedUrl: null,
      };

      if (draftDebounceTimerRef.current) {
        clearTimeout(draftDebounceTimerRef.current);
        draftDebounceTimerRef.current = null;
      }
      if (activeChatId) clearDraft(activeChatId);
      setAttachedFiles([txtFile]);
      setIsAttachmentModalOpen(true);
      setInputText('');
    } catch (err) {
      console.error('Failed to create txt file:', err);
    }
  };

  const handleEditMessage = async (overrideText?: string) => {
    const textToSave = (typeof overrideText === 'string' ? overrideText : editText).trim();
    if (editingIndex === null || !textToSave) return;
    triggerEditMessage(editingIndex, textToSave);
    inputRef.current?.focus();
  };

  const triggerEditMessage = async (index: number, newText: string) => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;

    const updatedMessages = [...messages];
    if (updatedMessages[index]) {
      updatedMessages[index] = { ...updatedMessages[index], text: newText };
      useChatStore.setState((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [activeChatId]: updatedMessages,
        },
        chats: state.chats.map(c => c.id === activeChatId ? { ...c, lastMsg: newText } : c)
      }));
    }

    setEditingIndex(null);
    setEditText('');
    setContextMenu(prev => ({ ...prev, visible: false }));

    if (activeChatId === 'notes') return;

    try {
      const chat = useChatStore.getState().chats.find(c => c.id === activeChatId);
      if (chat && chat.ratchetState) {
        const ratchet = DoubleRatchet.fromState(chat.ratchetState);
        const { ciphertext, index: newIndex, dhPublicKey: editDhPublicKey, prevChainCount: editPrevChainCount } = await ratchet.encrypt(newText);
        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${activeChatId}`);
        const send = () => {
          channel.trigger('client-message', {
            sender: myNickname,
            senderUserId: myUserId,
            senderId: myUserId || myCode,
            text: ciphertext,
            type: 'edit',
            editIndex: index,
            index: newIndex,
            dhPublicKey: editDhPublicKey,
            prevChainCount: editPrevChainCount,
          });
          updateChat(activeChatId, { ratchetState: ratchet.getState() });
        };
        if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
      }
    } catch (err) {
      console.error('Failed to broadcast message edit:', err);
    }
  };

  const triggerDeleteMessage = (index: number) => {
    if (!activeChatId) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const targetMsg = messages[index];
    const targetMsgId = targetMsg?.id;
    if (activeChatId === 'notes') {
      const updatedMessages = messages.filter((_, i) => i !== index);
      useChatStore.setState((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [activeChatId]: updatedMessages,
        }
      }));
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }

    if (targetMsgId) {
      useChatStore.getState().deleteMessage(activeChatId, targetMsgId);
    } else {
      const updatedMessages = messages.filter((_, i) => i !== index);
      useChatStore.setState((state) => ({
        messagesByChatId: {
          ...state.messagesByChatId,
          [activeChatId]: updatedMessages,
        }
      }));
      updateChat(activeChatId, { lastMsg: updatedMessages.length > 0 ? updatedMessages[updatedMessages.length - 1].text : t('common.history_cleared') });
    }

    const payload = {
      sender: myNickname,
      senderUserId: myUserId,
      senderId: myUserId || myCode,
      text: '',
      type: 'delete-message',
      targetMessageId: targetMsgId,
      deleteIndex: index,
    };

    ablyService.sendMessage(activeChatId, payload).catch(() => {});

    const isGroup = activeChat?.type === 'group';
    const pusher = isGroup ? getGroupPusher() : getPusher();
    const channel = pusher.subscribe(
      activeChat?.type === 'channel'
        ? `public-channel-${activeChatId}`
        : isGroup
        ? `presence-group-${activeChatId}`
        : `private-chat-${activeChatId}`
    );
    const send = () => {
      channel.trigger('client-message', payload);
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

    if (activeChat?.type === 'channel') {
      if (targetMsgId) {
        channelService.deletePost(activeChatId, targetMsgId, myUserId);
      }
    } else if (targetMsgId) {
      const recipientTargets = Array.from(new Set([
        activeChat?.peerCode,
        activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
      ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
      for (const rId of recipientTargets) {
        supabaseService.deleteMessage(activeChatId, targetMsgId, rId, myCode).catch(() => {});
      }
    }

    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const triggerPinMessage = (index: number) => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const pinnedMsg = messages[index];
    if (!pinnedMsg) return;
    const pinData = {
      id: pinnedMsg.id,
      messageId: pinnedMsg.id,
      sender: pinnedMsg.sender,
      text: pinnedMsg.text,
      time: pinnedMsg.time,
    };
    if (activeChatId === 'notes') {
      updateChat(activeChatId, { pinnedMessage: pinData });
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }

    const pusher = getPusher();
    const channel = pusher.subscribe(
      activeChat?.type === 'channel'
        ? `public-channel-${activeChatId}`
        : `private-chat-${activeChatId}`
    );
    const send = () => {
      channel.trigger('client-message', { sender: myNickname, text: pinnedMsg.text, type: 'pin', pinData });
      updateChat(activeChatId, { pinnedMessage: pinData });
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const triggerUnpinMessage = () => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    if (activeChatId === 'notes') {
      updateChat(activeChatId, { pinnedMessage: null });
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }

    const pusher = getPusher();
    const channel = pusher.subscribe(
      activeChat?.type === 'channel'
        ? `public-channel-${activeChatId}`
        : `private-chat-${activeChatId}`
    );
    const send = () => { channel.trigger('client-message', { sender: myNickname, type: 'unpin', text: '' }); updateChat(activeChatId, { pinnedMessage: null }); };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
  };

  const requestDeleteMessage = (index: number) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'delete_message',
      messageIndex: index,
    });
  };

  const requestDeleteSelected = () => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const idsToDelete = Array.from(selection.selectedIds);
    const indicesToDelete: number[] = [];
    messages.forEach((msg, idx) => {
      if (msg.id && idsToDelete.includes(msg.id)) {
        indicesToDelete.push(idx);
      }
    });
    indicesToDelete.sort((a, b) => b - a);
    setConfirmModal({
      isOpen: true,
      type: 'delete_message',
      selectedIndices: indicesToDelete,
    });
  };

  const requestPinMessage = (index: number) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'pin_message',
      messageIndex: index,
    });
  };

  const requestUnpinMessage = () => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    setContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'unpin_message',
    });
  };

  const handleConfirmAction = () => {
    if (!confirmModal.type) return;
    if (confirmModal.type === 'delete_message') {
      if (confirmModal.selectedIndices && confirmModal.selectedIndices.length > 0) {
        for (const idx of confirmModal.selectedIndices) {
          triggerDeleteMessage(idx);
        }
        selection.exitSelectionMode();
      } else if (confirmModal.messageIndex !== undefined) {
        triggerDeleteMessage(confirmModal.messageIndex);
      }
    } else if (confirmModal.type === 'pin_message') {
      if (confirmModal.messageIndex !== undefined) {
        triggerPinMessage(confirmModal.messageIndex);
      }
    } else if (confirmModal.type === 'unpin_message') {
      triggerUnpinMessage();
    }
  };

  const triggerReactionMessage = (targetMessageIndexOrId: number | string, emoji: string) => {
    if (!activeChatId) return;

    const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
    const setReaction = useChatStore.getState().setReaction;

    const targetMsg = typeof targetMessageIndexOrId === 'number'
      ? currentMsgs[targetMessageIndexOrId]
      : currentMsgs.find(m => m.id === targetMessageIndexOrId);

    if (!targetMsg || !targetMsg.id) return;
    const msgId = targetMsg.id;

    const userAliases = [myUserId, myCode, myNickname, 'YOU'].filter(Boolean) as string[];
    const reactionUserId = myUserId || myCode || myNickname || 'YOU';
    const result = setReaction(activeChatId, msgId, emoji, reactionUserId, 'toggle', userAliases);
    if (result === 'limit_reached') {
      useToastStore.getState().showToast(t('common.max_reactions_limit'));
      return;
    }

    setContextMenu(prev => (prev.visible ? { ...prev, visible: false } : prev));

    if (activeChatId === 'notes') return;

    const timerKey = `${activeChatId}:${msgId}:${emoji}`;
    const existingTimer = reactionDebounceTimers.current.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      reactionDebounceTimers.current.delete(timerKey);
      const latestMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
      const latestMsg = latestMsgs.find(m => m.id === msgId);
      const currentUsers = latestMsg?.reactions?.[emoji] || [];
      const isPresent = currentUsers.includes(reactionUserId) || (myCode ? currentUsers.includes(myCode) : false) || (myUserId ? currentUsers.includes(myUserId) : false) || currentUsers.includes(myNickname);
      const finalAction: 'add' | 'remove' = isPresent ? 'add' : 'remove';

      if (activeChat?.type === 'channel') {
        channelService.toggleReaction(activeChatId, msgId, emoji, reactionUserId, finalAction, CLIENT_SESSION_ID);
        return;
      }

      const payload = {
        chatId: activeChatId,
        messageId: msgId,
        emoji,
        sender: myNickname,
        senderId: myUserId || myCode || myNickname,
        senderUserId: myUserId,
        action: finalAction,
        sessionId: CLIENT_SESSION_ID,
      };

      supabaseService.saveReaction(activeChatId, undefined, msgId, emoji, reactionUserId, finalAction).catch(() => {});

      ablyService.sendMessage(activeChatId, {
        ...payload,
        type: 'reaction',
      }).catch(() => {});

      try {
        const isGroup = activeChat?.type === 'group';
        const pusher = isGroup ? getGroupPusher() : getPusher();
        const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
        const channel = pusher.subscribe(channelName);
        const send = () => {
          try {
            channel.trigger('client-message', {
              ...payload,
              type: 'reaction',
            });
          } catch {}
        };
        if (channel.subscribed) send();
        else channel.bind('pusher:subscription_succeeded', send);
      } catch (err) {
        console.error('Failed to broadcast reaction:', err);
      }
    }, 150);

    reactionDebounceTimers.current.set(timerKey, timer);
  };

  useEffect(() => {
    if (!activeChatId) return;

    if (activeChatId !== 'notes') {
      useChatStore.getState().syncReactionsFromSupabase(activeChatId);
    }

    const targetChatId = activeChatId;
    try {
      (window as any).orbita?.storageGetMessages?.(targetChatId).then((cached: any[]) => {
        if (useChatStore.getState().activeChatId !== targetChatId) return;
        if (Array.isArray(cached) && cached.length > 0) {
          const sanitizedCached = cached.map((m) => {
            if (!m) return m;
            const validTime = (typeof m.time === 'number' && !isNaN(m.time) && m.time > 0) ? m.time : Date.now();
            const timeFixed = validTime !== m.time ? { ...m, time: validTime } : m;
            if (timeFixed.uploading || timeFixed.status === 'sending' || timeFixed.status === 'pending') {
              const hasRemoteUrl = Boolean(timeFixed.mediaUrl && !timeFixed.mediaUrl.startsWith('blob:') && (timeFixed.mediaUrl.startsWith('http') || timeFixed.mediaUrl.startsWith('orbita-media:')));
              const hasRemoteItems = Boolean(timeFixed.mediaItems && timeFixed.mediaItems.length > 0 && timeFixed.mediaItems.every((it: any) => it.url && !it.url.startsWith('blob:') && (it.url.startsWith('http') || it.url.startsWith('orbita-media:'))));
              if (hasRemoteUrl || hasRemoteItems || !timeFixed.isOutgoing) {
                const fixed = { ...timeFixed, uploading: false, status: 'sent' as const };
                (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
                return fixed;
              }
              const fixed = { ...timeFixed, uploading: false };
              (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
              return fixed;
            }
            return timeFixed;
          });
          useChatStore.setState((state) => {
            if (useChatStore.getState().activeChatId !== targetChatId) return state;
            const nowMsgs = state.messagesByChatId[targetChatId] || [];
            if (nowMsgs.length === 0) {
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChatId]: sanitizedCached,
                },
              };
            }
            const map = new Map<string, any>();
            sanitizedCached.forEach((m) => { if (m?.id) map.set(m.id, m); });
            nowMsgs.forEach((m) => { if (m?.id) map.set(m.id, m); });
            if (map.size > nowMsgs.length) {
              const merged = Array.from(map.values()).sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChatId]: merged,
                },
              };
            }
            return state;
          });
        }
      });
    } catch {}

    if (activeChat?.type === 'group') {
      const targetGroupId = activeChatId;
      const groupSecret = activeChat.sharedSecret ||
        (activeChat.inviteCode && isValidGroupCode(activeChat.inviteCode) ? deriveGroupKey(activeChat.inviteCode) : undefined) ||
        (activeChat.code && isValidGroupCode(activeChat.code) ? deriveGroupKey(activeChat.code) : undefined);

      if (groupSecret && !activeChat.sharedSecret) {
        useChatStore.getState().updateChat(targetGroupId, { sharedSecret: groupSecret });
      }

      groupService.fetchGroupMessages(targetGroupId).then(async (serverMsgs) => {
        if (useChatStore.getState().activeChatId !== targetGroupId) return;
        if (!Array.isArray(serverMsgs) || serverMsgs.length === 0) return;
        const secret = groupSecret || (await groupService.getGroup(targetGroupId))?.sharedSecret;
        if (!secret) return;
        const current = useChatStore.getState().messagesByChatId[targetGroupId] || [];
        const existingIds = new Set(current.map((m) => m.id));
        const newMessages: Message[] = [];
        for (const row of serverMsgs) {
          if (existingIds.has(row.id)) continue;
          let text = row.ciphertext;
          let parsedData: any = null;
          try {
            const dec = await decryptMessage(row.ciphertext, secret);
            if (dec && dec !== '[ENCRYPTED MESSAGE]') {
              try {
                parsedData = JSON.parse(dec);
                text = parsedData.text !== undefined ? parsedData.text : dec;
              } catch {
                text = dec;
              }
            }
          } catch {}

          const isOutgoing = Boolean(
            (myUserId && (row.sender_id === myUserId || row.sender_code === myUserId)) ||
            (myCode && (row.sender_code === myCode || row.sender_id === myCode)) ||
            (row.sender_nickname === myNickname)
          );

          const msgItem: Message = {
            id: row.id,
            senderId: row.sender_code || row.sender_id,
            sender: row.sender_nickname,
            isOutgoing,
            text,
            time: new Date(row.created_at).getTime(),
            read: true,
            status: 'sent',
            mediaType: parsedData?.mediaType || row.media_type || undefined,
            mediaUrl: parsedData?.mediaUrl || row.media_url || undefined,
            mediaName: parsedData?.mediaName || row.media_name || undefined,
            mediaKey: parsedData?.mediaKey || row.media_key || undefined,
            mime: parsedData?.mime || row.mime || undefined,
            mediaItems: parsedData?.mediaItems || undefined,
            width: parsedData?.width || (row as any).width || undefined,
            height: parsedData?.height || (row as any).height || undefined,
            duration: parsedData?.duration || row.duration || undefined,
            waveform: parsedData?.waveform || row.waveform || undefined,
            audioMetadata: parsedData?.audioMetadata || row.audio_metadata || undefined,
            linkPreview: parsedData?.linkPreview || row.link_preview || undefined,
            reactions: row.reactions || undefined,
            systemType: parsedData?.systemType || undefined,
            actorNickname: parsedData?.actorNickname || undefined,
            targetNickname: parsedData?.targetNickname || undefined,
          };
          newMessages.push(msgItem);
          try {
            (window as any).orbita?.storageAddMessage?.(targetGroupId, row.id, msgItem);
          } catch {}
        }
        if (newMessages.length > 0) {
          if (useChatStore.getState().activeChatId !== targetGroupId) return;
          const el = messagesContainerRef.current;
          const wasAtBottom = el ? (el.scrollHeight - el.scrollTop - el.clientHeight <= 120) : true;
          const prevScrollTop = el?.scrollTop ?? 0;
          const prevScrollHeight = el?.scrollHeight ?? 0;

          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [targetGroupId]: [...(state.messagesByChatId[targetGroupId] || []), ...newMessages].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0)),
            },
          }));

          requestAnimationFrame(() => {
            const currentEl = messagesContainerRef.current;
            if (!currentEl) return;
            const entry = chatScrollRegistry.get(targetGroupId);
            if (entry && !entry.atBottom) {
              restoreChatScroll(targetGroupId, currentEl);
            } else if (wasAtBottom) {
              currentEl.scrollTop = currentEl.scrollHeight;
              saveChatScroll(targetGroupId, currentEl);
            } else {
              const delta = currentEl.scrollHeight - prevScrollHeight;
              currentEl.scrollTop = prevScrollTop + delta;
              saveChatScroll(targetGroupId, currentEl);
            }
          });
        }
      }).catch(() => {});

      groupService.getActiveCall(targetGroupId).then((call) => {
        if (call && call.status === 'active') {
          useChatStore.getState().updateChat(targetGroupId, { activeCallRoom: call.roomName });
        } else {
          useChatStore.getState().updateChat(targetGroupId, { activeCallRoom: null });
        }
      }).catch(() => {});
    }

    const ablyTopic = activeChat?.type === 'channel' ? `public-channel-${activeChatId}` : activeChatId;
    const unsubAbly = ablyService.subscribeToChatMessages(ablyTopic, async (data: any) => {
      if (data?.type === 'channel-post' && data?.post) {
        const post = data.post;
        if (post && post.id) {
          if (activeChat?.type !== 'channel') return;
          if (post.channelId && post.channelId !== activeChatId) return;
          if (useChatStore.getState().activeChatId !== activeChatId) return;
          let postText = post.text || '';
          if (postText.startsWith('orb_e2e:')) {
            const channelKey = deriveChannelKey(activeChatId);
            const decrypted = await decryptMessage(postText.slice(8), channelKey);
            if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
              postText = decrypted;
            }
          }
          if (useChatStore.getState().activeChatId !== activeChatId) return;
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const existing = currentMsgs.find((m) => m.id === post.id);
          if (existing) {
            if (existing.text !== postText && !postText.startsWith('orb_e2e:')) {
              useChatStore.setState((state) => ({
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                    m.id === post.id ? { ...m, text: postText } : m
                  ),
                },
              }));
            }
          }
        }
      } else if (data?.type === 'subscribers-updated' && typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(activeChatId, {
          subscribersCount: data.subscribersCount,
        });
      } else if (data?.type === 'reaction-updated' && data?.postId && data?.reactions) {
        if (data.sessionId && data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyNickname = useAuthStore.getState().nickname;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.userId === currentMyUserId || data.senderUserId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode || data.userId === currentMyCode)) ||
          (currentMyNickname && (data.userId === currentMyNickname || data.sender === currentMyNickname)) ||
          data.userId === 'YOU'
        );
        if (isSelf) return;

        const aliases = new Set([currentMyUserId, currentMyCode, currentMyNickname, 'YOU'].filter(Boolean).map((s) => s!.toLowerCase()));

        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) => {
                if (m.id !== data.postId) return m;
                const merged: Record<string, string[]> = {};
                const allEmojis = new Set([...Object.keys(m.reactions || {}), ...Object.keys(data.reactions || {})]);
                for (const em of allEmojis) {
                  const serverUsers = (data.reactions[em] || []).filter((u: string) => !aliases.has(u.toLowerCase()));
                  const hadSelf = (m.reactions?.[em] || []).some((u: string) => aliases.has(u.toLowerCase()));
                  const finalUsers = hadSelf ? [...serverUsers, 'YOU'] : serverUsers;
                  if (finalUsers.length > 0) {
                    merged[em] = finalUsers;
                  }
                }
                return {
                  ...m,
                  reactions: Object.keys(merged).length > 0 ? merged : undefined,
                };
              }),
            },
          };
        });
      } else if (data?.type === 'reaction' && data?.emoji && data?.sender) {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === myNickname)
        );
        if (isSelf) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
      } else if (data?.type === 'delete' || data?.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(activeChatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const updated = currentMsgs.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          }));
        }
      } else if (data?.type === 'read') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === myNickname)
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updated = currentMsgs.map((msg) => {
          const isOut = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
          if (!isOut) return msg;
          if ((data.messageId && msg.id === data.messageId) || (data.readIds && data.readIds.includes(msg.id)) || (data.time && msg.time <= data.time)) {
            const readMsg = { ...msg, read: true, status: 'read' as const };
            if (readMsg.id) readIds.push(readMsg.id);
            readMsgObjects.push(readMsg);
            if (readMsg.mediaUrl) readMediaUrls.push(readMsg.mediaUrl);
            if (readMsg.mediaItems && Array.isArray(readMsg.mediaItems)) {
              for (const item of readMsg.mediaItems) {
                if (item?.url) readMediaUrls.push(item.url);
              }
            }
            return readMsg;
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
        }
        if (readMediaUrls.length > 0) {
          mediaManager.purgeServerMedia(readMediaUrls);
        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(activeChatId, rm.id, rm).catch(() => {});
            }
          }
        }
      }
    });

    const pusher = activeChat?.type === 'group' ? getGroupPusher() : getPusher();
    const channelName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : activeChat?.type === 'group'
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.subscribe(channelName);

    const handleReaction = (data: { chatId?: string; messageIndex?: number; messageId?: string; id?: string; emoji?: string; sender?: string; action?: 'add' | 'remove' | 'toggle'; type?: string; senderUserId?: string; senderId?: string; senderCode?: string; userId?: string }) => {
      const isSelf = Boolean(
        (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === myNickname)
      );
      if (isSelf) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    const handleClientMessage = (data: any) => {
      if (data?.type === 'group-call-ended' || data?.type === 'client-group-call-ended') {
        useChatStore.getState().updateChat(activeChatId, { activeCallRoom: null });
        return;
      }
      if (data?.type === 'group-call-started' || data?.type === 'client-group-call-started') {
        useChatStore.getState().updateChat(activeChatId, { activeCallRoom: data.roomName || `group-call-${activeChatId}` });
        return;
      }
      if (activeChat?.type === 'group' && (data.type === 'message' || data.type === 'group-message')) {
        if (data.chatId && data.chatId !== activeChatId) return;
        if (data.groupId && data.groupId !== activeChatId) return;
        if (useChatStore.getState().activeChatId !== activeChatId) return;
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === myNickname)
        );
        if (isSelf) return;
        const rawCipher = data.ciphertext || data.text;
        if (!rawCipher) return;
        const sec = activeChat.sharedSecret ||
          (activeChat.inviteCode && isValidGroupCode(activeChat.inviteCode) ? deriveGroupKey(activeChat.inviteCode) : undefined) ||
          (activeChat.code && isValidGroupCode(activeChat.code) ? deriveGroupKey(activeChat.code) : undefined) ||
          deriveGroupKey(activeChatId);
        if (sec) {
          decryptMessage(rawCipher, sec).then((dec) => {
            if (useChatStore.getState().activeChatId !== activeChatId) return;
            let parsed: any;
            if (dec && dec !== '[ENCRYPTED MESSAGE]') {
              try { parsed = JSON.parse(dec); } catch { parsed = { text: dec }; }
            } else {
              parsed = { text: dec || rawCipher };
            }
            const mid = parsed?.id || data.messageId || data.id || `msg_${Date.now()}`;
            const existing = (useChatStore.getState().messagesByChatId[activeChatId] || []).some(m => m.id === mid);
            if (existing) return;
            const isVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
            const item: Message = {
              id: mid,
              sender: data.sender,
              senderId: data.senderCode || data.senderId,
              text: parsed?.text !== undefined ? parsed.text : dec,
              time: data.time || Date.now(),
              read: isVisible,
              status: isVisible ? 'read' : 'delivered',
              isOutgoing: false,
              mediaType: parsed?.mediaType || data.mediaType || undefined,
              mediaUrl: parsed?.mediaUrl || data.mediaUrl || undefined,
              mediaName: parsed?.mediaName || data.mediaName || undefined,
              mediaKey: parsed?.mediaKey || data.mediaKey || undefined,
              mime: parsed?.mime || data.mime || undefined,
              mediaItems: parsed?.mediaItems || data.mediaItems || undefined,
              width: parsed?.width || data.width || undefined,
              height: parsed?.height || data.height || undefined,
              duration: parsed?.duration || data.duration || undefined,
              waveform: parsed?.waveform || data.waveform || undefined,
              audioMetadata: parsed?.audioMetadata || data.audioMetadata || undefined,
              linkPreview: parsed?.linkPreview || data.linkPreview || undefined,
              systemType: parsed?.systemType || data.systemType || undefined,
              actorNickname: parsed?.actorNickname || data.actorNickname || undefined,
              targetNickname: parsed?.targetNickname || data.targetNickname || undefined,
            };
            useChatStore.getState().addMessage(activeChatId, item);
            if (item.systemType === 'call_ended') {
              useChatStore.getState().updateChat(activeChatId, { activeCallRoom: null });
            } else if (item.systemType === 'call') {
              groupService.getActiveCall(activeChatId).then((call) => {
                if (call && call.status === 'active') {
                  useChatStore.getState().updateChat(activeChatId, { activeCallRoom: call.roomName });
                }
              }).catch(() => {});
            }
            try {
              (window as any).orbita?.storageAddMessage?.(activeChatId, mid, item);
            } catch {}
            if (isVisible) {
              notifyPeerReadBatch(mid, data.time || Date.now(), [mid]);
            }
          });
        }
        return;
      }

      if (data.type === 'read') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
          (!data.senderUserId && !data.senderCode && !data.senderId && data.sender === myNickname)
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const readIds: string[] = [];
        const readMediaUrls: string[] = [];
        const readMsgObjects: Message[] = [];
        const updated = currentMsgs.map((msg) => {
          const isOut = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
          if (!isOut) return msg;
          if ((data.messageId && msg.id === data.messageId) || (data.readIds && data.readIds.includes(msg.id)) || (data.time && msg.time <= data.time)) {
            const readMsg = { ...msg, read: true, status: 'read' as const };
            if (readMsg.id) readIds.push(readMsg.id);
            readMsgObjects.push(readMsg);
            if (readMsg.mediaUrl) readMediaUrls.push(readMsg.mediaUrl);
            if (readMsg.mediaItems && Array.isArray(readMsg.mediaItems)) {
              for (const item of readMsg.mediaItems) {
                if (item?.url) readMediaUrls.push(item.url);
              }
            }
            return readMsg;
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        }));
        if (readIds.length > 0) {
          supabaseService.purgeServerMessages(activeChatId, readIds);
        }
        if (readMediaUrls.length > 0) {
          mediaManager.purgeServerMedia(readMediaUrls);
        }
        if (typeof window !== 'undefined' && (window as any).orbita?.storageAddMessage) {
          for (const rm of readMsgObjects) {
            if (rm.id) {
              (window as any).orbita.storageAddMessage(activeChatId, rm.id, rm).catch(() => {});
            }
          }
        }
        return;
      }

      if (data.type === 'delivered') {
        const isSelf = Boolean(
          (myUserId && (data.senderUserId === myUserId || data.userId === myUserId || data.senderId === myUserId)) ||
          (myCode && (data.senderCode === myCode || data.senderId === myCode))
        );
        if (isSelf) return;
        const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
        const updated = currentMsgs.map((msg) =>
          (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && (msg.isOutgoing || isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId)))
            ? (msg.status === 'read' ? msg : { ...msg, status: 'delivered' as const })
            : msg
        );
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [activeChatId]: updated,
          },
        }));
        return;
      }

      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyNickname = useAuthStore.getState().nickname;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.senderUserId === currentMyUserId || data.userId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode)) ||
          (currentMyNickname && (data.sender === currentMyNickname || data.senderNickname === currentMyNickname)) ||
          data.sender === 'YOU'
        );
        if (isSelf) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
      } else if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(activeChatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          const updated = currentMsgs.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          }));
        }
      }
    };

    const handleChannelPost = async (post: any) => {
      if (!post || !post.id) return;
      if (activeChat?.type !== 'channel') return;
      if (post.channelId && post.channelId !== activeChatId) return;
      if (useChatStore.getState().activeChatId !== activeChatId) return;
      let postText = post.text || '';
      if (postText.startsWith('orb_e2e:')) {
        const channelKey = deriveChannelKey(activeChatId);
        const decrypted = await decryptMessage(postText.slice(8), channelKey);
        if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
          postText = decrypted;
        }
      }
      if (useChatStore.getState().activeChatId !== activeChatId) return;
      const validPostTime = (typeof post.time === 'number' && post.time > 0) ? post.time : Date.now();
      const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
      const existingById = currentMsgs.find((m) => m.id === post.id);
      if (existingById) {
        if (existingById.text !== postText && !postText.startsWith('orb_e2e:')) {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: (state.messagesByChatId[activeChatId] || []).map((m) =>
                m.id === post.id ? { ...m, text: postText } : m
              ),
            },
          }));
        }
        return;
      }
      const optimisticMatch = currentMsgs.find((m) =>
        m.isOutgoing &&
        m.status === 'sending' &&
        ((post.text && m.text === postText) || (post.mediaUrl && m.mediaUrl === post.mediaUrl) || (post.mediaName && m.mediaName === post.mediaName)) &&
        Math.abs((m.time || 0) - validPostTime) < 120000
      );
      if (optimisticMatch) {
        try {
          (window as any).orbita?.storageDeleteMessage?.(optimisticMatch.id).catch(() => {});
        } catch {}
        useChatStore.setState((state) => {
          const list = state.messagesByChatId[activeChatId] || [];
          const updated = list.map((m) =>
            m.id === optimisticMatch.id
              ? { ...m, id: post.id, time: validPostTime, text: postText, status: 'read' as const }
              : m
          );
          const saved = updated.find((m) => m.id === post.id);
          if (saved) {
            try {
              (window as any).orbita?.storageAddMessage?.(activeChatId, post.id, saved).catch(() => {});
            } catch {}
          }
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: updated,
            },
          };
        });
        return;
      }
    };

    const handleChannelReaction = (data: any) => {
      if (data?.postId && data?.reactions) {
        if (data.sessionId && data.sessionId === CLIENT_SESSION_ID) return;
        const currentMyUserId = useAuthStore.getState().userId;
        const currentMyNickname = useAuthStore.getState().nickname;
        const currentMyCode = useChatStore.getState().myCode;
        const isSelf = Boolean(
          (currentMyUserId && (data.userId === currentMyUserId || data.senderUserId === currentMyUserId || data.senderId === currentMyUserId)) ||
          (currentMyCode && (data.senderCode === currentMyCode || data.senderId === currentMyCode || data.userId === currentMyCode)) ||
          (currentMyNickname && (data.userId === currentMyNickname || data.sender === currentMyNickname)) ||
          data.userId === 'YOU'
        );
        if (isSelf) return;

        const aliases = new Set([currentMyUserId, currentMyCode, currentMyNickname, 'YOU'].filter(Boolean).map((s) => s!.toLowerCase()));

        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) => {
                if (m.id !== data.postId) return m;
                const merged: Record<string, string[]> = {};
                const allEmojis = new Set([...Object.keys(m.reactions || {}), ...Object.keys(data.reactions || {})]);
                for (const em of allEmojis) {
                  const serverUsers = (data.reactions[em] || []).filter((u: string) => !aliases.has(u.toLowerCase()));
                  const hadSelf = (m.reactions?.[em] || []).some((u: string) => aliases.has(u.toLowerCase()));
                  const finalUsers = hadSelf ? [...serverUsers, 'YOU'] : serverUsers;
                  if (finalUsers.length > 0) {
                    merged[em] = finalUsers;
                  }
                }
                return {
                  ...m,
                  reactions: Object.keys(merged).length > 0 ? merged : undefined,
                };
              }),
            },
          };
        });
      }
    };

    const handleSubscribersUpdated = (data: any) => {
      if (typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(activeChatId, {
          subscribersCount: data.subscribersCount,
        });
      }
    };

    const handlePresenceSub = (members: any) => {
      const ids: string[] = [];
      if (members) {
        if (typeof members.each === 'function') {
          members.each((m: any) => {
            if (m.id) ids.push(String(m.id));
            if (m.info?.userId) ids.push(String(m.info.userId));
            if (m.info?.nickname) ids.push(String(m.info.nickname));
          });
        } else if (members.members && typeof members.members === 'object') {
          Object.entries(members.members).forEach(([k, v]: [string, any]) => {
            ids.push(k);
            if (v?.userId) ids.push(String(v.userId));
            if (v?.nickname) ids.push(String(v.nickname));
          });
        }
      }
      const count = typeof members?.count === 'number' ? members.count : (ids.length > 0 ? ids.length : undefined);
      useChatStore.getState().updateChat(activeChatId, {
        ...(count !== undefined ? { onlineCount: count } : {}),
        ...(ids.length > 0 ? { onlineMemberIds: Array.from(new Set(ids)) } : {}),
      });
    };
    const handleMemberAdded = (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === activeChatId);
      const newCount = (current?.onlineCount || 1) + 1;
      const curIds = current?.onlineMemberIds || [];
      const addIds = [member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String);
      useChatStore.getState().updateChat(activeChatId, {
        onlineCount: newCount,
        onlineMemberIds: Array.from(new Set([...curIds, ...addIds])),
      });
    };
    const handleMemberRemoved = (member: any) => {
      const current = useChatStore.getState().chats.find((c) => c.id === activeChatId);
      const newCount = Math.max(1, (current?.onlineCount || 2) - 1);
      const curIds = current?.onlineMemberIds || [];
      const remIds = new Set([member?.id, member?.info?.userId, member?.info?.nickname].filter(Boolean).map(String));
      useChatStore.getState().updateChat(activeChatId, {
        onlineCount: newCount,
        onlineMemberIds: curIds.filter((id) => !remIds.has(id)),
      });
    };

    const handleGroupCallStarted = (data: any) => {
      useChatStore.getState().updateChat(activeChatId, { activeCallRoom: data?.roomName || `group-call-${activeChatId}` });
    };
    const handleGroupCallEnded = () => {
      useChatStore.getState().updateChat(activeChatId, { activeCallRoom: null });
    };

    channel.bind('reaction', handleReaction);
    channel.bind('client-message', handleClientMessage);
    channel.bind('new-post', handleChannelPost);
    channel.bind('reaction-updated', handleChannelReaction);
    channel.bind('subscribers-updated', handleSubscribersUpdated);
    channel.bind('pusher:subscription_succeeded', handlePresenceSub);
    channel.bind('pusher:member_added', handleMemberAdded);
    channel.bind('pusher:member_removed', handleMemberRemoved);
    channel.bind('group-call-started', handleGroupCallStarted);
    channel.bind('client-group-call-started', handleGroupCallStarted);
    channel.bind('group-call-ended', handleGroupCallEnded);
    channel.bind('client-group-call-ended', handleGroupCallEnded);

    return () => {
      unsubAbly();
      channel.unbind('reaction', handleReaction);
      channel.unbind('client-message', handleClientMessage);
      channel.unbind('new-post', handleChannelPost);
      channel.unbind('reaction-updated', handleChannelReaction);
      channel.unbind('subscribers-updated', handleSubscribersUpdated);
      channel.unbind('pusher:subscription_succeeded', handlePresenceSub);
      channel.unbind('pusher:member_added', handleMemberAdded);
      channel.unbind('pusher:member_removed', handleMemberRemoved);
      channel.unbind('group-call-started', handleGroupCallStarted);
      channel.unbind('client-group-call-started', handleGroupCallStarted);
      channel.unbind('group-call-ended', handleGroupCallEnded);
      channel.unbind('client-group-call-ended', handleGroupCallEnded);
    };
  }, [activeChatId, activeChat?.type, myNickname]);

  const getMessageMenuType = useCallback((msg: Message): 'text' | 'singleImage' | 'multipleImages' | 'file' | 'sticker' => {
    const media = parseMedia(msg);
    if (msg.mediaItems && msg.mediaItems.length > 1) {
      return 'multipleImages';
    }
    const isGif = Boolean(
      (media.url && /\.gif(\?.*)?$/i.test(media.url)) ||
      (msg.mediaUrl && (
        /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
        msg.mediaUrl.includes('tenor.com') ||
        msg.mediaUrl.includes('giphy.com') ||
        msg.mediaUrl.includes('.giphy.') ||
        msg.mediaUrl.includes('c.tenor.com')
      )) ||
      (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
    );
    if (isGif) {
      return 'file';
    }
    if (media.type === 'sticker' || msg.mediaType === 'sticker' || (msg.text && /^\[Sticker\]/i.test(msg.text.trim()))) {
      return 'sticker';
    }
    if (media.type === 'image') {
      return 'singleImage';
    }
    if (media.type === 'file' || media.type === 'video' || media.type === 'music' || media.type === 'voice') {
      return 'file';
    }
    return 'text';
  }, []);

  const handleContextMenu = (e: React.MouseEvent, index: number, isOwn: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 224, 280);
    const msg = messages[index];
    const type = getMessageMenuType(msg);
    const hasMultipleImages = msg.mediaItems ? msg.mediaItems.filter(item => item.type === 'photo').length > 1 : false;
    setContextMenu({ visible: true, x, y, messageIndex: index, messageId: msg?.id, isOwn, type, hasMultipleImages });
  };

  const handleReply = (index: number) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const originalMessage = messages[index];
    let cleanText = originalMessage.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
    if (/^\[Sticker\]/i.test(cleanText) || cleanText.includes('/stickers/') || cleanText.includes('\\stickers\\') || cleanText.includes('.stickers')) {
      cleanText = '[Sticker]';
    }
    const originalSenderId = originalMessage.senderId || (originalMessage.sender === myNickname ? myCode : activeChat?.peerCode);
    setReplyingTo({
      id: originalMessage.id,
      senderId: originalSenderId,
      index,
      sender: originalMessage.sender,
      text: cleanText,
      time: originalMessage.time,
    });
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleEdit = (index: number) => {
    if (activeChat?.type === 'channel' && !isChannelOwner) return;
    const msg = messages[index];
    if (msg.mediaType) {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'csv', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dmg', 'apk', 'iso'];
      window.orbita.pickFile(allowedExtensions).then(async (raw) => {
        if (!raw) return;
        const filePath = Array.isArray(raw) ? raw[0] : raw;
        if (!filePath) return;
        const fileName = filePath.split(/[\\/]/).pop() || 'file';
        const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
        let fileType: 'photo' | 'video' | 'audio' | 'document' = 'document';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'photo';
        else if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext)) fileType = 'video';
        else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac'].includes(ext)) fileType = 'audio';
        try {
          const dataUrl = await window.orbita.readFileAsDataURL(filePath);
          if (!dataUrl) return;
          const binary = atob(dataUrl.split(',')[1] || '');
          const fileArrayBuffer = new ArrayBuffer(binary.length);
          const view = new Uint8Array(fileArrayBuffer);
          for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
          const fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(fileArrayBuffer, fileKey);
          const encryptedBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(encryptedBlob);
          });
          const tempPath = await window.orbita.writeTempFile(encryptedBase64);
          if (!tempPath) return;
          const publicId = `orbita_${Date.now()}`;
          const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
          window.orbita.deleteTempFile(tempPath);
          if (result.success && result.secure_url) {
            triggerDeleteMessage(index);
            const prefix = { photo: '[Photo]', video: '[Video]', audio: '[Audio]', document: '[File]' }[fileType];
            const text = `${prefix} ${fileName}`;
            triggerMessage(text, {
              type: fileType === 'photo' ? 'photo' : fileType === 'video' ? 'video' : fileType === 'audio' ? 'audio' : 'file',
              url: result.secure_url,
              key: fileKey,
              name: fileName,
            });
          }
        } catch (err) {
          console.error('Failed to replace file:', err);
        }
      });
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }
    setEditingIndex(index);
    setEditText(messages[index].text);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleCopy = (index: number) => {
    const cleanText = messages[index].text.replace(/^↩\s.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
    navigator.clipboard.writeText(cleanText);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleCopyImage = async (blobUrlOrUrl: string) => {
    try {
      let arrayBuffer: ArrayBuffer | null = null;
      let blob: Blob | null = null;
      const response = await fetch(blobUrlOrUrl);
      blob = await response.blob();
      arrayBuffer = await blob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);

      if (window.orbita && window.orbita.copyImage) {
        await window.orbita.copyImage(base64);
        useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
      } else {
        const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
      }
    } catch (e) {
      try {
        const response = await fetch(blobUrlOrUrl);
        const blob = await response.blob();
        const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        useToastStore.getState().showToast(t('common.image_saved_to_clipboard'), 'image');
      } catch (err) {
        console.error('Failed to copy image:', err);
      }
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const convertToPng = (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleSaveAs = async (index: number) => {
    const msg = messages[index];
    if (!msg) {
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }
    const media = parseMedia(msg);
    const mediaUrl = media.url || msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? null);
    if (!mediaUrl) {
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }

    const isGif = Boolean(
      /\.gif(\?.*)?$/i.test(mediaUrl) ||
      mediaUrl.includes('giphy.com') ||
      mediaUrl.includes('.giphy.') ||
      mediaUrl.includes('tenor.com') ||
      (msg.text && /^\[GIF\]/i.test(msg.text.trim())) ||
      (msg.mediaName && /\.mp4$/i.test(msg.mediaName) && msg.text?.includes('[GIF]')) ||
      (msg.mime === 'video/mp4' && msg.text?.includes('[GIF]'))
    );

    let defaultName = media.fileName || msg.mediaName || '';
    if (media.type === 'voice') {
      defaultName = defaultName ? defaultName.replace(/\.[^.]+$/, '.ogg') : `voice_${Date.now()}.ogg`;
      if (!defaultName.toLowerCase().endsWith('.ogg')) {
        defaultName += '.ogg';
      }
    } else if (!defaultName || (isGif && defaultName.endsWith('.gif'))) {
      if (isGif) {
        const titleMatch = msg.text?.match(/^\[GIF\]\s*https?:\/\/[^\s\/]+\/([^\/\?]+)/);
        const rawName = titleMatch ? titleMatch[1].replace(/[-_]giphy|[-_]tenor/gi, '') : 'animation';
        defaultName = `${rawName.replace(/\.(gif|mp4|webm)$/i, '') || 'animation'}.mp4`;
      } else if (media.type === 'image' || media.type === 'sticker') {
        defaultName = `photo_${Date.now()}.jpg`;
      } else if (media.type === 'video') {
        defaultName = `video_${Date.now()}.mp4`;
      } else if (media.type === 'music' || media.type === 'audio') {
        const cleanTitle = (msg.audioMetadata?.title || msg.text || '').replace(/^\[(?:Audio|Music|File)\]\s*/i, '').trim();
        const artist = msg.audioMetadata?.artist || '';
        defaultName = cleanTitle && cleanTitle !== 'Audio Track' ? (artist ? `${artist} - ${cleanTitle}.mp3` : `${cleanTitle}.mp3`) : `audio_${Date.now()}.mp3`;
      } else {
        defaultName = `file_${Date.now()}`;
      }
    }

    const filters = isGif
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mp4v', 'mpg4'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'image' || media.type === 'sticker'
      ? [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'video'
      ? [{ name: 'video/mp4 (*.mp4 *.mp4v *.mpg4)', extensions: ['mp4', 'mov', 'webm', 'avi', 'mkv'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'music' || media.type === 'audio'
      ? [{ name: 'Audio (*.mp3 *.wav *.flac *.aac *.ogg *.m4a)', extensions: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] }, { name: 'All Files', extensions: ['*'] }]
      : media.type === 'voice'
      ? [{ name: 'Voice (*.ogg)', extensions: ['ogg'] }]
      : [{ name: 'All Files', extensions: ['*'] }];

    try {
      let arrayBuffer: ArrayBuffer | null = null;
      const fileSecret = msg.mediaKey || sharedSecret;
      const cacheKey = fileSecret ? `${mediaUrl}::${fileSecret}` : null;
      const cached = (cacheKey && fileSecret) ? (decryptedUrlCache.get(cacheKey) || mediaManager.getCachedMedia(mediaUrl, fileSecret)?.blobUrl) : null;

      if (cached) {
        const response = await fetch(cached);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      } else if (mediaUrl.startsWith('data:') || mediaUrl.startsWith('blob:')) {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      } else if (fileSecret) {
        const item = await mediaManager.getMedia(mediaUrl, fileSecret, defaultName, activeChatId || undefined, msg.id);
        if (item && item.blobUrl) {
          const response = await fetch(item.blobUrl);
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        }
      } else {
        const response = await fetch(mediaUrl);
        const blob = await response.blob();
        arrayBuffer = await blob.arrayBuffer();
      }

      if (arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(uint8, defaultName, filters);
        } else if (window.orbita && window.orbita.downloadsSave) {
          await window.orbita.downloadsSave(arrayBufferToBase64(arrayBuffer), defaultName);
        } else {
          const blob = new Blob([arrayBuffer]);
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = defaultName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }
      } else if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(mediaUrl, defaultName, filters);
        }
      }
    } catch (err) {
      if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
        if (window.orbita && window.orbita.saveFileAs) {
          await window.orbita.saveFileAs(mediaUrl, defaultName, filters);
        }
      }
      console.error('Failed to save file:', err);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const isMessagePinned = (index: number): boolean => {
    if (!pinnedMessage) return false;
    const msg = messages[index];
    if (!msg) return false;
    if (pinnedMessage.id && msg.id) return msg.id === pinnedMessage.id;
    if (pinnedMessage.messageId && msg.id) return msg.id === pinnedMessage.messageId;
    return msg.sender === pinnedMessage.sender && msg.text === pinnedMessage.text && msg.time === pinnedMessage.time;
  };

  const isRatchetReady = useMemo(() => {
    if (!activeChat) return false;
    // Always allow typing; actual E2EE guard is inside triggerMessage
    return true;
  }, [activeChat]);

  const canSend = (!!inputText.trim() || !!attachedFiles.length) && editingIndex === null && isRatchetReady;

  const handleStartRecording = useCallback(async () => {
    const isBotChat = activeChatId === 'system_support';
    const isChannel = activeChat?.type === 'channel';
    if (!isBotChat && !isChannel && (!sharedSecret || !isRatchetReady)) return;
    if (isChannel && !isChannelOwner) return;
    try {
      await startAudioRecording();
    } catch (err) {
      showToast(t('chatWindow.mic_permission_error'));
    }
  }, [activeChatId, activeChat?.type, isChannelOwner, sharedSecret, isRatchetReady, startAudioRecording, showToast, t]);


  const handleStopRecordingAndSend = useCallback(async () => {
    const recorded = await stopAudioRecording();
    if (!recorded || !recorded.blob) return;

    const { blob, duration, waveform } = recorded;
    if (!activeChatId) return;

    const isBotChat = activeChatId === 'system_support';
    const isChannel = activeChat?.type === 'channel';
    if (!isBotChat && !isChannel && !sharedSecret) return;
    if (isChannel && !isChannelOwner) return;

    const voiceFileName = `voice_${Date.now()}.ogg`;

    const localBlobUrl = URL.createObjectURL(blob);
    const optimisticMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    mediaManager.setDirectDecryptedMedia(localBlobUrl, '', blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
    if (sharedSecret) {
      mediaManager.setDirectDecryptedMedia(localBlobUrl, sharedSecret, blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
    }

    const optimisticMessage: Message = {
      id: optimisticMessageId,
      senderId: myCode,
      sender: myNickname,
      isOutgoing: true,
      text: `[Audio] ${voiceFileName}`,
      time: Date.now(),
      read: true,
      status: 'sending',
      uploading: true,
      mediaType: 'voice',
      mediaUrl: localBlobUrl,
      mediaName: voiceFileName,
      mime: 'audio/ogg;codecs=opus',
      duration,
      waveform,
    };

    addMessage(activeChatId, optimisticMessage);
    updateChat(activeChatId, { lastMsg: t('chatWindow.voice_message') || voiceFileName });
    requestAnimationFrame(() => scrollToBottom(false));

    (async () => {
      try {
        const isPublic = isBotChat || isChannel;
        let fileKey: string | undefined = undefined;
        let encryptedBase64: string;

        if (isPublic) {
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSz = 8192;
          for (let j = 0; j < uint8.length; j += chunkSz) {
            binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(j, j + chunkSz)));
          }
          encryptedBase64 = btoa(binary);
        } else {
          const arrayBuffer = await blob.arrayBuffer();
          fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(arrayBuffer, fileKey);
          encryptedBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(encryptedBlob);
          });
        }

        const tempPath = await window.orbita.writeTempFile(encryptedBase64, isPublic ? 'ogg' : undefined);
        if (!tempPath) {
          showToast(t('chatWindow.upload_failed'));
          useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
          return;
        }

        const publicId = `orbita_${Date.now()}`;
        const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
        window.orbita.deleteTempFile?.(tempPath);

        if (result.success && result.secure_url) {
          mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
          if (sharedSecret && sharedSecret !== fileKey) {
            mediaManager.setDirectDecryptedMedia(result.secure_url, sharedSecret, blob, 'audio/ogg;codecs=opus', activeChatId, optimisticMessageId);
          }
          await triggerMessage(
            `[Audio] ${voiceFileName}`,
            {
              type: 'voice',
              url: result.secure_url,
              key: fileKey,
              name: voiceFileName,
              mime: 'audio/ogg;codecs=opus',
              duration,
              waveform,
            },
            undefined,
            optimisticMessageId
          );
        } else {
          showToast(t('chatWindow.upload_failed'));
          useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
        }
      } catch (error) {
        console.error('Failed to upload recorded audio:', error);
        showToast(t('chatWindow.upload_failed'));
        useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
      }
    })();
  }, [sharedSecret, activeChatId, activeChat?.type, isChannelOwner, stopAudioRecording, triggerMessage, showToast, t, myCode, myNickname, addMessage, updateChat, scrollToBottom]);

  const getMediaDimensionsForFile = useCallback(async (
    filePath: string,
    fileType: AttachedFile['fileType']
  ): Promise<{ width?: number; height?: number; duration?: number; blurPreview?: string; preview?: string }> => {
    if (fileType === 'photo') {
      const dataUrl = await window.orbita.readFileAsDataURL(filePath);
      if (!dataUrl) return {};
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          let blurPreview: string | undefined = undefined;
          try {
            const canvas = document.createElement('canvas');
            const scale = Math.min(24 / img.naturalWidth, 24 / img.naturalHeight, 1);
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              blurPreview = canvas.toDataURL('image/jpeg', 0.4);
            }
          } catch {}
          resolve({ width: img.naturalWidth, height: img.naturalHeight, blurPreview });
        };
        img.onerror = () => resolve({});
        img.src = dataUrl;
      });
    } else if (fileType === 'video') {
      let videoSrc = '';
      if (typeof window !== 'undefined' && (window as any).orbita?.rustReadFileFast) {
        try {
          const binary = await (window as any).orbita.rustReadFileFast(filePath);
          if (binary) {
            const blob = new Blob([binary], { type: 'video/mp4' });
            videoSrc = URL.createObjectURL(blob);
          }
        } catch {}
      }
      if (!videoSrc) {
        const dataUrl = await window.orbita?.readFileAsDataURL?.(filePath);
        if (!dataUrl) return {};
        videoSrc = dataUrl;
      }

      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        let hasResolved = false;
        const cleanup = () => {
          if (videoSrc.startsWith('blob:')) {
            URL.revokeObjectURL(videoSrc);
          }
        };

        const timeout = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            resolve({
              width: video.videoWidth || undefined,
              height: video.videoHeight || undefined,
              duration: isFinite(video.duration) ? video.duration : undefined,
            });
          }
        }, 4000);

        const captureFrame = () => {
          if (hasResolved) return;
          hasResolved = true;
          clearTimeout(timeout);

          let preview: string | undefined;
          let blurPreview: string | undefined;

          try {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 360;
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(vw, 1280);
            canvas.height = Math.round(canvas.width * (vh / vw));
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              preview = canvas.toDataURL('image/jpeg', 0.85);

              const smallCanvas = document.createElement('canvas');
              const scale = Math.min(24 / canvas.width, 24 / canvas.height, 1);
              smallCanvas.width = Math.max(1, Math.round(canvas.width * scale));
              smallCanvas.height = Math.max(1, Math.round(canvas.height * scale));
              const sCtx = smallCanvas.getContext('2d');
              if (sCtx) {
                sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
                blurPreview = smallCanvas.toDataURL('image/jpeg', 0.4);
              }
            }
          } catch {}

          cleanup();
          resolve({
            width: video.videoWidth || undefined,
            height: video.videoHeight || undefined,
            duration: isFinite(video.duration) ? video.duration : undefined,
            preview,
            blurPreview,
          });
        };

        video.onloadeddata = () => {
          try {
            video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
          } catch {
            captureFrame();
          }
        };

        video.onseeked = () => {
          captureFrame();
        };

        video.onerror = () => {
          if (!hasResolved) {
            hasResolved = true;
            clearTimeout(timeout);
            cleanup();
            resolve({});
          }
        };

        video.src = videoSrc;
        video.load();
      });
    }
    return {};
  }, []);

  const handleFilePick = useCallback(async () => {
    try {
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'csv', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'exe', 'dmg', 'apk', 'iso'];
      const rawResult = await window.orbita.pickFile(allowedExtensions);
      if (!rawResult) return;
      const filePaths: string[] = Array.isArray(rawResult) ? rawResult : [rawResult];
      if (filePaths.length === 0) return;

      const newFiles: AttachedFile[] = [];

      for (const filePath of filePaths) {
        if (!filePath) continue;
        const fileName = filePath.split(/[\\/]/).pop() || 'file';
        const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
        let fileType: 'photo' | 'video' | 'audio' | 'document' = 'document';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'photo';
        else if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext)) fileType = 'video';
        else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'ape', 'alac'].includes(ext)) fileType = 'audio';

        let preview: string | null = null;
        let sizeMb = 0;
        try {
          if (fileType === 'photo') {
            const dataUrl = await window.orbita.readFileAsDataURL(filePath);
            if (dataUrl) {
              preview = dataUrl;
              const binary = atob(dataUrl.split(',')[1] || '');
              const fileArrayBuffer = new ArrayBuffer(binary.length);
              const view = new Uint8Array(fileArrayBuffer);
              for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
              sizeMb = fileArrayBuffer.byteLength / (1024 * 1024);
            }
          } else {
            const sizeBytes = await window.orbita.getFileSize(filePath);
            if (sizeBytes) {
              sizeMb = sizeBytes / (1024 * 1024);
            } else {
              const dataUrl = await window.orbita.readFileAsDataURL(filePath);
              if (dataUrl) {
                const binary = atob(dataUrl.split(',')[1] || '');
                sizeMb = binary.length / (1024 * 1024);
              }
            }
          }
        } catch { }

        if (sizeMb > MAX_FILE_MB) {
          setIsDiscordFileLimitModalOpen(true);
          continue;
        }

        let audioMetadata: AudioMetadata | undefined = undefined;
        if (fileType === 'audio') {
          try {
            const metadata = await window.orbita.getAudioMetadata(filePath);
            audioMetadata = {
              title: metadata.title || fileName.replace(/\.[^.]+$/, ''),
              artist: metadata.artist || '',
              duration: metadata.duration || 0,
              size: metadata.size || (sizeMb * 1024 * 1024),
              cover: metadata.cover || null,
            };
          } catch (err) {
            console.error('Failed to get audio metadata:', err);
            audioMetadata = undefined;
          }
        }

        let dimensions = {};
        if (fileType === 'photo' || fileType === 'video') {
          dimensions = await getMediaDimensionsForFile(filePath, fileType);
        }

        const fileDims = dimensions as any;
        newFiles.push({
          filePath,
          preview: fileType === 'video' ? (fileDims.preview || null) : preview,
          blurPreview: fileDims.blurPreview,
          name: fileName,
          sizeMb,
          fileType,
          uploadedMb: 0,
          uploading: false,
          error: null,
          uploadedUrl: null,
          audioMetadata,
          duration: audioMetadata?.duration || fileDims.duration,
          ...dimensions,
        });
      }

      if (newFiles.length > 0) {
        setAttachedFiles(prev => [...prev, ...newFiles]);
        setIsAttachmentModalOpen(true);
      }
    } catch (error) {
      console.error('File pick error:', error);
    }
  }, [getMediaDimensionsForFile]);

  const handleSendFiles = async (caption: string, group: boolean, asFile: boolean) => {
    if (!activeChatId || attachedFiles.length === 0) return;

    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
    if (!chat) return;

    const isChannel = chat.type === 'channel';
    const isBotChat = activeChatId === 'system_support';
    if (isChannel) {
      if (!isChannelOwner) return;
    } else if (isBotChat) {
    } else {
      if (!sharedSecret || !chat.ratchetState) return;
    }

    const filesToSend = [...attachedFiles];
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) clearDraft(activeChatId);
    setAttachedFiles([]);
    setIsAttachmentModalOpen(false);
    setIsSendingFiles(false);
    useChatStore.getState().setIsUploadingMedia(true);
    setInputText('');

    const resolveItemType = (ft: string, fileName?: string): 'photo' | 'video' | 'audio' | 'file' | 'gif' => {
      if (asFile) return 'file';
      if (ft === 'photo') return 'photo';
      if (ft === 'video') return 'video';
      if (ft === 'audio') return 'audio';
      if (fileName && /\.(jpg|jpeg|png|webp|avif|bmp|heic|gif)$/i.test(fileName)) return 'photo';
      if (fileName && /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(fileName)) return 'video';
      if (fileName && /\.(mp3|wav|flac|aac|ogg|m4a|opus)$/i.test(fileName)) return 'audio';
      return 'file';
    };

    const resolveMime = (ft: string, fileName?: string) => {
      const ext = (fileName?.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
      if (ft === 'audio') {
        if (ext === 'ogg' || ext === 'opus') return 'audio/ogg';
        if (ext === 'wav') return 'audio/wav';
        if (ext === 'flac') return 'audio/flac';
        if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
        return 'audio/mpeg';
      }
      if (ft === 'photo') {
        if (ext === 'webp') return 'image/webp';
        if (ext === 'png') return 'image/png';
        if (ext === 'gif') return 'image/gif';
        if (ext === 'svg') return 'image/svg+xml';
        if (ext === 'bmp') return 'image/bmp';
        if (ext === 'avif') return 'image/avif';
        return 'image/jpeg';
      }
      if (ft === 'video') {
        if (ext === 'webm') return 'video/webm';
        if (ext === 'mov') return 'video/quicktime';
        return 'video/mp4';
      }
      return 'application/octet-stream';
    };

    const uploadSingleFile = async (
      file: typeof filesToSend[0],
      onProgress?: (uploadedBytes: number) => void
    ) => {
      if (file.uploadedUrl) {
        return {
          url: file.uploadedUrl,
          key: undefined as string | undefined,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: resolveMime(file.fileType, file.name),
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
        };
      }

      try {
        let fileArrayBuffer: ArrayBuffer | null = null;
        if (window.orbita?.rustReadFileFast) {
          try {
            const binary = await window.orbita.rustReadFileFast(file.filePath);
            if (binary) {
              let processBinary = binary;
              if (!asFile && file.fileType === 'photo' && window.orbita?.rustResizeImage) {
                try {
                  const resized = await window.orbita.rustResizeImage(binary, 1920, 1920, 85);
                  if (resized) processBinary = resized;
                } catch (e) {
                  console.warn('[Rust] Image resize failed, falling back to original:', e);
                }
              }
              fileArrayBuffer = (processBinary.buffer as ArrayBuffer).slice(
                processBinary.byteOffset,
                processBinary.byteOffset + processBinary.byteLength
              );
            }
          } catch (e) {
            console.warn('[ChatWindow] rustReadFileFast error, falling back:', e);
          }
        }

        if (!fileArrayBuffer && window.orbita?.readFileAsDataURL) {
          try {
            const dataUrl = await window.orbita.readFileAsDataURL(file.filePath);
            if (dataUrl) {
              const binaryStr = atob(dataUrl.split(',')[1] || '');
              fileArrayBuffer = new ArrayBuffer(binaryStr.length);
              const view = new Uint8Array(fileArrayBuffer);
              for (let j = 0; j < binaryStr.length; j++) view[j] = binaryStr.charCodeAt(j);
            }
          } catch (e) {
            console.warn('[ChatWindow] readFileAsDataURL fallback error:', e);
          }
        }

        if (!fileArrayBuffer) return null;

        const cleanedBuffer = stripExifMetadata(fileArrayBuffer, file.fileType || file.name);
        let fileKey: string | undefined = undefined;
        let tempPath: string | null = null;
        const isPublic = isChannel || isBotChat;
        const ext = (file.name?.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();

        if (isPublic) {
          tempPath = await window.orbita.writeTempFile(new Uint8Array(cleanedBuffer), ext);
        } else {
          fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(cleanedBuffer, fileKey);
          const encryptedAb = await encryptedBlob.arrayBuffer();
          tempPath = await window.orbita.writeTempFile(new Uint8Array(encryptedAb));
        }

        if (!tempPath) return null;

        const publicId = `orbita_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const unsub = window.orbita.onUploadProgress(({ publicId: pid, uploadedBytes }) => {
          if (pid === publicId && onProgress) {
            onProgress(uploadedBytes);
          }
        });

        const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
        unsub();
        window.orbita.deleteTempFile?.(tempPath);

        if (!result.success || !result.secure_url) return null;

        const itemMime = resolveMime(file.fileType, file.name);
        const localBlob = new Blob([cleanedBuffer], { type: itemMime });
        mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', localBlob, itemMime, activeChatId);

        return {
          url: result.secure_url,
          key: fileKey,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: itemMime,
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: (file.fileType === 'photo' || file.fileType === 'video') ? file.blurPreview : undefined,
        };
      } catch (err) {
        console.error('Upload error for file', file.name, err);
        return null;
      }
    };

    const shouldGroup = group && filesToSend.length > 1;

    if (shouldGroup) {
      const CHUNK_SIZE = 10;
      const chunks: (typeof filesToSend)[] = [];
      for (let i = 0; i < filesToSend.length; i += CHUNK_SIZE) {
        chunks.push(filesToSend.slice(i, i + CHUNK_SIZE));
      }

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkFiles = chunks[cIdx];
        const chunkCaption = cIdx === 0 ? (caption || '') : '';
        const messageId = `msg_${Date.now()}_${cIdx}_${Math.random().toString(36).substr(2, 9)}`;

        const initialMediaItems: MediaItem[] = chunkFiles.map((file) => ({
          url: file.filePath || file.preview || '',
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: resolveMime(file.fileType, file.name),
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
          uploading: true,
          uploadedMb: 0,
        }));

        const localMessage: Message = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: chunkCaption,
          time: Date.now() + cIdx,
          read: true,
          status: 'sending',
          uploading: true,
          mediaItems: initialMediaItems,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { lastMsg: chunkCaption || '[MediaGroup]' });

        (async () => {
          const uploadedItems: MediaItem[] = [];
          for (let fIdx = 0; fIdx < chunkFiles.length; fIdx++) {
            const currentFile = chunkFiles[fIdx];
            const uploaded = await uploadSingleFile(currentFile, (uploadedBytes) => {
              const uploadedMb = uploadedBytes / (1024 * 1024);
              useUploadProgressStore.getState().setProgress(`${messageId}_${fIdx}`, uploadedMb);
              useUploadProgressStore.getState().setProgress(messageId, uploadedMb);
            });

            if (!uploaded) {
              useUploadProgressStore.getState().clearProgress(`${messageId}_${fIdx}`);
              useUploadProgressStore.getState().clearProgress(messageId);
              useChatStore.getState().setIsUploadingMedia(false);
              return;
            }
            useUploadProgressStore.getState().clearProgress(`${messageId}_${fIdx}`);
            uploadedItems.push({
              ...uploaded,
              uploading: false,
            });
          }

          useUploadProgressStore.getState().clearProgress(messageId);
          useChatStore.getState().setIsUploadingMedia(false);

          const isPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
          if (!isPresent) return;

          if (isChannel) {
            const targetChannelId = activeChatId;
            useChatStore.setState((state) => {
              const currentMsgs = state.messagesByChatId[targetChannelId] || [];
              const updated = currentMsgs.map((m) =>
                m.id === messageId ? { ...m, status: 'sent' as const, uploading: false, mediaItems: uploadedItems } : m
              );
              const target = updated.find((m) => m.id === messageId);
              if (target) {
                (window as any).orbita?.storageAddMessage?.(targetChannelId, messageId, target).catch(() => {});
              }
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChannelId]: updated,
                },
              };
            });
            for (let fIdx = 0; fIdx < uploadedItems.length; fIdx++) {
              const f = uploadedItems[fIdx];
              channelService.publishPost(
                targetChannelId,
                myNickname,
                fIdx === 0 ? chunkCaption : '',
                {
                  type: f.type,
                  url: f.url,
                  name: f.name,
                  mime: f.mime,
                  duration: f.duration,
                  width: f.width,
                  height: f.height,
                  audioMetadata: f.audioMetadata,
                },
                undefined,
                messageId,
                myUserId
              ).then((post) => {
                if (post) {
                  useChatStore.setState((state) => {
                    const currentMsgs = state.messagesByChatId[targetChannelId] || [];
                    return {
                      messagesByChatId: {
                        ...state.messagesByChatId,
                        [targetChannelId]: currentMsgs.map((m) =>
                          m.id === messageId || m.id === post.id
                            ? { ...m, id: post.id, time: post.time || m.time, status: 'read' as const }
                            : m
                        ),
                      },
                    };
                  });
                }
              });
            }
            return;
          }

          if (isBotChat) {
            useChatStore.setState((state) => {
              const currentMsgs = state.messagesByChatId[activeChatId] || [];
              const updated = currentMsgs.map((m) =>
                m.id === messageId ? { ...m, status: 'sent' as const, uploading: false, mediaItems: uploadedItems } : m
              );
              const target = updated.find((m) => m.id === messageId);
              if (target) {
                (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, target).catch(() => {});
              }
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: updated,
                },
              };
            });
            const mediaSummary = uploadedItems.map((f) => `[${f.type}] ${f.name} (${f.url})`).join('\n');
            const fullText = chunkCaption ? `${chunkCaption}\n\n${mediaSummary}` : mediaSummary;
            if (activeChatId === 'system_support') {
              supportService.handleUserMessage(fullText, t, uploadedItems[0]?.url, uploadedItems[0]?.type);
            }
            return;
          }

          const currentChat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
          if (!currentChat?.ratchetState) return;

          const ratchet = DoubleRatchet.fromState(currentChat.ratchetState);
          const messageData = {
            id: messageId,
            senderId: myCode,
            text: chunkCaption,
            mediaItems: uploadedItems.map((f) => {
              const isVisual = f.type === 'photo' || f.type === 'video';
              return {
                type: f.type,
                url: f.url,
                name: f.name,
                mime: f.mime,
                size: f.size,
                key: f.key,
                width: f.width,
                height: f.height,
                duration: f.duration,
                blurPreview: isVisual ? f.blurPreview : undefined,
                thumbnail: isVisual ? (f.blurPreview || undefined) : undefined,
                audioMetadata: f.audioMetadata ? {
                  title: f.audioMetadata.title,
                  artist: f.audioMetadata.artist,
                  duration: f.audioMetadata.duration,
                  size: f.audioMetadata.size,
                } : undefined,
              };
            }),
          };
          const plaintext = JSON.stringify(messageData);
          const { ciphertext, index, dhPublicKey: groupDhPublicKey, prevChainCount: groupPrevChainCount } = await ratchet.encrypt(plaintext);

          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[activeChatId] || [];
            const updated = currentMsgs.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    status: 'sent' as const,
                    uploading: false,
                    encryptedText: ciphertext,
                    index,
                    mediaItems: uploadedItems,
                  }
                : m
            );
            const target = updated.find((m) => m.id === messageId);
            if (target) {
              (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, target).catch(() => {});
            }
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [activeChatId]: updated,
              },
            };
          });
          updateChat(activeChatId, { ratchetState: ratchet.getState() });

          const payload = {
            type: 'message',
            ciphertext,
            index,
            dhPublicKey: groupDhPublicKey,
            prevChainCount: groupPrevChainCount,
            messageId,
            chatId: activeChatId,
            sender: myNickname,
            senderUserId: myUserId,
            senderCode: myCode,
            senderId: myUserId || myCode,
          };

          ablyService.sendMessage(activeChatId, payload).catch((err) => {
            console.warn('[ChatWindow] Ably group media send failed:', err);
          });

          try {
            const isGroup = activeChat?.type === 'group';
            const pusher = isGroup ? getGroupPusher() : getPusher();
            const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
            const channel = pusher.subscribe(channelName);
            const sendPusher = () => {
              try {
                channel.trigger('client-message', payload);
              } catch (e) {
                console.warn('[ChatWindow] Pusher group media trigger failed:', e);
              }
            };
            if (channel.subscribed) sendPusher(); else channel.bind('pusher:subscription_succeeded', sendPusher);
          } catch (e) {
            console.warn('[ChatWindow] Pusher group media send error:', e);
          }

          try {
            const recipientTargets = Array.from(new Set([
              activeChat?.peerCode,
              activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
            ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
            if (activeChat?.type === 'private') {
              for (const rId of recipientTargets) {
                await supabaseService.sendOfflineMessage(
                  activeChatId, myUserId || myCode || myNickname, rId, ciphertext, index, groupDhPublicKey, messageId, groupPrevChainCount
                );
              }
            }
          } catch (err) {
            console.error('Failed to save offline message:', err);
          }
        })();
      }
    } else {
      for (let fIdx = 0; fIdx < filesToSend.length; fIdx++) {
        const file = filesToSend[fIdx];
        const postCaption = fIdx === 0 ? (caption || '') : '';
        const messageId = `msg_${Date.now()}_${fIdx}_${Math.random().toString(36).substr(2, 9)}`;
        const itemType = resolveItemType(file.fileType, file.name);
        const itemMime = resolveMime(file.fileType, file.name);

        const fileSizeBytes = file.sizeMb ? Math.round(file.sizeMb * 1024 * 1024) : undefined;
        const localMessage: Message = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: postCaption,
          time: Date.now() + fIdx,
          read: true,
          status: 'sending',
          uploading: true,
          uploadedMb: 0,
          mediaType: itemType,
          mediaUrl: file.filePath || file.preview || '',
          mediaName: file.name,
          mime: itemMime,
          fileSize: fileSizeBytes,
          audioMetadata: file.audioMetadata,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
          blurPreview: file.blurPreview,
          thumbnail: file.preview || file.blurPreview,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { lastMsg: postCaption || file.name || `[${itemType}]` });

        (async () => {
          const uploaded = await uploadSingleFile(file, (uploadedBytes) => {
            const uploadedMb = uploadedBytes / (1024 * 1024);
            useUploadProgressStore.getState().setProgress(messageId, uploadedMb);
          });

          if (!uploaded) {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          const isPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
          if (!isPresent) {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          if (isChannel) {
            const targetChannelId = activeChatId;
            useChatStore.setState((state) => {
              const currentMsgs = state.messagesByChatId[targetChannelId] || [];
              const updated = currentMsgs.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      status: 'sent' as const,
                      uploading: false,
                      mediaUrl: uploaded.url,
                      mediaKey: uploaded.key,
                      mime: uploaded.mime,
                      audioMetadata: uploaded.audioMetadata,
                      width: uploaded.width,
                      height: uploaded.height,
                      duration: uploaded.duration,
                      blurPreview: uploaded.blurPreview,
                      thumbnail: uploaded.thumbnail,
                    }
                  : m
              );
              const target = updated.find((m) => m.id === messageId);
              if (target) {
                (window as any).orbita?.storageAddMessage?.(targetChannelId, messageId, target).catch(() => {});
              }
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [targetChannelId]: updated,
                },
              };
            });
            channelService.publishPost(
              targetChannelId,
              myNickname,
              postCaption,
              {
                type: uploaded.type,
                url: uploaded.url,
                name: uploaded.name,
                mime: uploaded.mime,
                duration: uploaded.duration,
                width: uploaded.width,
                height: uploaded.height,
                audioMetadata: uploaded.audioMetadata,
              },
              undefined,
              messageId,
              myUserId
            ).then((post) => {
              if (post) {
                useChatStore.setState((state) => {
                  const currentMsgs = state.messagesByChatId[targetChannelId] || [];
                  return {
                    messagesByChatId: {
                      ...state.messagesByChatId,
                      [targetChannelId]: currentMsgs.map((m) =>
                        m.id === messageId || m.id === post.id
                          ? { ...m, id: post.id, time: post.time || m.time, status: 'read' as const }
                          : m
                      ),
                    },
                  };
                });
              }
            });
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          if (isBotChat) {
            useChatStore.setState((state) => {
              const currentMsgs = state.messagesByChatId[activeChatId] || [];
              const updated = currentMsgs.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      status: 'sent' as const,
                      uploading: false,
                      mediaUrl: uploaded.url,
                      mediaKey: uploaded.key,
                      mime: uploaded.mime,
                      audioMetadata: uploaded.audioMetadata,
                      width: uploaded.width,
                      height: uploaded.height,
                      duration: uploaded.duration,
                      blurPreview: uploaded.blurPreview,
                      thumbnail: uploaded.thumbnail,
                    }
                  : m
              );
              const target = updated.find((m) => m.id === messageId);
              if (target) {
                (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, target).catch(() => {});
              }
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: updated,
                },
              };
            });
            const fileMsg = postCaption ? `${postCaption}\n[${uploaded.type}] ${uploaded.name} (${uploaded.url})` : `[${uploaded.type}] ${uploaded.name} (${uploaded.url})`;
            if (activeChatId === 'system_support') {
              supportService.handleUserMessage(fileMsg, t, uploaded.url, uploaded.type);
            }
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
            return;
          }

          const currentChat = useChatStore.getState().chats.find((c) => c.id === activeChatId);
          if (!currentChat?.ratchetState) return;

          const ratchet = DoubleRatchet.fromState(currentChat.ratchetState);
          const networkAudioMetadata = uploaded.audioMetadata ? {
            title: uploaded.audioMetadata.title,
            artist: uploaded.audioMetadata.artist,
            duration: uploaded.audioMetadata.duration,
            size: uploaded.audioMetadata.size,
          } : undefined;

          const isVisualMedia = uploaded.type === 'photo' || uploaded.type === 'video';
          const messageData = {
            id: messageId,
            senderId: myCode,
            text: postCaption,
            mediaType: uploaded.type,
            mediaUrl: uploaded.url,
            mediaName: uploaded.name,
            mediaKey: uploaded.key,
            mime: uploaded.mime,
            fileSize: fileSizeBytes || uploaded.size,
            audioMetadata: networkAudioMetadata,
            width: uploaded.width,
            height: uploaded.height,
            duration: uploaded.duration,
            blurPreview: isVisualMedia ? uploaded.blurPreview : undefined,
            thumbnail: isVisualMedia ? (uploaded.blurPreview || undefined) : undefined,
          };
          const plaintext = JSON.stringify(messageData);
          const { ciphertext, index, dhPublicKey: fileDhPublicKey, prevChainCount: filePrevChainCount } = await ratchet.encrypt(plaintext);

          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[activeChatId] || [];
            const updated = currentMsgs.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    status: 'sent' as const,
                    uploading: false,
                    encryptedText: ciphertext,
                    index,
                    mediaType: uploaded.type,
                    mediaUrl: uploaded.url,
                    mediaName: uploaded.name,
                    mediaKey: uploaded.key,
                    mime: uploaded.mime,
                    fileSize: fileSizeBytes || uploaded.size,
                    audioMetadata: uploaded.audioMetadata,
                    width: uploaded.width,
                    height: uploaded.height,
                    duration: uploaded.duration,
                    blurPreview: isVisualMedia ? uploaded.blurPreview : undefined,
                    thumbnail: isVisualMedia ? (uploaded.blurPreview || undefined) : undefined,
                  }
                : m
            );
            const target = updated.find((m) => m.id === messageId);
            if (target) {
              (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, target).catch(() => {});
            }
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [activeChatId]: updated,
              },
            };
          });
          updateChat(activeChatId, { ratchetState: ratchet.getState() });

          const payload = {
            type: 'message',
            ciphertext,
            index,
            dhPublicKey: fileDhPublicKey,
            prevChainCount: filePrevChainCount,
            messageId,
            chatId: activeChatId,
            sender: myNickname,
            senderUserId: myUserId,
            senderCode: myCode,
            senderId: myUserId || myCode,
          };

          ablyService.sendMessage(activeChatId, payload).catch((err) => {
            console.warn('[ChatWindow] Ably media send failed:', err);
          });

          try {
            const isGroup = activeChat?.type === 'group';
            const pusher = isGroup ? getGroupPusher() : getPusher();
            const channelName = isGroup ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
            const channel = pusher.subscribe(channelName);
            const sendPusher = () => {
              try {
                channel.trigger('client-message', payload);
              } catch (e) {
                console.warn('[ChatWindow] Pusher media trigger failed:', e);
              }
            };
            if (channel.subscribed) sendPusher(); else channel.bind('pusher:subscription_succeeded', sendPusher);
          } catch (e) {
            console.warn('[ChatWindow] Pusher media send error:', e);
          }

          try {
            const recipientTargets = Array.from(new Set([
              activeChat?.peerCode,
              activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
            ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
            if (activeChat?.type === 'private') {
              for (const rId of recipientTargets) {
                await supabaseService.sendOfflineMessage(
                  activeChatId, myUserId || myCode || myNickname, rId, ciphertext, index, fileDhPublicKey, messageId, filePrevChainCount
                );
              }
            }
          } catch (err) {
            console.error('Failed to save offline message:', err);
          } finally {
            useUploadProgressStore.getState().clearProgress(messageId);
            useChatStore.getState().setIsUploadingMedia(false);
          }
        })();
      }
    }
  };

  const handleAddMoreFiles = () => {
    handleFilePick();
  };

  const timeBadge = useCallback((msg: Message, isPinned?: boolean) => {
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
    return (
      <span className="tabular-nums select-none message-time-badge" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)', fontSize: orbitFs(11), display: 'inline-flex', alignItems: 'center', lineHeight: 1, userSelect: 'none', WebkitUserSelect: 'none' }}>
        {isPinned && (
          <CustomPinIcon size={12} style={{ color: isOwn ? 'rgba(255, 255, 255, 0.95)' : 'var(--accent-color, #7C3AED)', userSelect: 'none' }} className="flex-shrink-0 select-none" />
        )}
        <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{formatTime(msg.time)}</span>
        {isOwn && msg.status && (
          <span style={{ display: 'inline-flex', width: '26px', minWidth: '26px', flexShrink: 0, justifyContent: 'flex-end', userSelect: 'none', WebkitUserSelect: 'none' }}>
            <MessageStatus status={msg.status} isOwn={isOwn} />
          </span>
        )}
      </span>
    );
  }, [myCode, myNickname, activeChat, myUserId]);

  const bubbleStyle = useCallback((isOwn: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '6.5px 12px 6.5px 11px',
    borderRadius: bubbleRadius,
    background: isOwn ? 'var(--chat-bubble-own-bg, #2c6bed)' : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
    border: 'none',
    color: isOwn ? '#ffffff' : 'var(--chat-bubble-incoming-text, var(--text-main, #ffffff))',
    fontSize: orbitFs(12),
    maxWidth: 'min(440px, 75%)',
    ...extra,
  }), [bubbleRadius]);

  const isEmojiPanelOpen = useChatStore((s) => s.isEmojiPanelOpen);
  const setEmojiPanelOpen = useChatStore((s) => s.setEmojiPanelOpen);
  const getRecentEmojis = useChatStore((s) => s.getRecentEmojis);
  const addRecentEmoji = useChatStore((s) => s.addRecentEmoji);
  const recentEmojis = getRecentEmojis();

  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  const handleEmojiSelect = (emoji: string) => {
    if (inputRef.current) {
      inputRef.current.focus();
      const sel = window.getSelection();
      let range: Range | null = null;

      if (
        savedSelectionRangeRef.current &&
        inputRef.current.contains(savedSelectionRangeRef.current.commonAncestorContainer)
      ) {
        range = savedSelectionRangeRef.current;
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else if (sel && sel.rangeCount > 0 && inputRef.current.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(inputRef.current);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      if (range) {
        range.deleteContents();
        const textNode = document.createTextNode(emoji);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        savedSelectionRangeRef.current = range.cloneRange();
      }

      inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      if (editingIndex !== null) {
        setEditText((prev) => prev + emoji);
      } else {
        setInputText((prev) => prev + emoji);
      }
    }
  };



  const handleSendGif = (gifOrUrl: any) => {
    const url = typeof gifOrUrl === 'string' ? gifOrUrl : gifOrUrl?.url;
    const rawTitle = typeof gifOrUrl === 'object' && gifOrUrl?.title ? gifOrUrl.title : 'animation';
    const cleanTitle = rawTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40) || 'animation';
    const fileName = `${cleanTitle}.mp4`;

    triggerMessage(`[GIF] ${url}`, {
      type: 'video',
      url: url,
      name: fileName,
      mime: 'video/mp4',
    });
    setEmojiPanelOpen(false);
  };

  const handleSendSticker = (stickerOrUrl: any) => {
    const url = typeof stickerOrUrl === 'string' ? stickerOrUrl : stickerOrUrl?.url;
    const name = typeof stickerOrUrl === 'object' && stickerOrUrl?.name ? stickerOrUrl.name : 'sticker';
    const isTgs = url?.endsWith('.tgs');

    triggerMessage(`[Sticker] ${url}`, {
      type: 'sticker' as any,
      url: url,
      name: name,
      mime: isTgs ? 'application/x-tgsticker' : 'image/webp',
    });
    setEmojiPanelOpen(false);
  };

  const handleEmojiPanelClose = () => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    setEmojiPanelOpen(false);
    inputRef.current?.focus();
  };

  const toggleEmoji = useCallback(() => {
    if (emojiHoverOpenTimerRef.current) {
      clearTimeout(emojiHoverOpenTimerRef.current);
      emojiHoverOpenTimerRef.current = null;
    }
    if (emojiHoverCloseTimerRef.current) {
      clearTimeout(emojiHoverCloseTimerRef.current);
      emojiHoverCloseTimerRef.current = null;
    }
    setEmojiPanelOpen(!isEmojiPanelOpen);
  }, [isEmojiPanelOpen, setEmojiPanelOpen]);

  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeaderHeight(entry.contentRect.height);
      }
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleSelectFromMenu = () => {
    const index = contextMenu.messageIndex;
    const msg = messages[index];
    if (!msg || !msg.id) return;
    selection.enterSelectionMode(msg.id);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleMessageClick = useCallback((e: React.MouseEvent, messageId: string) => {
    if (selection.isSelectionMode) {
      e.stopPropagation();
      selection.toggleSelection(messageId);
    }
  }, [selection.isSelectionMode, selection.toggleSelection]);

  useEffect(() => {
    selection.clearSelection();
  }, [activeChatId, selection.clearSelection]);



  const renderMediaGroup = useCallback((msg: Message, index: number, customRadius?: string, overrideItems?: MediaItem[]) => {
    const mediaItems = overrideItems || msg.mediaItems;
    if (!mediaItems || mediaItems.length === 0) return null;

    const isAudioItem = (item: MediaItem) =>
      item.type === 'audio' ||
      item.mime?.startsWith('audio/') ||
      /\.(mp3|wav|flac|aac|ogg|m4a|opus|wma|ape|alac)$/i.test(item.name || '');

    const isVisualItem = (item: MediaItem) =>
      item.type === 'photo' ||
      item.type === 'video' ||
      item.mime?.startsWith('image/') ||
      item.mime?.startsWith('video/') ||
      /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '');

    const hasAudio = mediaItems.some(isAudioItem);
    const hasPhotoOrVideo = mediaItems.some(isVisualItem);

    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);

    if (hasAudio && !hasPhotoOrVideo) {
      return (
        <GroupedAudioBubble
          items={mediaItems}
          sharedSecret={sharedSecret}
          msg={msg}
          timeNode={timeBadge(msg, isMessagePinned(index))}
          isOwn={isOwn}
          onCancelUpload={msg.uploading ? () => {
            if (activeChatId && msg.id) {
              useChatStore.getState().deleteMessage(activeChatId, msg.id);
            }
          } : undefined}
        />
      );
    }

    if (hasPhotoOrVideo) {
      const itemsToRender = mediaItems.slice(0, 10);
      const viewerItems: MediaViewerItem[] = itemsToRender.map((item, idx) => {
        const isGif = Boolean(
          item.type === 'gif' ||
          msg.mediaType === 'gif' ||
          item.mime === 'image/gif' ||
          /\.gif(\?.*)?$/i.test(item.name || item.url || '') ||
          Boolean(item.url && (item.url.includes('tenor.com') || item.url.includes('giphy.com'))) ||
          (msg.text && /^\[GIF\]/i.test(msg.text.trim()))
        );
        const effectiveSecret = item.key || msg.mediaKey || sharedSecret;
        const directUrl = getOrbitaMediaUrl(item.url, effectiveSecret, activeChatId || undefined, msg.id, item.name, item.mime) || undefined;
        return {
          id: `${msg.id || 'msg'}_${idx}_${item.url}`,
          url: item.url,
          directUrl,
          type: isGif ? 'gif' : ((item.type === 'video' || item.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '')) ? 'video' : 'photo'),
          name: item.name,
          mime: item.mime,
          key: item.key || msg.mediaKey,
          sharedSecret: effectiveSecret,
          duration: item.duration,
          sender: msg.sender,
          time: msg.time,
          messageId: msg.id,
        };
      });

      return (
        <TelegramAlbumGrid
          items={itemsToRender}
          sharedSecret={sharedSecret}
          msg={msg}
          timeNode={timeBadge(msg, isMessagePinned(index))}
          customRadius={customRadius}
          isOwn={isOwn}
          onMediaClick={(tileIdx) => {
            const clicked = viewerItems[tileIdx];
            if (clicked) {
              openMediaViewer(clicked.url, msg.id, viewerItems, tileIdx);
            }
          }}
          maxWidth={440}
        />
      );
    }

    return (
      <div
        className="grouped-files-bubble flex flex-col gap-1 p-2 select-none"
        style={{
          width: '260px',
          boxSizing: 'border-box',
          position: 'relative',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <style>{`
          .grouped-files-bubble,
          .grouped-files-bubble * {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-user-drag: none !important;
          }
        `}</style>
        {mediaItems.map((file, fIdx) => (
          <div
            key={fIdx}
            className="flex items-center gap-2.5 p-1.5 rounded-lg transition-colors cursor-pointer select-none"
            onClick={async () => {
              try {
                let arrayBuffer: ArrayBuffer | null = null;
                if (file.url.startsWith('data:') || file.url.startsWith('blob:')) {
                  const res = await fetch(file.url);
                  const b = await res.blob();
                  arrayBuffer = await b.arrayBuffer();
                } else if (sharedSecret || file.key || msg.mediaKey) {
                  const item = await mediaManager.getMedia(file.url, file.key || msg.mediaKey || sharedSecret || '', file.name, activeChatId || undefined, msg.id);
                  if (item?.blobUrl) {
                    const res = await fetch(item.blobUrl);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  }
                } else {
                  const item = await mediaManager.getMedia(file.url, '', file.name, activeChatId || undefined, msg.id);
                  if (item?.blobUrl) {
                    const res = await fetch(item.blobUrl);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  } else {
                    const res = await fetch(file.url);
                    const b = await res.blob();
                    arrayBuffer = await b.arrayBuffer();
                  }
                }
                if (arrayBuffer) {
                  const base64 = arrayBufferToBase64(arrayBuffer);
                  if (window.orbita && window.orbita.openFile) {
                    await window.orbita.openFile(base64, file.name || 'file');
                  }
                }
              } catch (err) {
                console.error('Failed to open grouped file:', err);
              }
            }}
          >
            <File size={22} className="text-[var(--accent-light)] flex-shrink-0" />
            <div className="flex-1 min-w-0 select-none">
              <div className="text-xs font-medium text-[var(--text-main)] truncate select-none">{file.name}</div>
              {file.size ? (
                <div className="text-[10.5px] text-[var(--text-dim)] select-none">
                  {file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {msg.text ? (
          <div className="flex items-end justify-between gap-3 px-1 pt-1 select-none">
            <div className="text-[13.5px] text-[var(--text-main)] leading-snug break-words flex-1 select-none">
              {msg.text}
            </div>
            <div className="flex items-center justify-end gap-1 flex-shrink-0 select-none">
              {timeBadge(msg, isMessagePinned(index))}
            </div>
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              bottom: isOwn ? '2px' : '5px',
              right: isOwn ? '3px' : '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              pointerEvents: 'none',
              userSelect: 'none',
              lineHeight: 1,
            }}
          >
            {timeBadge(msg, isMessagePinned(index))}
          </div>
        )}
      </div>
    );
  }, [sharedSecret, isMessagePinned, timeBadge, myCode, myNickname, activeChat, activeChatId]);

  const renderReactionBadges = useCallback((msg: Message, index: number) => {
    const isShort = !msg.text || msg.text.length < 35;
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
    return (
      <div style={{ display: 'flex', width: '100%', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
        <MessageReactions
          reactions={msg.reactions}
          onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
          isOwn={isOwn}
          activeChatId={activeChatId || undefined}
          isSmallMessage={isShort}
        />
      </div>
    );
  }, [myCode, myNickname, activeChat, activeChatId, myUserId, triggerReactionMessage]);

  const renderMessage = useCallback((index: number, msg: Message) => {
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat, myUserId);
    const media = parseMedia(msg);
    const isSelected = selection.isSelectionMode && msg.id && selection.selectedIds.has(msg.id);
    const isUnselected = selection.isSelectionMode && !isSelected;
    const isHighlighted = index === highlightedIndex;

    const isGif = Boolean(
      (media.url && /\.gif(\?.*)?$/i.test(media.url)) ||
      (msg.mediaUrl && (
        /\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
        msg.mediaUrl.includes('tenor.com') ||
        msg.mediaUrl.includes('giphy.com') ||
        msg.mediaUrl.includes('.giphy.') ||
        msg.mediaUrl.includes('c.tenor.com')
      )) ||
      (msg.text && /^\[GIF\]/i.test(msg.text.trim())) ||
      (msg.mediaName && /\.gif$/i.test(msg.mediaName)) ||
      (msg.mediaName && /^animation\./i.test(msg.mediaName)) ||
      msg.mediaType === 'gif' ||
      (msg.mime === 'image/gif')
    );

    const isSameSender = (m1: Message | null, m2: Message | null) => {
      if (!m1 || !m2) return false;
      if (m1.senderId && m2.senderId) return m1.senderId === m2.senderId;
      if (m1.sender && m2.sender) return m1.sender === m2.sender;
      return false;
    };

    const currentMessages = messagesRef.current;
    const prevMsg = index > 0 ? currentMessages[index - 1] : null;
    const nextMsg = index < currentMessages.length - 1 ? currentMessages[index + 1] : null;

    const prevIsOwn = prevMsg ? isMessageOutgoing(prevMsg, myCode, myNickname, activeChat, myUserId) : false;
    const isPrevSameSenderGroup = !!(
      prevMsg &&
      prevMsg.mediaType !== 'system' &&
      prevIsOwn === isOwn &&
      isSameSender(prevMsg, msg) &&
      Math.abs(msg.time - prevMsg.time) <= 15 * 60 * 1000 &&
      isSameDay(prevMsg.time, msg.time)
    );
    const nextIsOwn = nextMsg ? isMessageOutgoing(nextMsg, myCode, myNickname, activeChat, myUserId) : false;
    const isNextSameSenderGroup = !!(
      nextMsg &&
      nextMsg.mediaType !== 'system' &&
      nextIsOwn === isOwn &&
      isSameSender(nextMsg, msg) &&
      Math.abs(nextMsg.time - msg.time) <= 15 * 60 * 1000 &&
      isSameDay(nextMsg.time, msg.time)
    );

    const topGap = (index === 0 || !prevMsg) ? '4px' : (isPrevSameSenderGroup ? '2px' : '6px');

    const baseRadius = typeof bubbleRadius === 'number' ? `${bubbleRadius}px` : bubbleRadius;
    const smallRadius = '8px';

    let customRadius: string;
    if (isOwn) {
      const rTopLeft = baseRadius;
      const rBottomLeft = baseRadius;
      const rTopRight = isPrevSameSenderGroup ? smallRadius : baseRadius;
      const rBottomRight = isNextSameSenderGroup ? smallRadius : baseRadius;
      customRadius = `${rTopLeft} ${rTopRight} ${rBottomRight} ${rBottomLeft}`;
    } else {
      const rTopRight = baseRadius;
      const rBottomRight = baseRadius;
      const rTopLeft = isPrevSameSenderGroup ? smallRadius : baseRadius;
      const rBottomLeft = isNextSameSenderGroup ? smallRadius : baseRadius;
      customRadius = `${rTopLeft} ${rTopRight} ${rBottomRight} ${rBottomLeft}`;
    }

    const isGroup = activeChat?.type === 'group';
    const showGroupAvatar = isGroup && !isOwn && msg.mediaType !== 'system';

    const senderMember = showGroupAvatar
      ? activeChat?.members?.find(
          (m) => (m.userId && m.userId === msg.senderId) ||
                 ((m as any).userCode && (m as any).userCode === msg.senderId) ||
                 (m.nickname && msg.sender && m.nickname.toLowerCase().trim() === msg.sender.toLowerCase().trim())
        )
      : null;
    const senderNickname = senderMember?.nickname || msg.sender || '';
    const senderAvatar = (() => {
      if (senderMember?.avatarUrl) return senderMember.avatarUrl;
      if ((senderMember as any)?.avatar_url) return (senderMember as any).avatar_url;
      if ((msg as any).senderAvatar) return (msg as any).senderAvatar;
      if ((msg as any).avatarUrl) return (msg as any).avatarUrl;
      const nickKey = senderNickname.toLowerCase().trim();
      if (nickKey && memberAvatars[nickKey]) return memberAvatars[nickKey];
      if (msg.senderId && memberAvatars[msg.senderId]) return memberAvatars[msg.senderId];
      if (senderMember?.userId && memberAvatars[senderMember.userId]) return memberAvatars[senderMember.userId];
      if ((senderMember as any)?.userCode && memberAvatars[(senderMember as any).userCode]) return memberAvatars[(senderMember as any).userCode];

      const allChats = useChatStore.getState().chats || [];
      const directChat = allChats.find((c) =>
        c.type === 'private' && (
          (c.name && nickKey && c.name.toLowerCase().trim() === nickKey) ||
          (msg.senderId && (c.peerCode === msg.senderId || c.originalPeerCode === msg.senderId)) ||
          (senderMember?.userId && (c.peerCode === senderMember.userId || c.originalPeerCode === senderMember.userId)) ||
          ((senderMember as any)?.userCode && (c.peerCode === (senderMember as any).userCode || c.originalPeerCode === (senderMember as any).userCode))
        )
      );
      if (directChat?.avatarUrl) return directChat.avatarUrl;

      const usersById = useChatStore.getState().usersById || {};
      if (msg.senderId && usersById[msg.senderId]?.avatarUrl) return usersById[msg.senderId].avatarUrl;
      if (senderMember?.userId && usersById[senderMember.userId]?.avatarUrl) return usersById[senderMember.userId].avatarUrl;
      const matchedUser = Object.values(usersById).find((u: any) =>
        (u.nickname && nickKey && u.nickname.toLowerCase().trim() === nickKey) ||
        (msg.senderId && u.id === msg.senderId)
      );
      if ((matchedUser as any)?.avatarUrl) return (matchedUser as any).avatarUrl;

      return null;
    })();

    const wrapWithGroupAvatar = (content: React.ReactNode) => {
      if (!showGroupAvatar) {
        return content;
      }
      return (
        <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
          <div
            style={{
              width: 34,
              height: 34,
              flexShrink: 0,
              marginRight: 10,
              marginBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!isNextSameSenderGroup ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenDirectChat(msg.senderId, senderNickname, senderMember);
                }}
                className="cursor-pointer transition-transform duration-150 active:scale-95 hover:opacity-90 flex-shrink-0"
              >
                <Avatar
                  src={senderAvatar}
                  alt={senderNickname}
                  className="w-[34px] h-[34px]"
                  style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }}
                />
              </div>
            ) : (
              <div style={{ width: 34, height: 34 }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {content}
          </div>
        </div>
      );
    };

    const highlightWrapperStyle: React.CSSProperties = {
      width: '100%',
      backgroundColor: isHighlighted ? 'color-mix(in srgb, var(--accent-color) 22%, transparent)' : 'transparent',
      transition: 'background-color 0.3s ease',
      paddingTop: topGap,
      paddingBottom: '0px',
      paddingRight: '10px',
      paddingLeft: '10px',
      boxSizing: 'border-box',
    };

    const isFirstOfDay = !prevMsg || !isSameDay(prevMsg.time, msg.time);
    const dateLabel = getDateLabel(msg.time);
    const dateDividerNode = isFirstOfDay ? (
      <div
        data-date-divider={dateLabel}
        className="flex justify-center items-center w-full my-2.5 select-none pointer-events-none date-badge"
        style={{ userSelect: 'none', WebkitUserSelect: 'none', transition: 'opacity 0.15s ease' }}
      >
        <div
          className="date-badge-pill select-none"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255,255,255,0.06)) 92%, #000)',
            color: 'var(--text-main, #ffffff)',
            fontSize: '12px',
            fontWeight: 500,
            padding: '3px 12px',
            borderRadius: '12px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {dateLabel}
        </div>
      </div>
    ) : null;

    const renderContent = () => {
      if (msg.mediaType === 'system') {
        const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        let displayedText = msg.text;
        if (msg.systemType) {
          const act = msg.actorNickname || '';
          const trg = msg.targetNickname || '';
          if (msg.systemType === 'create' && act) {
            displayedText = t('system.group_created', { actor: act, defaultValue: msg.text });
          } else if (msg.systemType === 'invite' && act) {
            displayedText = t('system.member_invited', { actor: act, target: trg, defaultValue: msg.text });
          } else if (msg.systemType === 'join' && act) {
            displayedText = t('system.member_joined', { actor: act, defaultValue: msg.text });
          } else if (msg.systemType === 'title' && act) {
            displayedText = t('system.title_changed', { actor: act, defaultValue: msg.text });
          } else if (msg.systemType === 'avatar' && act) {
            displayedText = t('system.avatar_changed', { actor: act, defaultValue: msg.text });
          } else if (msg.systemType === 'admin' && act) {
            displayedText = t('system.promoted_admin', { actor: act, target: trg, defaultValue: msg.text });
          } else if (msg.systemType === 'unadmin' && act) {
            displayedText = t('system.demoted_admin', { actor: act, target: trg, defaultValue: msg.text });
          } else if (msg.systemType === 'call' && act) {
            displayedText = t('system.call_started', { actor: act, defaultValue: msg.text });
          } else if (msg.systemType === 'call_ended') {
            displayedText = t('system.call_ended', { defaultValue: msg.text || 'Голосовой звонок завершен' });
          } else if (msg.systemType === 'kick' && act) {
            displayedText = t('system.member_removed', { actor: act, target: trg, defaultValue: msg.text });
          }
        }
        return (
          <div
            data-message="true"
            data-message-id={msg.id}
            className="flex justify-center items-center w-full my-1 select-none pointer-events-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          >
            <div
              style={{
                backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255,255,255,0.06)) 92%, #000)',
                color: 'var(--text-main, #ffffff)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 14px',
                borderRadius: '12px',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                maxWidth: '80%',
                textAlign: 'center',
                gap: '1px',
              }}
            >
              <span>{displayedText}</span>
              <span style={{ fontSize: '10px', opacity: 0.6, marginTop: '1px' }}>{timeStr}</span>
            </div>
          </div>
        );
      }

      const mediaItems = msg.mediaItems;
      const isSingleImageOrVideo = (media.type === 'image' || media.type === 'video' || media.type === 'gif') && Boolean(media.url || msg.mediaUrl || msg.uploading);
      const effectiveMediaItems = (mediaItems && mediaItems.length > 0)
        ? mediaItems
        : (isSingleImageOrVideo ? [{
            type: media.type === 'gif' ? ('gif' as const) : ((media.type === 'video' || msg.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(media.fileName || msg.mediaName || '')) ? ('video' as const) : ('photo' as const)),
            url: media.url || msg.mediaUrl || '',
            name: media.fileName || msg.mediaName || '',
            mime: msg.mime,
            key: msg.mediaKey,
            duration: msg.duration,
            width: msg.width,
            height: msg.height,
            blurPreview: msg.blurPreview,
            thumbnail: msg.thumbnail || msg.blurPreview,
            uploading: msg.uploading,
            uploadedMb: msg.uploadedMb,
            size: msg.fileSize,
          }] : null);

      if (effectiveMediaItems && effectiveMediaItems.length > 0) {
        const isPhotoGroup = effectiveMediaItems.some((it) => it.type === 'photo' || it.type === 'video' || it.type === 'gif');
        const isAudioGroup = effectiveMediaItems.every((it) => it.type === 'audio' || it.mime?.startsWith('audio/'));
        const cleanCaption = msg.text ? msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*(https?:\/\/[^\s]+)?/i, '').trim() : '';
        const hasCaption = Boolean(cleanCaption);

        let groupBubbleWidth = 'min(440px, 85vw)';
        if (isPhotoGroup && effectiveMediaItems.length === 1) {
          const it = effectiveMediaItems[0];
          const w = it.width || msg.width;
          const h = it.height || msg.height;
          if (w && h && h > 0) {
            const ratio = w / h;
            if (ratio < 1) {
              const clampedR = Math.max(0.6, ratio);
              const computedW = Math.round(380 * clampedR);
              groupBubbleWidth = `min(${computedW}px, 75%)`;
            } else {
              groupBubbleWidth = `min(${Math.min(440, Math.max(260, w))}px, 75%)`;
            }
          }
        }

        return (
          <div style={{ ...highlightWrapperStyle }} data-datelabel={getDateLabel(msg.time)}>
            {wrapWithGroupAvatar(
              <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                <div
                  data-message="true"
                  data-message-id={msg.id}
                  data-sender={msg.sender}
                  data-read={String(msg.read)}
                  data-datelabel={getDateLabel(msg.time)}
                  className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isUnselected ? 'message-unselected' : ''}`}
                  style={{
                    transformOrigin: isOwn ? 'top right' : 'top left',
                    flex: 1,
                    filter: isUnselected ? 'brightness(0.55)' : 'none',
                    transition: 'filter 0.15s ease',
                  }}
                  onClick={(e) => handleMessageClick(e, msg.id!)}
                  onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
                >
                  <div
                    className="relative"
                    style={bubbleStyle(isOwn, {
                      borderRadius: customRadius,
                      padding: isPhotoGroup ? (hasCaption ? '2px 2px 4px 2px' : '0px') : (isAudioGroup ? '0px' : '1px 1px 4px 1px'),
                      background: (isPhotoGroup && !hasCaption) ? 'transparent' : undefined,
                      border: (isPhotoGroup && !hasCaption) ? 'none' : undefined,
                      overflow: 'hidden',
                      width: isPhotoGroup ? groupBubbleWidth : 'fit-content',
                      maxWidth: 'min(440px, 75%)',
                      boxSizing: 'border-box',
                    })}
                  >
                    {renderMediaGroup(msg, index, customRadius, effectiveMediaItems)}
                  </div>
                  {renderReactionBadges(msg, index)}
                </div>
              </div>
            )}
          </div>
        );
      }

    if (!media.type) {
      const isPinned = isMessagePinned(index);
      return (
        <div style={{ ...highlightWrapperStyle }} data-datelabel={getDateLabel(msg.time)}>
          {wrapWithGroupAvatar(
            <MessageItem
              msg={msg}
              isOwn={isOwn}
              isPinned={isPinned}
              onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
              themeColor={themeColor}
              bubbleRadius={customRadius}
              currentUserId={myUserId || myNickname}
              onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
              onQuoteClick={(q) => handleQuoteClick(q, index)}
              isGroup={isGroup}
              isPrevSameSender={isPrevSameSenderGroup}
              onLinkClick={handleLinkClick}
              onButtonClick={handleMessageButtonClick}
              onSenderClick={(sId, sName) => handleOpenDirectChat(sId, sName, senderMember)}
              activeChat={activeChat}
            />
          )}
        </div>
      );
    }

    const { quotes, body: mainText } = parseReplyChain(msg.text);
    const isEmojiOnlyMessage =
      !media.type &&
      quotes.length === 0 &&
      editingIndex !== index &&
      !!mainText.trim() &&
      isEmojiOnly(mainText);

    if (isEmojiOnlyMessage) {
      const emojiCount = countEmojis(mainText);
      let fontSize = '24px';
      if (emojiCount === 1) fontSize = '48px';
      else if (emojiCount <= 3) fontSize = '32px';

      const spacerWidth = isOwn ? (isMessagePinned(index) ? '72px' : '60px') : (isMessagePinned(index) ? '52px' : '40px');

      return (
        <div style={{ ...highlightWrapperStyle }} data-datelabel={getDateLabel(msg.time)}>
          {wrapWithGroupAvatar(
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div
                data-message="true"
                data-message-id={msg.id}
                data-sender={msg.sender}
                data-read={String(msg.read)}
                data-datelabel={getDateLabel(msg.time)}
                className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isUnselected ? 'message-unselected' : ''}`}
                style={{
                  transformOrigin: isOwn ? 'top right' : 'top left',
                  flex: 1,
                  filter: isUnselected ? 'brightness(0.55)' : 'none',
                  transition: 'filter 0.15s ease',
                }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
              >
                <div
                  className="max-w-[min(440px, 75%)] min-w-[60px] w-fit relative"
                  style={bubbleStyle(isOwn, isMessagePinned(index) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {})}
                >
                  <div
                    className="select-text"
                    style={{
                      fontSize: fontSize,
                      lineHeight: 1.2,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
                      {mainText}
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: spacerWidth,
                          height: 1,
                          pointerEvents: 'none',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                        }}
                      />
                    </span>
                    <span
                      aria-hidden
                      className="flex-shrink-0 select-none message-time-badge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        lineHeight: 1,
                        position: 'absolute',
                        bottom: '0px',
                        right: '0px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {timeBadge(msg, isMessagePinned(index))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div style={{ ...highlightWrapperStyle }} data-datelabel={getDateLabel(msg.time)}>
        {wrapWithGroupAvatar(
          <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
          <div
            data-message="true"
            data-message-id={msg.id}
            data-sender={msg.sender}
            data-read={String(msg.read)}
            data-datelabel={getDateLabel(msg.time)}
            className={`group relative flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${isUnselected ? 'message-unselected' : ''}`}
            style={{
              transformOrigin: isOwn ? 'top right' : 'top left',
              flex: 1,
              filter: isUnselected ? 'brightness(0.55)' : 'none',
              transition: 'filter 0.15s ease',
            }}
            onClick={(e) => handleMessageClick(e, msg.id!)}
            onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
          >
            {media.type === 'sticker' && (
              <div
                className={`relative w-fit flex flex-col ${isOwn ? 'items-end' : 'items-start'} group select-none`}
                style={{ padding: '0px', overflowAnchor: 'none' }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
              >
                <div className="relative w-[180px] h-[180px] max-w-[min(180px,70vw)] max-h-[min(180px,70vw)] flex items-center justify-center">
                  {media.url && media.url.toLowerCase().endsWith('.tgs') ? (
                    <TgsPlayer
                      src={media.url}
                      loop={true}
                      autoplay={true}
                      className="w-full h-full select-none cursor-pointer active:scale-[0.98] transition-transform"
                    />
                  ) : (
                    <img
                      src={media.url!}
                      alt=""
                      className="w-full h-full object-contain select-none cursor-pointer"
                      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                      loading="lazy"
                    />
                  )}
                  <div
                    className="absolute bottom-0.5 right-0.5 select-none tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150 message-time-badge"
                    style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.55)',
                      borderRadius: '8px',
                      padding: '2.5px 7px',
                      color: 'rgba(255, 255, 255, 0.95)',
                      fontSize: '11px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      lineHeight: 1,
                      zIndex: 2,
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    <span style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>{formatTimeOfDay(msg.time)}</span>
                    {isOwn && msg.status && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '5px', transform: 'translateY(-1.5px)', flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
                        <MessageStatus status={msg.status} isOwn={isOwn} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {media.type === 'image' && (
              <div
                className="max-w-[min(440px, 75%)] relative rounded-xl overflow-hidden shadow-lg cursor-pointer"
                style={{
                  border: 'none',
                  maxWidth: 'min(440px, 75%)',
                  width: msg.width && msg.height && msg.height > 0
                    ? `${Math.min(440, (msg.width / msg.height) < 1 ? Math.round(380 * Math.max(0.6, msg.width / msg.height)) : msg.width)}px`
                    : 'min(440px, 75vw)',
                  borderRadius: customRadius || bubbleRadius,
                }}
              >
                <EncryptedMedia
                  url={media.url!}
                  type="image"
                  sharedSecret={msg.mediaKey || sharedSecret}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  width={msg.width}
                  height={msg.height}
                  isGif={isGif}
                  isOwn={isOwn}
                  fileSize={msg.fileSize || (msg as any).size}
                  blurPreview={msg.blurPreview || msg.thumbnail}
                  timeNode={!(msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim()) ? timeBadge(msg, isMessagePinned(index)) : undefined}
                  onClick={() => openMediaViewer(media.url!, msg.id)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, index, isOwn)}
                />
              </div>
            )}

            {media.type === 'video' && (
              <div
                className="max-w-[min(440px, 75%)] relative rounded-xl overflow-hidden shadow-lg cursor-pointer"
                style={{
                  border: 'none',
                  maxWidth: 'min(440px, 75%)',
                  width: msg.width && msg.height && msg.height > 0
                    ? `${Math.min(440, (msg.width / msg.height) < 1 ? Math.round(380 * Math.max(0.6, msg.width / msg.height)) : msg.width)}px`
                    : 'min(440px, 75vw)',
                  borderRadius: customRadius || bubbleRadius,
                }}
              >
                <EncryptedMedia
                  url={media.url!}
                  type="video"
                  sharedSecret={msg.mediaKey || sharedSecret}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  width={msg.width}
                  height={msg.height}
                  isGif={isGif}
                  isOwn={isOwn}
                  fileSize={msg.fileSize || (msg as any).size}
                  blurPreview={msg.blurPreview || msg.thumbnail}
                  timeNode={!(msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim()) ? timeBadge(msg, isMessagePinned(index)) : undefined}
                  onClick={() => openMediaViewer(media.url!, msg.id)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, index, isOwn)}
                />
              </div>
            )}

            {(media.type === 'image' || media.type === 'video') && msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim() && (
              <div
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
                className="max-w-[min(440px, 75%)] min-w-[60px] w-fit mt-1"
                style={bubbleStyle(isOwn, isMessagePinned(index) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {})}
              >
                <MessageText text={msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+/i, '').trim() || msg.text} timeNode={timeBadge(msg, isMessagePinned(index))} themeColor={themeColor} isOwn={isOwn} isPinned={isMessagePinned(index)} onLinkClick={handleLinkClick} />
              </div>
            )}

            {!media.type && !isEmojiOnlyMessage && (
              <div
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
                className="max-w-[min(440px, 75%)] min-w-[60px] w-fit relative"
                style={bubbleStyle(isOwn, {
                  borderRadius: customRadius,
                  ...(editingIndex === index ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 50%, transparent)' } : {}),
                  ...(isMessagePinned(index) ? { outline: '1px solid color-mix(in srgb, var(--md-sys-color-primary) 35%, transparent)' } : {}),
                })}
              >
                {editingIndex === index ? (
                  <div className="flex flex-col gap-2" style={{ minWidth: '160px' }}>
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') triggerEditMessage(index, editText); if (e.key === 'Escape') { setEditingIndex(null); setEditText(''); } }}
                      className="bg-transparent border-b outline-none py-1 select-text w-full"
                      style={{ borderColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 30%, transparent)', color: 'var(--text-main, #ffffff)', fontSize: orbitFs(11) }}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end select-none">
                      <button type="button" onClick={() => { setEditingIndex(null); setEditText(''); }} className="uppercase" style={{ color: 'var(--text-dim, #4b5563)', fontSize: orbitFs(8) }}>{t('common.cancel')}</button>
                      <button type="button" onClick={() => triggerEditMessage(index, editText)} className="uppercase font-bold" style={{ color: 'var(--accent-color, #7C3AED)', fontSize: orbitFs(8) }}>{t('common.save')}</button>
                    </div>
                  </div>
                ) : quotes.length > 0 ? (
                  <div className="flex flex-col min-w-0" style={{ gap: '4px' }}>
                    {quotes.map((q, depth) => (
                      <div
                        key={`${index}-${depth}-${q.time}`}
                        className="flex w-full items-start gap-2 mb-0.5"
                        style={{
                          padding: '5px 10px',
                          backgroundColor: isOwn ? 'rgba(255, 255, 255, 0.15)' : 'color-mix(in srgb, var(--accent-color) 12%, transparent)',
                          borderRadius: '0 6px 6px 0',
                          borderLeft: isOwn ? '3px solid #ffffff' : '3px solid var(--accent-color)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold flex items-center gap-1" style={{ color: isOwn ? '#ffffff' : 'var(--accent-color)', fontSize: '12.5px', lineHeight: '1.2' }}>
                            {activeChat?.type === 'channel' && <ChannelMegaphoneIcon size={12} className="flex-shrink-0" />}
                            <span>{q.sender}</span>
                          </p>
                          <p className="truncate" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-main)', fontSize: '13px', lineHeight: '1.35', marginTop: '2px' }}>{q.text}</p>
                        </div>
                      </div>
                    ))}
                    <MessageText text={mainText} timeNode={timeBadge(msg, isMessagePinned(index))} themeColor={themeColor} isOwn={isOwn} onLinkClick={handleLinkClick} />
                  </div>
                ) : (
                  <MessageText text={mainText} timeNode={timeBadge(msg, isMessagePinned(index))} themeColor={themeColor} isOwn={isOwn} onLinkClick={handleLinkClick} />
                )}
              </div>
            )}

            {media.type === 'music' && (
              <AudioMessageBubble
                msg={msg}
                chatId={activeChatId || undefined}
                sharedSecret={msg.mediaKey || sharedSecret}
                bubbleRadius={customRadius}
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
                timeNode={timeBadge(msg, isMessagePinned(index))}
                isOwn={isOwn}
                onCancelUpload={msg.uploading ? () => {
                  if (activeChatId && msg.id) {
                    useChatStore.getState().deleteMessage(activeChatId, msg.id);
                  }
                } : undefined}
              />
            )}

            {media.type === 'voice' && (
              <div onContextMenu={(e) => handleContextMenu(e, index, isOwn)}>
                <VoiceMessagePlayer
                  url={media.url!}
                  fileName={media.fileName}
                  sharedSecret={msg.mediaKey || sharedSecret}
                  mime={media.mime}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  msg={msg}
                  timeNode={timeBadge(msg, isMessagePinned(index))}
                  isOwn={isOwn}
                  customRadius={customRadius}
                />
              </div>
            )}

            {media.type === 'file' && (
              <div onContextMenu={(e) => handleContextMenu(e, index, isOwn)}>
                <FileMessage
                  url={media.url!}
                  fileName={media.fileName}
                  sharedSecret={msg.mediaKey || sharedSecret}
                  chatId={activeChatId || undefined}
                  messageId={msg.id}
                  size={media.size || msg.fileSize || (msg as any).size}
                  timeNode={timeBadge(msg, isMessagePinned(index))}
                  isOwn={isOwn}
                  customRadius={customRadius}
                />
              </div>
            )}

            {media.type === 'call' && (
              <div onContextMenu={(e) => handleContextMenu(e, index, isOwn)}>
                <CallMessage msg={msg} chatId={activeChatId!} onCall={handleCallPress} isOwn={isOwn} customRadius={customRadius} />
              </div>
            )}
            {renderReactionBadges(msg, index)}
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <>
      {dateDividerNode}
      {renderContent()}
    </>
  );
}, [myNickname, editingIndex, editText, sharedSecret, bubbleRadius, themeColor, getDateLabel, isMessagePinned, selection, handleMessageClick, handleContextMenu, handleCallPress, activeChatId, triggerEditMessage, t, bubbleStyle, timeBadge, renderMediaGroup]);



  return (
    <div
      className="flex flex-col h-full bg-transparent overflow-hidden min-h-0 relative"
      onMouseDown={handleChatWindowMouseDown}
      onClick={handleChatWindowClick}
      onContextMenu={(e) => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDropFiles}
    >
      <ChatHeader
        headerRef={headerRef}
        activeChatId={activeChatId}
        activeChat={activeChat}
        isMobileView={isMobileView}
        onBack={onBack}
        isOnline={isOnline}
        otherUserTyping={otherUserTyping}
        isServerConnected={isServerConnected}
        voiceCallsEnabled={voiceCallsEnabled}
        onAudioCallPress={handleAudioCallPress}
        onAddMember={() => setIsAddMemberModalOpen(true)}
        onOpenSupportTickets={() => setIsSupportTicketsModalOpen(true)}
        onProfileClick={() => setActiveProfileChatId(activeChatId)}
      />

      {selection.isSelectionMode && (
        <SelectionPanel
          selectedCount={selection.selectedIds.size}
          onDelete={activeChat?.type === 'channel' && !isChannelOwner ? undefined : requestDeleteSelected}
          onCancel={selection.exitSelectionMode}
          height={headerHeight}
        />
      )}

      {activeChat?.type === 'group' && activeChat.activeCallRoom && !isUserInCall && (
        <div
          className="flex-shrink-0 flex items-center justify-between select-none px-4 py-2.5 transition-all"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 14%, var(--bg-secondary))',
            borderBottom: 'none',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              className="w-6 h-6 flex-shrink-0 text-[var(--accent-color,#7C3AED)]"
            >
              <g fill="none">
                <path fill="currentColor" d="m13.087 21.388l.645.382zm.542-.916l-.646-.382zm-3.258 0l-.645.382zm.542.916l.646-.382zm-8.532-5.475l.693-.287zm5.409 3.078l-.013.75zm-2.703-.372l-.287.693zm16.532-2.706l.693.287zm-5.409 3.078l-.012-.75zm2.703-.372l.287.693zm.7-15.882l-.392.64zm1.65 1.65l.64-.391zM4.388 2.738l-.392-.64zm-1.651 1.65l-.64-.391zM9.403 19.21l.377-.649zm4.33 2.56l.541-.916l-1.29-.764l-.543.916zm-4.007-.916l.542.916l1.29-.764l-.541-.916zm2.715.152a.52.52 0 0 1-.882 0l-1.291.764c.773 1.307 2.69 1.307 3.464 0zM10.5 2.75h3v-1.5h-3zm10.75 7.75v1h1.5v-1zm-18.5 1v-1h-1.5v1zm-1.5 0c0 1.155 0 2.058.05 2.787c.05.735.153 1.347.388 1.913l1.386-.574c-.147-.352-.233-.782-.278-1.441c-.046-.666-.046-1.51-.046-2.685zm6.553 6.742c-1.256-.022-1.914-.102-2.43-.316L4.8 19.313c.805.334 1.721.408 2.977.43zM1.688 16.2A5.75 5.75 0 0 0 4.8 19.312l.574-1.386a4.25 4.25 0 0 1-2.3-2.3zm19.562-4.7c0 1.175 0 2.019-.046 2.685c-.045.659-.131 1.089-.277 1.441l1.385.574c.235-.566.338-1.178.389-1.913c.05-.729.049-1.632.049-2.787zm-5.027 8.241c1.256-.021 2.172-.095 2.977-.429l-.574-1.386c-.515.214-1.173.294-2.428.316zm4.704-4.115a4.25 4.25 0 0 1-2.3 2.3l.573 1.386a5.75 5.75 0 0 0 3.112-3.112zM13.5 2.75c1.651 0 2.837 0 3.762.089c.914.087 1.495.253 1.959.537l.783-1.279c-.739-.452-1.577-.654-2.6-.752c-1.012-.096-2.282-.095-3.904-.095zm9.25 7.75c0-1.622 0-2.891-.096-3.904c-.097-1.023-.299-1.862-.751-2.6l-1.28.783c.285.464.451 1.045.538 1.96c.088.924.089 2.11.089 3.761zm-3.53-7.124a4.25 4.25 0 0 1 1.404 1.403l1.279-.783a5.75 5.75 0 0 0-1.899-1.899zM10.5 1.25c-1.622 0-2.891 0-3.904.095c-1.023.098-1.862.3-2.6.752l.783 1.28c.464-.285 1.045-.451 1.96-.538c.924-.088 2.11-.089 3.761-.089zM2.75 10.5c0-1.651 0-2.837.089-3.762c.087-.914.253-1.495.537-1.959l-1.279-.783c-.452.738-.654 1.577-.752 2.6C1.25 7.61 1.25 8.878 1.25 10.5zm1.246-8.403a5.75 5.75 0 0 0-1.899 1.899l1.28.783a4.25 4.25 0 0 1 1.402-1.403zm7.02 17.993c-.202-.343-.38-.646-.554-.884a2.2 2.2 0 0 0-.682-.645l-.754 1.297c.047.028.112.078.224.232c.121.166.258.396.476.764zm-3.24-.349c.44.008.718.014.93.037c.198.022.275.054.32.08l.754-1.297a2.2 2.2 0 0 0-.909-.274c-.298-.033-.657-.038-1.069-.045zm6.498 1.113c.218-.367.355-.598.476-.764c.112-.154.177-.204.224-.232l-.754-1.297c-.29.17-.5.395-.682.645c-.173.238-.352.54-.555.884zm1.924-2.612c-.412.007-.771.012-1.069.045c-.311.035-.616.104-.909.274l.754 1.297c.045-.026.122-.058.32-.08c.212-.023.49-.03.93-.037z"/>
                <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M12 15V7m-4 6V9m8 4V9"/>
              </g>
            </svg>
            <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">
              {t('groupCall.active_title', 'Идёт групповой звонок')}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAudioCallPress}
            aria-label={t('groupCall.join', 'Присоединиться')}
            className="px-3 py-1.5 rounded-lg text-white font-semibold text-[12px] transition-opacity hover:opacity-90 cursor-pointer border-0"
            style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
          >
            {t('groupCall.join', 'Присоединиться')}
          </button>
        </div>
      )}

      <ChatPinnedBar
        pinnedMessage={pinnedMessage}
        activeChat={activeChat}
        isChannelOwner={isChannelOwner}
        onScrollToPinned={scrollToPinnedMessage}
        onUnpin={requestUnpinMessage}
        onLinkClick={handleLinkClick}
      />

      <div
        className="flex-1 min-h-0 flex flex-col relative"
        onMouseMove={triggerChatActive}
        onMouseEnter={triggerChatActive}
        onMouseLeave={handleChatMouseLeave}
      >
        <AnimatePresence>
          {showFloatingDate && floatingDate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: floatingDateOffsetY }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 0.1 }, y: { duration: 0 } }}
              className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none date-badge"
              style={{ top: '12px', userSelect: 'none', WebkitUserSelect: 'none' }}
            >
              <div
                className="date-badge-pill select-none"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-container, rgba(255,255,255,0.06)) 92%, #000)',
                  color: 'var(--text-main, #ffffff)',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '3px 12px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                }}
              >
                {floatingDate}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          onWheel={handleMessagesWheel}
          className="chat-list-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden flex flex-col"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '6px 0 0 0',
            boxSizing: 'border-box',
            transform: 'translateZ(0)',
            willChange: 'scroll-position',
            overscrollBehaviorY: 'contain',
          }}
        >
          {messages.length === 0 ? (
            activeChat?.type === 'channel' ? (
              <ChannelEmptyCard key={activeChat.id} chat={activeChat} />
            ) : activeChat?.type === 'group' ? (
              <GroupEmptyCard key={activeChat.id} chat={activeChat} />
            ) : (
              <EmptyChatGreeting
                onSendGreeting={(stk) => {
                  if (stk) {
                    handleSendSticker(stk);
                  } else {
                    triggerMessage('👋');
                  }
                }}
                isInitiator={activeChat?.isChatInitiator}
                isPeerOnline={activeChat?.online}
                isRatchetReady={Boolean(activeChat?.ratchetState)}
                chatId={activeChatId}
              />
            )
          ) : (
            <MessageList
              messages={visibleMessages}
              startIndex={startIndex}
              renderFn={renderMessage}
            />
          )}



          <div style={{ height: '10px', flexShrink: 0 }} />
        </div>

        {chatThumb && (
          <>
            <div
              className="overlay-scroll-track"
              onMouseDown={(e) => handleScrollbarTrackMouseDown(e, messagesContainerRef.current)}
              style={{
                top: '6px',
                bottom: '6px',
                opacity: isChatActive ? 1 : 0,
              }}
            />

            <div
              className="overlay-scroll-thumb"
              onMouseDown={(e) => handleScrollbarThumbMouseDown(e, messagesContainerRef.current)}
              style={{
                top: chatThumb.top + 6,
                height: chatThumb.height,
                opacity: isChatActive ? 1 : 0,
              }}
            />
          </>
        )}

        <button
          className={`scroll-btn ${showScrollDown ? 'visible' : ''}`}
          onClick={() => scrollToBottom(false)}
          style={{
            position: 'absolute',
            right: isMobileView ? '12px' : '20px',
            bottom: '16px',
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
            color: 'var(--text-main)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.25s ease, transform 0.25s ease, bottom 0.2s ease',
            opacity: showScrollDown ? 1 : 0,
            transform: showScrollDown ? 'scale(1)' : 'scale(0.8)',
            pointerEvents: showScrollDown ? 'auto' : 'none',
            zIndex: 30,
          }}
        >
          {unreadCount > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '-5px',
                right: unreadCount >= 10 ? '-6px' : '-2px',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                minWidth: '18px',
                height: '18px',
                borderRadius: unreadCount >= 10 ? '9999px' : '50%',
                padding: unreadCount >= 10 ? '0 6px' : '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                lineHeight: 1,
                zIndex: 35,
                whiteSpace: 'nowrap',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
          <ChevronDown size={22} style={{ color: 'var(--text-main)' }} />
        </button>
      </div>

      {activeChat?.type === 'channel' && !isChannelOwner ? (
        !isSubscribed ? (
          <div
            style={{
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              margin: '0 auto',
            }}
          >
            <button
              onClick={handleSubscribeToChannel}
              disabled={isSubscribing}
              aria-label={t('channel_settings.subscribe', 'Подписаться')}
              style={{
                width: '100%',
                maxWidth: '280px',
                padding: '11px 28px',
                borderRadius: '9999px',
                border: 'none',
                outline: 'none',
                background: 'var(--accent-color, #7C3AED)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: isSubscribing ? 'default' : 'pointer',
                opacity: isSubscribing ? 0.7 : 1,
                transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(124, 58, 237, 0.25)',
              }}
              onMouseDown={(e) => {
                if (!isSubscribing) (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
              }}
            >
              {t('channel_settings.subscribe', 'Подписаться')}
            </button>
          </div>
        ) : null
      ) : (
        <MessageInput
          inputText={inputText}
          setInputText={handleSetInputText}
          editingIndex={editingIndex}
          editingOriginalText={editingIndex !== null && messages[editingIndex] ? messages[editingIndex].text : ''}
          onCancelEdit={handleCancelEdit}
          editText={editText}
          setEditText={setEditText}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          recordingTime={recordingTime}
          recordingAmplitude={recordingAmplitude}
          onSendMessage={handleSendMessage}
          onEditMessage={handleEditMessage}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecordingAndSend}
          onPauseRecording={pauseAudioRecording}
          onResumeRecording={resumeAudioRecording}
          onCancelRecording={cancelAudioRecording}
          onFilePick={handleFilePick}
          onToggleEmoji={toggleEmoji}
          isEmojiOpen={isEmojiPanelOpen}
          canSend={canSend}
          isRatchetReady={isRatchetReady}
          isPrivateChat={isPrivateChat}
          isChannel={activeChat?.type === 'channel'}
          emojiButtonRef={emojiButtonRef}
          inputRef={inputRef}
          onOpenTxtModal={handleOpenTxtModal}
          onEmojiMouseEnter={handleEmojiMouseEnter}
          onEmojiMouseLeave={handleEmojiMouseLeave}
        />
      )}

        <DiscordFileLimitModal
          isOpen={isDiscordFileLimitModalOpen}
          onClose={() => setIsDiscordFileLimitModalOpen(false)}
          maxMb={MAX_FILE_MB}
        />

        <SendAsTxtModal
          isOpen={isSendAsTxtModalOpen}
          onClose={() => setIsSendAsTxtModalOpen(false)}
          onSend={handleSendAsTxt}
          textLength={inputText.length}
        />

        <ActionConfirmModal
          isOpen={confirmModal.isOpen}
          type={confirmModal.type}
          chatName={activeChatId === 'notes' ? t('connectModal.notes') : activeChat?.name}
          avatarUrl={activeChat?.avatarUrl}
          isNotes={activeChatId === 'notes'}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false, type: null }))}
          onConfirm={handleConfirmAction}
        />

        {mediaViewerState.isOpen && (
          <TelegramMediaViewer
            isOpen={mediaViewerState.isOpen}
            items={mediaViewerState.customItems || chatMediaViewerItems}
            initialIndex={mediaViewerState.initialIndex}
            sharedSecret={sharedSecret}
            onClose={() => setMediaViewerState((prev) => ({ ...prev, isOpen: false }))}
            onGoToMessage={handleMediaGoToMessage}
            onForwardMessage={handleMediaForwardMessage}
            onDeleteMessage={handleMediaDeleteMessage}
            onOpenAllMedia={() => {
              if (activeChatId) {
                useChatStore.getState().setActiveProfileChatId(activeChatId);
              }
            }}
          />
        )}

        <FileAttachmentModal
          files={attachedFiles}
          isOpen={isAttachmentModalOpen}
          onClose={() => {
            setAttachedFiles([]);
            setIsAttachmentModalOpen(false);
          }}
          onAddFiles={handleAddMoreFiles}
          onRemoveFile={(idx: number) => {
            setAttachedFiles((prev) => {
              const next = prev.filter((_, i) => i !== idx);
              if (next.length === 0) setIsAttachmentModalOpen(false);
              return next;
            });
          }}
          onSend={handleSendFiles}
          isSending={isSendingFiles}
        />

        <AnimatePresence>
          {isDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 50,
                backgroundColor: 'rgba(20, 16, 30, 0.88)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                padding: '24px',
              }}
            >
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '28px',
                  backgroundColor: 'var(--surface-container-strong, rgba(255,255,255,0.08))',
                  border: '2px dashed var(--accent-color, #7C3AED)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: 'var(--accent-color, #7C3AED)',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>

              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: 'var(--text-main, #ffffff)',
                  marginBottom: '6px',
                  textAlign: 'center',
                }}
              >
                {t('chatWindow.drag_drop_title', 'Перетащите сюда файлы')}
              </div>

              <div
                style={{
                  fontSize: '14px',
                  color: 'var(--text-dim, rgba(255,255,255,0.6))',
                  textAlign: 'center',
                }}
              >
                {t('chatWindow.drag_drop_subtitle', 'для их отправки без сжатия')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {contextMenu.visible &&
        createPortal(
          <AnimatePresence>
            <MessageContextMenu
              menu={contextMenu}
              setMenu={setContextMenu}
              onReply={() => handleReply(contextMenu.messageIndex)}
              onEdit={() => handleEdit(contextMenu.messageIndex)}
              onPin={() => isMessagePinned(contextMenu.messageIndex) ? requestUnpinMessage() : requestPinMessage(contextMenu.messageIndex)}
              onDelete={() => requestDeleteMessage(contextMenu.messageIndex)}
              isPinned={isMessagePinned(contextMenu.messageIndex)}
              onCopy={contextMenu.type === 'text' ? () => handleCopy(contextMenu.messageIndex) : undefined}
              onCopyImage={contextMenu.type === 'singleImage' ? async () => {
                const msg = messages[contextMenu.messageIndex];
                if (!msg) return;
                const media = parseMedia(msg);
                const mediaUrl = media.url || msg.mediaUrl;
                if (!mediaUrl) return;
                const cacheKey = sharedSecret ? `${mediaUrl}::${sharedSecret}` : null;
                const cached = (cacheKey && sharedSecret) ? (decryptedUrlCache.get(cacheKey) || mediaManager.getCachedMedia(mediaUrl, sharedSecret)?.blobUrl) : null;
                if (cached) {
                  handleCopyImage(cached);
                } else if (sharedSecret) {
                  const item = await mediaManager.getMedia(mediaUrl, sharedSecret, media.fileName, activeChatId || undefined, msg.id);
                  if (item?.blobUrl) handleCopyImage(item.blobUrl);
                  else handleCopyImage(mediaUrl);
                } else {
                  handleCopyImage(mediaUrl);
                }
              } : undefined}
              onSaveAs={() => handleSaveAs(contextMenu.messageIndex)}
              onSelect={handleSelectFromMenu}
              onSelectReaction={(emoji) => triggerReactionMessage(contextMenu.messageId ?? contextMenu.messageIndex, emoji)}
              canManageMessages={activeChat?.type !== 'channel' || isChannelOwner}
            />
          </AnimatePresence>,
          document.body
        )
      }

      <style>{`
        :focus-within { outline: none; }
        .selectable-message-text::selection, .select-text::selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
        .selectable-message-text::-moz-selection, .select-text::-moz-selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
        .select-none::selection, .message-time-badge::selection, .date-badge::selection, .date-badge-pill::selection, [data-date-divider]::selection { background-color: transparent !important; color: inherit !important; }
        .select-none::-moz-selection, .message-time-badge::-moz-selection, .date-badge::-moz-selection, .date-badge-pill::-moz-selection, [data-date-divider]::-moz-selection { background-color: transparent !important; color: inherit !important; }
        .floating-photo-time-badge, .floating-photo-time-badge * { color: rgba(255, 255, 255, 0.95) !important; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
        .input-textarea::placeholder { color: var(--text-dim); }

        .scroll-btn {
          opacity: 0;
          transform: scale(0.8);
          pointer-events: none;
          transition: opacity 0.25s ease, transform 0.25s ease;
        }
        .scroll-btn.visible {
          opacity: 1;
          transform: scale(1);
          pointer-events: auto;
        }

        .input-container {
          position: relative;
          border-radius: 9999px;
        }
        .comet-canvas {
          position: absolute;
          pointer-events: none;
        }
        .input-box {
          position: relative;
          z-index: 1;
          border-radius: 9999px;
          padding: 8px 12px;
        }

        .glow-dot {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #ffdd99;
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 4px #ffcc66;
          animation: twinkle 3s ease-in-out infinite;
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50% { opacity: 0.7; transform: scale(1.2); }
        }

        textarea {
          display: block;
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: var(--text-main);
          font-size: 15px;
          line-height: 1.5;
          font-family: inherit;
          max-height: 120px;
          min-height: 20px;
          overflow-y: auto;
          scrollbar-width: none;
        }
        textarea::-webkit-scrollbar { display: none; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .message-unselected {
          filter: brightness(0.55);
          transition: filter 0.15s ease;
        }
        .message-unselected:hover {
          filter: brightness(0.7);
        }
      `}</style>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isEmojiPanelOpen && (
            <EmojiPicker
              key="chat-emoji-picker"
              anchorEl={emojiButtonRef.current}
              headerEl={headerRef.current}
              onSelect={handleEmojiSelect}
              onSelectGif={handleSendGif}
              onSelectSticker={handleSendSticker}
              onClose={handleEmojiPanelClose}
              recentEmojis={recentEmojis}
              onRecentUpdate={addRecentEmoji}
              onMouseEnter={handleEmojiMouseEnter}
              onMouseLeave={handleEmojiMouseLeave}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      <UnsafeLinkModal
        isOpen={unsafeLinkData.isOpen}
        url={unsafeLinkData.url}
        onClose={() => setUnsafeLinkData({ isOpen: false, url: '' })}
      />

      {createPortal(
        <AnimatePresence>
          {isSupportTicketsModalOpen && (
            <SupportTicketsModal
              isOpen={isSupportTicketsModalOpen}
              onClose={() => setIsSupportTicketsModalOpen(false)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {activeChat?.type === 'group' && (
        <AddGroupMemberModal
          isOpen={isAddMemberModalOpen}
          onClose={() => setIsAddMemberModalOpen(false)}
          group={activeChat}
        />
      )}
    </div>
  );
});
ChatWindow.displayName = 'ChatWindow';