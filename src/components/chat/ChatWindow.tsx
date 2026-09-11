// src/components/chat/ChatWindow.tsx
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
  X, File, ArrowLeft,
  Copy, Image as ImageIcon, Download as DownloadIcon,
  CheckCircle, Trash, ChevronDown, Search
} from 'lucide-react';
import { useChatStore, type Message, type MediaItem, type LinkPreviewData, isMessageOutgoing } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { getPusher } from '../../utils/pusher';
import { ablyService } from '../../services/ablyService';
import { MessageStatus } from '../MessageStatus';
import { DoubleRatchet } from '../../lib/double-ratchet';
import { useTranslation } from 'react-i18next';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { useCallStore } from '../../store/useCallStore';
import { useConnectionStore } from '../../store/useConnectionStore';
import { supabaseService } from '../../services/supabaseService';
import { AttachedFile } from './FileAttachmentModal';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import {
  isEmojiOnly,
  EMOJI_CATEGORIES,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';
import { useDecryptedMedia } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { stripExifMetadata } from '../../lib/exifStripper';
import { AudioMessageBubble } from './AudioMessageBubble';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';
import { useSelection } from '../../hooks/useSelection';
import { SelectionPanel } from './SelectionPanel';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { MessageInput } from './MessageInput';
import { TelegramAlbumGrid } from './TelegramAlbumGrid';
import { GroupedAudioBubble } from './GroupedAudioBubble';
import { useShallow } from 'zustand/react/shallow';
import { parseReplyChain, countEmojis, formatTimeOfDay, markdownToHtml, arrayBufferToBase64, formatLastSeen, formatPreviewText } from '../../utils/messageUtils';
import { useToastStore } from '../../store/useToastStore';
import { MessageItem } from './MessageItem';
import { MessageReactions } from './ReactionBadge';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useAudioStore } from '../../store/useAudioStore';
import { type MediaViewerItem } from './TelegramMediaViewer';
import { channelService } from '../../services/channelService';
import { EmojiPicker } from './EmojiPicker';
import { DiscordFileLimitModal } from './DiscordFileLimitModal';
import { SendAsTxtModal } from './SendAsTxtModal';
import { FileAttachmentModal } from './FileAttachmentModal';
import { TelegramMediaViewer } from './TelegramMediaViewer';
import { ActionConfirmModal } from '../common/ActionConfirmModal';
import { useDevicePermissionStore } from '../../store/useDevicePermissionStore';
import { EmptyChatGreeting } from './EmptyChatGreeting';
import { sendEncryptedReadReceipt } from '../../services/receiptService';
import { orbitosService } from '../../services/orbitosService';
import { BotAvatar } from '../common/BotAvatar';

declare global {
  interface Window {
    _lastSendTime?: number;
  }
}

const MAX_FILE_MB = 10;

/**
 * Вычисляет оптимальный размер порции сообщений под высоту и ширину экрана устройства.
 * - Телефон / компактное окно: 20 сообщений
 * - Стандартный ноутбук / монитор: 25 сообщений
 * - Full HD / 2K экран: 30 сообщений
 * - 4K экран: 35 сообщений
 */
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

// Memoized row wrapper: prevents unnecessary re-renders of already-visible rows
// during scrolling.
const MessageRowWrapper = memo(
  ({ index, msg, renderFn }: { index: number; msg: Message; renderFn: (i: number, m: Message) => React.ReactNode }) =>
    renderFn(index, msg) as React.ReactElement,
  (prev, next) =>
    prev.msg === next.msg &&
    prev.index === next.index &&
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
    prev.startIndex === next.startIndex &&
    prev.renderFn === next.renderFn
);
MessageList.displayName = 'MessageList';

const orbitFs = (px: number) => `calc(${px}px * var(--text-scale, 1))`;

const EMPTY_ARRAY: Message[] = [];

const parseMedia = (msg: Message): { type: 'image' | 'video' | 'audio' | 'music' | 'voice' | 'file' | 'call' | 'sticker' | null; url: string | null; fileName?: string; mime?: string } => {
  if (msg.mediaType === 'call') {
    return { type: 'call', url: null, fileName: msg.mediaName };
  }

  if (msg.mediaItems && msg.mediaItems.length > 0) {
    const first = msg.mediaItems[0];
    const type = first.type === 'video' ? 'video' : first.type === 'audio' ? 'music' : first.type === 'file' ? 'file' : 'image';
    return { type, url: first.url, fileName: first.name, mime: first.mime };
  }

  // 1. Check Voice FIRST: voice is ogg, opus, or voice_*
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

  if (msg.mediaType && msg.mediaUrl) {
    if (msg.mediaType === 'photo') return { type: 'image', url: msg.mediaUrl, fileName: msg.mediaName, mime: msg.mime || 'image/jpeg' };
    if (msg.mediaType === 'video') return { type: 'video', url: msg.mediaUrl, fileName: msg.mediaName, mime: msg.mime || 'video/mp4' };
    if (msg.mediaType === 'audio') return { type: 'music', url: msg.mediaUrl, fileName: msg.mediaName, mime: msg.mime || 'audio/mpeg' };
    if (msg.mediaType === 'file') return { type: 'file', url: msg.mediaUrl, fileName: msg.mediaName, mime: msg.mime || 'application/octet-stream' };
    if (msg.mediaType === ('sticker' as any)) return { type: 'sticker', url: msg.mediaUrl, fileName: msg.mediaName, mime: msg.mime || 'image/webp' };
    if (msg.mediaType === 'gif') return { type: 'video', url: msg.mediaUrl, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const text = msg.text || '';
  const stickerMatch = text.match(/^\[Sticker\]\s*(.+)$/i);
  if (stickerMatch) return { type: 'sticker', url: stickerMatch[1].trim() };

  const gifMatch = text.match(/^\[GIF\]\s*(.+)$/i);
  if (gifMatch) return { type: 'video', url: gifMatch[1].trim(), fileName: msg.mediaName || 'animation.mp4', mime: 'video/mp4' };

  const isGifMsg =
    (msg.mime === 'image/gif' && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaName && /\.gif$/i.test(msg.mediaName) && !msg.text?.startsWith('[Photo]')) ||
    (msg.mediaUrl && (msg.mediaUrl.includes('giphy.com') || msg.mediaUrl.includes('tenor.com')));

  if (isGifMsg) {
    const url = msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || null;
    return { type: 'video', url, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
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

export const CustomPinIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="m11.294.984l3.722 3.722a1.75 1.75 0 0 1-.504 2.826l-1.327.613a3.09 3.09 0 0 0-1.707 2.084l-.584 2.454c-.317 1.332-1.972 1.8-2.94.832L5.75 11.311L1.78 15.28a.749.749 0 1 1-1.06-1.06l3.969-3.97l-2.204-2.204c-.968-.968-.5-2.623.832-2.94l2.454-.584a3.08 3.08 0 0 0 2.084-1.707l.613-1.327a1.75 1.75 0 0 1 2.826-.504M6.283 9.723l2.732 2.731a.25.25 0 0 0 .42-.119l.584-2.454a4.59 4.59 0 0 1 2.537-3.098l1.328-.613a.25.25 0 0 0 .072-.404l-3.722-3.722a.25.25 0 0 0-.404.072l-.613 1.328a4.58 4.58 0 0 1-3.098 2.537l-2.454.584a.25.25 0 0 0-.119.42l2.731 2.732Z" />
  </svg>
);

export const CustomUnpinIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="m1.655.595l13.75 13.75q.22.219.22.53t-.22.53q-.219.22-.53.22t-.53-.22L.595 1.655q-.22-.219-.22-.53t.22-.53q.219-.22.53-.22t.53.22M.72 14.22l4.5-4.5q.219-.22.53-.22t.53.22q.22.219.22.53t-.22.53l-4.5 4.5q-.219.22-.53.22t-.53-.22q-.22-.219-.22-.53t.22-.53" />
    <path d="m5.424 6.146l-1.759.419q-.143.034-.183.175t.064.245l5.469 5.469q.104.104.245.064t.175-.183l.359-1.509q.072-.302.337-.465q.264-.163.567-.091t.465.337t.09.567l-.359 1.509q-.238.999-1.226 1.278q-.988.28-1.714-.446L2.485 8.046q-.726-.726-.446-1.714t1.278-1.226l1.759-.419q.303-.072.567.091q.265.163.337.465t-.091.567q-.163.264-.465.336M7.47 3.47q.155-.156.247-.355l.751-1.627Q8.851.659 9.75.498q.899-.16 1.544.486l3.722 3.722q.646.645.486 1.544t-.99 1.282l-1.627.751q-.199.092-.355.247q-.219.22-.53.22t-.53-.22q-.22-.219-.22-.53t.22-.53q.344-.345.787-.549l1.627-.751q.118-.055.141-.183t-.069-.221l-3.722-3.722q-.092-.092-.221-.069q-.128.023-.183.141l-.751 1.627q-.204.443-.549.787q-.219.22-.53.22t-.53-.22T7.25 4t.22-.53" />
  </svg>
);

export const CustomEditIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" className={className} style={style}>
    <path d="M3.782 16.31L3 21l4.69-.782a3.96 3.96 0 0 0 2.151-1.106L20.42 8.532a1.98 1.98 0 0 0 0-2.8L18.269 3.58a1.98 1.98 0 0 0-2.802 0L4.888 14.16a3.96 3.96 0 0 0-1.106 2.15M14 6l4 4" />
  </svg>
);

export const CustomReplyIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className} style={style}>
    <path d="M28.88 30a1 1 0 0 1-.88-.5A15.19 15.19 0 0 0 15 22v6a1 1 0 0 1-.62.92a1 1 0 0 1-1.09-.21l-12-12a1 1 0 0 1 0-1.42l12-12a1 1 0 0 1 1.09-.21A1 1 0 0 1 15 4v6.11a17.19 17.19 0 0 1 15 17a16 16 0 0 1-.13 2a1 1 0 0 1-.79.86ZM14.5 20A17.62 17.62 0 0 1 28 26a15.31 15.31 0 0 0-14.09-14a1 1 0 0 1-.91-1V6.41L3.41 16L13 25.59V21a1 1 0 0 1 1-1h.54Z" />
  </svg>
);

export const CustomClearHistoryIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className} style={style}>
    <path d="M29.707 2.293a1 1 0 0 0-1.414 0l-9.341 9.34c-2.905-2.205-7.014-1.873-9.647.747l-1.368 1.277l-5.35 2.433a1 1 0 0 0-.294 1.617l12 12a1 1 0 0 0 1.617-.293l2.425-5.335l1.372-1.372a7.336 7.336 0 0 0 .66-9.66l9.34-9.34a1 1 0 0 0 0-1.414M8.283 15.697l8.02 8.02l-1.616 3.555l-9.96-9.959zm9.217 6.389l-7.561-7.561l.743-.694l.025-.024c2.13-2.13 5.497-2.188 7.586-.1a5.34 5.34 0 0 1 0 7.586z" />
  </svg>
);


export const CustomMuteIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className={className} style={style}>
    <path d="M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602A5 5 0 0 1 15 16m2.7-11a9 9 0 0 1 2.362 11.086m-1.676 2.299A9 9 0 0 1 17.7 19M9.069 5.054L9.5 4.5A.8.8 0 0 1 11 5v2m0 4v8a.8.8 0 0 1-1.5.5L6 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2l1.294-1.664M3 3l18 18" />
  </svg>
);

export const CustomUnmuteIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className={className} style={style}>
    <path d="M15 8a5 5 0 0 1 0 8m2.7-11a9 9 0 0 1 0 14M6 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2l3.5-4.5A.8.8 0 0 1 11 5v14a.8.8 0 0 1-1.5.5z" />
  </svg>
);

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

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  messageIndex: number;
  messageId?: string;
  isOwn: boolean;
  type: 'text' | 'singleImage' | 'multipleImages' | 'file' | 'sticker';
  hasMultipleImages: boolean;
}
const QUICK_REACTIONS = ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];

const QuickReactionHeader = ({
  onSelectReaction,
  onCloseMenu,
  isExpanded,
  setIsExpanded,
  expandedHeight = 244,
}: {
  onSelectReaction?: (emoji: string) => void;
  onCloseMenu: () => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  expandedHeight?: number;
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('orbita-recent-reactions');
      return saved ? JSON.parse(saved) : ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];
    } catch {
      return ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];
    }
  });

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelectReaction?.(emoji);
      setRecentEmojis((prev) => {
        const updated = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 14);
        try {
          localStorage.setItem('orbita-recent-reactions', JSON.stringify(updated));
        } catch { }
        return updated;
      });
      onCloseMenu();
    },
    [onSelectReaction, onCloseMenu]
  );

  useEffect(() => {
    if (isExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isExpanded]);

  const allEmojisList = useMemo(() => {
    if (!isExpanded) return [];
    if (searchQuery.trim()) {
      return searchEmojis(searchQuery);
    }
    const list: Emoji[] = [];
    const seen = new Set<string>();
    for (const char of recentEmojis) {
      const em = getEmojiByChar(char);
      if (em && !seen.has(em.id)) {
        seen.add(em.id);
        list.push(em);
      }
    }
    for (const catId of EMOJI_CATEGORIES) {
      const emojis = getEmojisByCategory(catId);
      for (const em of emojis) {
        if (!seen.has(em.id)) {
          seen.add(em.id);
          list.push(em);
        }
      }
    }
    return list;
  }, [isExpanded, searchQuery, recentEmojis]);

  return (
    <motion.div
      initial={false}
      animate={{
        height: isExpanded ? expandedHeight : 40,
        borderRadius: '8px',
      }}
      transition={{ duration: 0.45, ease: [0.5, 1, 0.5, 1] }}
      className="relative backdrop-blur-xl shadow-2xl select-none overflow-hidden flex flex-col"
      style={{
        width: '224px',
        backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
        border: 'none',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
        marginBottom: isExpanded ? '0px' : '10px',
      }}
    >
      <AnimatePresence initial={false}>
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute top-0 left-0 flex items-center justify-between px-2.5 py-1.5 w-full h-[40px]"
          >
            {QUICK_REACTIONS.slice(0, 5).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className="emoji-font text-base flex items-center justify-center active:scale-95 flex-shrink-0 cursor-pointer"
                style={{
                  lineHeight: 1,
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  userSelect: 'none',
                }}
              >
                {emoji}
              </button>
            ))}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 text-white/80"
              style={{ cursor: 'pointer' }}
            >
              <ChevronDown size={14} />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-col h-full w-full p-2 overflow-hidden"
          >
            {/* Верхняя строка поиска со встроенными категориями и кнопка свернуть */}
            <div className="flex items-center gap-1 mb-2 flex-shrink-0">
              <div className="relative flex-1 flex items-center bg-white/10 rounded-full px-2.5 py-1 border border-white/5">
                <Search size={14} className="text-white/40 mr-1.5 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-transparent border-none outline-none text-xs text-white placeholder:text-white/30"
                  style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 text-white/80"
                style={{ cursor: 'pointer' }}
              >
                <ChevronDown size={14} className="rotate-180" />
              </button>
            </div>

            {/* Быстрая легкая сетка БЕЗ текста надписей категорий ровно по ширине плашки */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-0.5 custom-chat-scrollbar">
              <div className="grid grid-cols-6 gap-1 justify-items-center">
                {allEmojisList.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    onClick={() => handleSelect(emoji.char)}
                    className="emoji-font flex items-center justify-center active:scale-95 cursor-pointer"
                    style={{ width: 31, height: 31, fontSize: '18px', border: 'none', background: 'none', padding: 0 }}
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const MessageContextMenu = ({
  menu,
  setMenu,
  onReply,
  onEdit,
  onPin,
  onDelete,
  isPinned,
  onCopy,
  onCopyImage,
  onSaveAs,
  onSelect,
  onSelectReaction,
}: {
  menu: ContextMenuState;
  setMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  isPinned: boolean;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onSaveAs?: () => void;
  onSelect: () => void;
  onSelectReaction?: (emoji: string) => void;
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [menuCardHeight, setMenuCardHeight] = useState(194);

  React.useLayoutEffect(() => {
    if (menuCardRef.current) {
      const h = menuCardRef.current.offsetHeight;
      if (h > 0) setMenuCardHeight(h);
    }
  }, [menu.visible, menu.isOwn, menu.type]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    if (menu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menu.visible, setMenu]);

  if (!menu.visible) return null;

  const close = () => setMenu((prev) => ({ ...prev, visible: false }));

  const iconColor = 'var(--text-main)';
  const baseBtnClass =
    'w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] font-normal normal-case transition-colors hover:bg-[var(--surface-container-strong)] rounded-none';
  const baseBtnStyle = { color: 'var(--text-main)' };

  const items: { label: string; onClick: () => void; icon: React.ReactNode }[] = [];

  items.push({
    label: t('common.reply'),
    onClick: onReply,
    icon: <CustomReplyIcon size={16} style={{ color: iconColor }} />,
  });

  if (menu.isOwn && menu.type === 'text') {
    items.push({
      label: t('common.edit'),
      onClick: onEdit,
      icon: <CustomEditIcon size={16} style={{ color: iconColor }} />,
    });
  }

  items.push({
    label: isPinned ? t('common.unpin') : t('common.pin'),
    onClick: onPin,
    icon: isPinned ? (
      <CustomUnpinIcon size={16} style={{ color: iconColor }} />
    ) : (
      <CustomPinIcon size={16} style={{ color: iconColor }} />
    ),
  });

  if (menu.type === 'text') {
    items.push({
      label: t('common.copy'),
      onClick: onCopy || close,
      icon: <Copy size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'singleImage') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
    items.push({
      label: t('chatWindow.copy_image'),
      onClick: onCopyImage || close,
      icon: <ImageIcon size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'multipleImages' || menu.type === 'file') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
  }

  items.push({
    label: t('common.delete'),
    onClick: onDelete,
    icon: <Trash size={16} style={{ color: iconColor }} />,
  });

  items.push({
    label: t('common.select'),
    onClick: onSelect,
    icon: <CheckCircle size={16} style={{ color: iconColor }} />,
  });

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[300] select-none"
      style={{
        left: menu.x,
        top: menu.y,
        transformOrigin: 'top left',
        width: '224px',
      }}
    >
      {/* 1. Плашка управления сообщением - СТАЦИОНАРНО на месте top: 50px (zIndex 1) */}
      <motion.div
        ref={menuCardRef}
        animate={{
          opacity: isExpanded ? 0 : 1,
          pointerEvents: isExpanded ? 'none' : 'auto',
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="backdrop-blur-xl select-none overflow-hidden py-1 shadow-2xl absolute top-[50px] left-0 z-[1]"
        style={{
          width: '224px',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          borderRadius: '8px',
          border: 'none',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
        }}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={() => {
              item.onClick();
              close();
            }}
            className={baseBtnClass}
            style={baseBtnStyle}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </motion.div>

      {/* 2. Плашка реакций - zIndex 2, плавно увеличивается вниз ровно до низа меню */}
      <div className="relative z-[2]">
        <QuickReactionHeader
          onSelectReaction={onSelectReaction}
          onCloseMenu={close}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          expandedHeight={50 + menuCardHeight}
        />
      </div>
    </motion.div>
  );
};

const clampMenuPosition = (
  x: number,
  y: number,
  menuWidth = 224,
  menuHeight = 280
) => {
  const { innerWidth, innerHeight } = window;
  let adjustedX = x;
  let adjustedY = y;

  const OFFSET_FROM_SIDE = 24;

  if (x + menuWidth > innerWidth - OFFSET_FROM_SIDE) adjustedX = innerWidth - menuWidth - OFFSET_FROM_SIDE;
  if (y + menuHeight > innerHeight - 16) adjustedY = innerHeight - menuHeight - 16;
  if (adjustedX < OFFSET_FROM_SIDE) adjustedX = OFFSET_FROM_SIDE;
  if (adjustedY < 16) adjustedY = 16;

  return { x: adjustedX, y: adjustedY };
};

const CallMessage = memo(
  ({
    msg,
    chatId,
    onCall,
    isOwn = false,
    customRadius,
  }: {
    msg: Message;
    chatId: string;
    onCall: (chatId: string) => void;
    isOwn?: boolean;
    customRadius?: string;
  }) => {
    const { t } = useTranslation();
    const bubbleRadius = useChatStore((state) => state.bubbleRadius);

    const parts = msg.text.split(', ');
    const directionPart = parts[0].replace(/^\[Call\]\s/, '');
    const durationStr = parts[1] || '';

    const isOutgoing = directionPart.includes(t('call.outgoing'));
    const status = msg.mediaName || 'completed';
    const displayStatus = status === 'busy' ? 'rejected' : status;

    const isValidDuration = (str: string): boolean => {
      if (!str) return false;
      const p = str.split(':');
      if (p.length !== 2) return false;
      const mins = parseInt(p[0], 10);
      const secs = parseInt(p[1], 10);
      return !isNaN(mins) && !isNaN(secs) && mins >= 0 && secs >= 0 && secs < 60;
    };

    const showDuration = displayStatus === 'completed' && isValidDuration(durationStr);

    let mainText = '';
    if (displayStatus === 'missed') {
      mainText = t('call.missed_call');
    } else if (displayStatus === 'rejected') {
      mainText = t('call.rejected_call');
    } else {
      mainText = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    }

    const timeStr = formatTimeOfDay(msg.time);

    let durationDisplay = '';
    if (showDuration) {
      const parts2 = durationStr.split(':');
      const mins = parseInt(parts2[0], 10);
      const secs = parseInt(parts2[1], 10);
      if (mins === 0) {
        durationDisplay = t('call.seconds', { count: secs });
      } else {
        durationDisplay = t('call.duration', { mins, secs });
      }
    }

    return (
      <div
        className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
        style={{
          backgroundColor: isOwn
            ? 'var(--chat-bubble-own-bg, #2c6bed)'
            : 'var(--chat-bubble-incoming-bg, var(--surface-container, rgba(255,255,255,0.05)))',
          borderRadius: customRadius || bubbleRadius,
          border: 'none',
          gap: '40px',
          minWidth: '220px',
          height: '56px',
          boxSizing: 'border-box',
        }}
        onClick={() => onCall(chatId)}
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate" style={{ color: isOwn ? '#ffffff' : 'var(--text-main)', fontSize: orbitFs(13) }}>
            {mainText}
          </span>
          <div className="text-xs truncate" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', fontSize: orbitFs(11) }}>
            {timeStr}
            {durationDisplay && `, ${durationDisplay}`}
          </div>
        </div>
        <div style={{ color: isOwn ? '#ffffff' : 'var(--accent-color)' }} className="flex-shrink-0 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 42 42" fill="currentColor">
            <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
          </svg>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.time === nextProps.msg.time &&
    prevProps.msg.text === nextProps.msg.text &&
    prevProps.msg.mediaName === nextProps.msg.mediaName &&
    prevProps.chatId === nextProps.chatId &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.customRadius === nextProps.customRadius
);

const SpoilerSpan: React.FC<{ content: string }> = ({ content }) => {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(!revealed);
      }}
      style={{
        filter: revealed ? 'none' : 'blur(4px)',
        backgroundColor: revealed ? 'transparent' : 'rgba(255, 255, 255, 0.2)',
        borderRadius: '3px',
        padding: '0 4px',
        cursor: 'pointer',
        transition: 'filter 0.2s ease, background-color 0.2s ease',
        userSelect: revealed ? 'text' : 'none',
      }}
      title={revealed ? '' : 'Нажмите, чтобы показать'}
    >
      {content}
    </span>
  );
};

function renderFormattedInlineText(
  rawText: string,
  themeColor: string,
  onLinkClick?: (url: string) => void
): React.ReactNode[] {
  const regex = /(\[(.*?)\]\(((?:https?:\/\/|ftp:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})[^\s)]*)\)|(?:https?:\/\/|ftp:\/\/)[^\s<>"'\)]+|\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s<>"'\)]*)?|\*\*(.*?)\*\*|<b>(.*?)<\/b>|\*(.*?)\*|<i>(.*?)<\/i>|<u>(.*?)<\/u>|~~(.*?)~~|<s>(.*?)<\/s>|`(.*?)`|\|\|(.*?)\|\||<spoiler>(.*?)<\/spoiler>)/gi;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      result.push(rawText.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const mdLinkLabel = match[2];
    const mdLinkUrl = match[3];
    const boldText = match[4] || match[5];
    const italicText = match[6] || match[7];
    const underlineText = match[8];
    const strikeText = match[9] || match[10];
    const codeText = match[11];
    const spoilerText = match[12] || match[13];

    if (mdLinkLabel && mdLinkUrl) {
      const targetUrl = mdLinkUrl.match(/^(https?:\/\/|ftp:\/\/)/i) ? mdLinkUrl : `http://${mdLinkUrl}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: themeColor, textDecoration: 'none', cursor: 'pointer' }}
        >
          {mdLinkLabel}
        </a>
      );
    } else if (
      fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ||
      fullMatch.match(/^\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})/i)
    ) {
      const targetUrl = fullMatch.match(/^(https?:\/\/|ftp:\/\/)/i) ? fullMatch : `http://${fullMatch}`;
      result.push(
        <a
          key={`link-${keyCounter++}`}
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onLinkClick) {
              onLinkClick(targetUrl);
            }
          }}
          style={{ color: themeColor, textDecoration: 'none', cursor: 'pointer' }}
        >
          {fullMatch}
        </a>
      );
    } else if (boldText !== undefined) {
      result.push(<strong key={`bold-${keyCounter++}`}>{boldText}</strong>);
    } else if (italicText !== undefined) {
      result.push(<em key={`italic-${keyCounter++}`}>{italicText}</em>);
    } else if (underlineText !== undefined) {
      result.push(<u key={`underline-${keyCounter++}`}>{underlineText}</u>);
    } else if (strikeText !== undefined) {
      result.push(<del key={`strike-${keyCounter++}`}>{strikeText}</del>);
    } else if (codeText !== undefined) {
      result.push(
        <code
          key={`code-${keyCounter++}`}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {codeText}
        </code>
      );
    } else if (spoilerText !== undefined) {
      result.push(<SpoilerSpan key={`spoiler-${keyCounter++}`} content={spoilerText} />);
    } else {
      result.push(fullMatch);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    result.push(rawText.substring(lastIndex));
  }

  return result;
}

const MessageText = ({
  text,
  timeNode,
  themeColor,
  isOwn = true,
  isPinned = false,
  onLinkClick,
}: {
  text: string;
  timeNode: React.ReactNode;
  themeColor: string;
  isOwn?: boolean;
  isPinned?: boolean;
  onLinkClick?: (url: string) => void;
}) => {
  const processedNodes = useMemo(() => {
    // Process blockquotes if lines start with >
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let inQuote = false;
    let quoteLines: string[] = [];

    lines.forEach((line, idx) => {
      if (line.startsWith('> ')) {
        inQuote = true;
        quoteLines.push(line.substring(2));
      } else {
        if (inQuote) {
          nodes.push(
            <blockquote
              key={`quote-${idx}`}
              style={{
                borderLeft: '3px solid var(--accent-color, #7C3AED)',
                paddingLeft: '8px',
                margin: '4px 0',
                opacity: 0.95,
              }}
            >
              {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick)}
            </blockquote>
          );
          quoteLines = [];
          inQuote = false;
        }
        nodes.push(
          <React.Fragment key={`line-${idx}`}>
            {renderFormattedInlineText(line, themeColor, onLinkClick)}
            {idx < lines.length - 1 && <br />}
          </React.Fragment>
        );
      }
    });

    if (inQuote && quoteLines.length > 0) {
      nodes.push(
        <blockquote
          key="quote-last"
          style={{
            borderLeft: '3px solid var(--accent-color, #7C3AED)',
            paddingLeft: '8px',
            margin: '4px 0',
            opacity: 0.95,
          }}
        >
          {renderFormattedInlineText(quoteLines.join('\n'), themeColor, onLinkClick)}
        </blockquote>
      );
    }

    return nodes;
  }, [text, themeColor, onLinkClick]);

  const spacerWidth = isOwn ? (isPinned ? '72px' : '60px') : (isPinned ? '52px' : '40px');

  return (
    <div
      className="select-text"
      style={{
        fontSize: 'inherit',
        lineHeight: 1.5,
        wordBreak: 'break-word',
        whiteSpace: 'pre-wrap',
        width: '100%',
        position: 'relative',
      }}
    >
      <span>
        {processedNodes}
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: spacerWidth,
            height: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </span>
      <span
        aria-hidden
        className="flex-shrink-0"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1,
          position: 'absolute',
          bottom: '0px',
          right: '0px',
          whiteSpace: 'nowrap',
        }}
      >
        {timeNode}
      </span>
    </div>
  );
};

const EncryptedMedia = memo(({
  url,
  type,
  sharedSecret,
  chatId,
  messageId,
  width: msgWidth,
  height: msgHeight,
  timeNode,
  isGif: isGifProp,
  onContextMenu,
  onClick,
}: {
  url: string;
  type: 'image' | 'video';
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  width?: number;
  height?: number;
  timeNode?: React.ReactNode;
  isGif?: boolean;
  onContextMenu?: (e: React.MouseEvent, blobUrl: string) => void;
  onClick?: () => void;
}) => {
  const { blobUrl } = useDecryptedMedia(url, sharedSecret, undefined, undefined, chatId, messageId);
  const bubbleRadius = useChatStore.getState().bubbleRadius;

  const isGif = useMemo(() => {
    if (isGifProp !== undefined) return isGifProp;
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('.gif') ||
      lower.includes('image/gif') ||
      lower.includes('giphy.com') ||
      lower.includes('tenor.com')
    );
  }, [isGifProp, url]);

  const aspectRatio = (msgWidth && msgHeight && msgHeight > 0) ? (msgWidth / msgHeight) : 1.333;
  const clampedAspect = Math.max(0.6, Math.min(2.0, aspectRatio));

  if (isGif) {
    return (
      <SmartGifPlayer
        blobUrl={blobUrl}
        width={msgWidth}
        height={msgHeight}
        clampedAspect={clampedAspect}
        bubbleRadius={bubbleRadius}
        timeNode={timeNode}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <div
      style={{
        width: 'min(440px, 100%)',
        maxWidth: '100%',
        aspectRatio: `${clampedAspect}`,
        maxHeight: '380px',
        borderRadius: bubbleRadius,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
        overflowAnchor: 'none',
      }}
    >
      {!blobUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <MD3CircularSpinner size="medium" color="var(--accent-color, #7C3AED)" />
        </div>
      )}

      {type === 'image' ? (
        <img
          src={blobUrl || undefined}
          alt=""
          className="w-full h-full object-cover cursor-pointer"
          draggable={false}
          style={{ userSelect: 'none', display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            if (blobUrl) onContextMenu?.(e, blobUrl);
          }}
        />
      ) : (
        <video
          controls={!!blobUrl}
          className="w-full h-full object-cover"
          preload="none"
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
        >
          {blobUrl && <source src={blobUrl} />}
        </video>
      )}

      {timeNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            borderRadius: '6px',
            padding: '2px 6px',
            color: '#ffffff',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            lineHeight: 1,
            zIndex: 2,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {timeNode}
        </div>
      )}
    </div>
  );
});

const FileMessage = memo(({ url, fileName, sharedSecret, chatId, messageId, timeNode, isOwn = false, customRadius }: { url: string; fileName?: string; sharedSecret: string | undefined; chatId?: string; messageId?: string; timeNode?: React.ReactNode; isOwn?: boolean; customRadius?: string }) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const { blobUrl, blob } = useDecryptedMedia(url, sharedSecret, fileName, undefined, chatId, messageId);
  const displayName = fileName || t('chatWindow.file');
  const ext = fileName?.split('.').pop()?.toUpperCase() || 'FILE';

  const fileSize = useMemo(() => {
    if (!blob) return null;
    const size = blob.size;
    if (!size || isNaN(size) || size === 0) return null;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }, [blob]);

  const handleOpenFile = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const fileBlob = await response.blob();
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (window.orbita && window.orbita.openFile) {
        await window.orbita.openFile(base64, displayName);
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = displayName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [blobUrl, displayName]);

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none"
      style={{
        borderRadius: customRadius || bubbleRadius,
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        border: 'none',
        padding: '8px 12px 8px 8px',
        position: 'relative',
        width: '260px',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={handleOpenFile}
    >
      <div className="flex items-start gap-2">
        <AudioCoverWithPlay
          cover={null}
          isPlayingTrack={false}
          size={48}
          onClick={handleOpenFile}
          state={!blobUrl ? 'download' : 'file'}
          isOwn={isOwn}
        />
        <div className="flex flex-col min-w-0 flex-1 gap-1 overflow-hidden" style={{ maxWidth: '100%' }}>
          <div
            className="font-semibold truncate"
            style={{
              fontSize: orbitFs(13),
              color: isOwn ? '#ffffff' : 'var(--text-main)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              overflowWrap: 'break-word',
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: orbitFs(11), color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)' }}>
            {fileSize || ext || t('chatWindow.document')}
          </div>
        </div>
      </div>

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
        {timeNode}
      </div>
    </div>
  );
});

const VoiceMessagePlayer = memo(({
  url,
  fileName,
  sharedSecret,
  mime,
  chatId,
  messageId,
  msg,
  timeNode,
  isOwn = false,
  customRadius,
}: {
  url: string;
  fileName?: string;
  sharedSecret: string | undefined;
  mime?: string;
  chatId?: string;
  messageId?: string;
  msg?: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  customRadius?: string;
}) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);

  const trackId = msg?.id || messageId || url;
  const isCurrentTrack = useAudioStore((state) => state.currentTrack?.id === trackId);
  const isGlobalPlaying = useAudioStore((state) => (isCurrentTrack ? state.isPlaying : false));
  const globalCurrentTime = useAudioStore((state) => (isCurrentTrack ? state.currentTime : 0));
  const globalDuration = useAudioStore((state) => (isCurrentTrack ? state.duration : 0));

  const playTrack = useAudioStore((state) => state.play);
  const pauseTrack = useAudioStore((state) => state.pause);
  const seekTrack = useAudioStore((state) => state.seek);
  const setStoreDuration = useAudioStore((state) => state.setDuration);

  const [localDuration, setLocalDuration] = useState<number>(msg?.duration || 0);
  const [isDragging, setIsDragging] = useState(false);

  const waveformRef = useRef<HTMLDivElement>(null);
  const { blobUrl } = useDecryptedMedia(url, sharedSecret, fileName, mime, chatId, messageId);

  // Lightweight duration calculation using HTMLAudioElement
  useEffect(() => {
    if (!blobUrl || (localDuration > 0 && isFinite(localDuration))) return;
    let isMounted = true;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = blobUrl;
    audio.onloadedmetadata = () => {
      if (isMounted && audio.duration && isFinite(audio.duration)) {
        setLocalDuration(audio.duration);
        if (isCurrentTrack && (!globalDuration || globalDuration === 0)) {
          setStoreDuration(audio.duration);
        }
      }
    };
    return () => {
      isMounted = false;
      audio.src = '';
    };
  }, [blobUrl, localDuration, isCurrentTrack, globalDuration, setStoreDuration]);

  useEffect(() => {
    if (msg?.duration && msg.duration > 0 && (!localDuration || localDuration === 0)) {
      setLocalDuration(msg.duration);
    }
  }, [msg?.duration, localDuration]);

  // Sync store duration if track is active
  useEffect(() => {
    if (isCurrentTrack && localDuration > 0 && (!globalDuration || globalDuration === 0)) {
      setStoreDuration(localDuration);
    }
  }, [isCurrentTrack, localDuration, globalDuration, setStoreDuration]);

  const effectiveDuration = isCurrentTrack && globalDuration > 0 ? globalDuration : localDuration;
  const effectiveCurrentTime = isCurrentTrack ? globalCurrentTime : 0;
  const isPlaying = isCurrentTrack && isGlobalPlaying;

  const handlePlayToggle = () => {
    if (isCurrentTrack) {
      if (isPlaying) {
        pauseTrack();
      } else {
        playTrack();
      }
    } else if (blobUrl) {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: sharedSecret || '',
        mediaType: 'voice',
        message: msg,
      });
    }
  };

  const BAR_COUNT = 36;
  const bars = useMemo(() => {
    if (msg?.waveform && msg.waveform.length > 0) {
      const src = msg.waveform;
      const step = src.length / BAR_COUNT;
      const res: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.min(src.length - 1, Math.floor(i * step));
        res.push(src[idx]);
      }
      return res;
    }
    const seed = (trackId || 'voice').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const val = Math.sin(seed + i * 0.7) * 40 + Math.cos(seed * 0.3 + i * 1.2) * 30 + 45;
      return Math.max(12, Math.min(100, Math.round(val)));
    });
  }, [msg?.waveform, trackId]);

  const [dragProgressRatio, setDragProgressRatio] = useState<number | null>(null);
  const dragStateRef = useRef<{ isDragging: boolean; targetTime: number; ratio: number }>({
    isDragging: false,
    targetTime: 0,
    ratio: 0,
  });
  const rafIdRef = useRef<number | null>(null);

  const updateSeekVisual = useCallback((clientX: number) => {
    if (!waveformRef.current || !effectiveDuration || effectiveDuration <= 0) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = offsetX / rect.width;
    const newTime = ratio * effectiveDuration;

    dragStateRef.current.ratio = ratio;
    dragStateRef.current.targetTime = newTime;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      setDragProgressRatio(ratio);
    });
  }, [effectiveDuration]);

  const commitSeek = useCallback(() => {
    if (!dragStateRef.current.isDragging) return;
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
    setDragProgressRatio(null);
    const newTime = dragStateRef.current.targetTime;

    if (isCurrentTrack) {
      seekTrack(newTime);
    } else {
      const voiceTitle = t('chatWindow.voice_message');
      const voiceArtist = msg?.sender || '';
      playTrack({
        id: trackId,
        chatId: chatId || msg?.id || '',
        title: voiceTitle,
        artist: voiceArtist,
        duration: effectiveDuration,
        cover: null,
        url,
        sharedSecret: sharedSecret || '',
        message: msg,
      });
      setTimeout(() => seekTrack(newTime), 50);
    }
  }, [effectiveDuration, isCurrentTrack, seekTrack, playTrack, trackId, chatId, msg, t, url, sharedSecret]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    dragStateRef.current.isDragging = true;
    setIsDragging(true);
    updateSeekVisual(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;
      updateSeekVisual(e.clientX);
    };
    const handleMouseUp = () => commitSeek();
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateSeekVisual, commitSeek]);

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!blobUrl) {
    return (
      <div
        className="inline-flex items-center gap-2 select-none"
        style={{
          background: isOwn
            ? 'var(--chat-bubble-own-bg, #2c6bed)'
            : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
          padding: '8px 12px 8px 8px',
          border: 'none',
          borderRadius: customRadius || bubbleRadius,
          width: '260px',
          height: '64px',
          boxSizing: 'border-box',
        }}
      >
        <MD3CircularSpinner size="small" color={isOwn ? '#ffffff' : 'var(--accent-color, #7C3AED)'} />
        <span style={{ fontSize: orbitFs(10), color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)' }}>{t('chatWindow.loading')}</span>
      </div>
    );
  }

  const isEnded = isCurrentTrack && effectiveDuration > 0 && (effectiveCurrentTime >= effectiveDuration - 0.05);
  const progressRatio = dragProgressRatio !== null ? dragProgressRatio : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
  const displayCurrentTime = dragProgressRatio !== null ? dragProgressRatio * effectiveDuration : effectiveCurrentTime;

  return (
    <div
      className="flex items-center gap-2.5 select-none flex-shrink-0"
      style={{
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        padding: '8px 12px 8px 8px',
        border: 'none',
        borderRadius: customRadius || bubbleRadius,
        width: '260px',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <AudioCoverWithPlay
        cover={null}
        isPlayingTrack={isPlaying}
        size={48}
        onClick={handlePlayToggle}
        isOwn={isOwn}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          className="flex items-center gap-[2px] cursor-pointer"
          style={{ height: '20px', padding: '1px 0' }}
        >
          {bars.map((h, idx) => {
            const barStart = idx / BAR_COUNT;
            const barEnd = (idx + 1) / BAR_COUNT;

            let fillRatio = 0;
            if (isEnded && effectiveCurrentTime > 0) {
              fillRatio = 1;
            } else if (effectiveCurrentTime <= 0) {
              fillRatio = 0;
            } else if (progressRatio >= barEnd) {
              fillRatio = 1;
            } else if (progressRatio <= barStart) {
              fillRatio = 0;
            } else {
              fillRatio = (progressRatio - barStart) * BAR_COUNT;
            }

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  maxWidth: '3px',
                  minWidth: '2px',
                  height: `${h}%`,
                  backgroundColor: fillRatio > 0
                    ? (isOwn
                        ? '#ffffff'
                        : `color-mix(in srgb, var(--accent-color, #7C3AED) ${Math.round(fillRatio * 100)}%, color-mix(in srgb, var(--text-main) 30%, transparent))`)
                    : (isOwn
                        ? 'rgba(255, 255, 255, 0.4)'
                        : 'color-mix(in srgb, var(--text-main) 30%, transparent)'),
                  borderRadius: '2px',
                  willChange: 'background-color',
                  transform: 'translateZ(0)',
                  transition: 'background-color 0.12s ease-out',
                }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between" style={{ fontSize: '10.5px', color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', marginTop: '1px' }}>
          <span className="tabular-nums">
            {isPlaying || displayCurrentTime > 0
              ? `${formatTime(displayCurrentTime)} / ${formatTime(effectiveDuration)}`
              : formatTime(effectiveDuration)}
          </span>
        </div>
      </div>

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
        {timeNode}
      </div>
    </div>
  );
});

interface ChatWindowProps {
  isMobileView?: boolean;
  onBack?: () => void;
}

export const ChatWindow = ({ isMobileView = false, onBack }: ChatWindowProps) => {
  const { t, i18n } = useTranslation();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const messages = useChatStore(useShallow((s) => {
    const chatId = activeChatId || '';
    return chatId ? s.messagesByChatId[chatId] || EMPTY_ARRAY : EMPTY_ARRAY;
  }));

  // Batch windowing pagination state (Telegram / Signal style) with responsive adaptive batching
  const [renderedCount, setRenderedCount] = useState<number>(getOptimalMessageBatchSize);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    decryptedUrlCache.clear();
    setRenderedCount(getOptimalMessageBatchSize());
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
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const voiceCallsEnabled = useChatStore((s) => s.voiceCallsEnabled);
  const typingIndicatorsEnabled = useChatStore((s) => s.typingIndicatorsEnabled);
  const readReceiptsEnabled = useChatStore((s) => s.readReceiptsEnabled);
  const myCode = useChatStore((s) => s.myCode);

  const [inputText, setInputText] = useState('');
  const [isDiscordFileLimitModalOpen, setIsDiscordFileLimitModalOpen] = useState(false);
  const [isSendAsTxtModalOpen, setIsSendAsTxtModalOpen] = useState(false);
  const [unsafeLinkData, setUnsafeLinkData] = useState<{ isOpen: boolean; url: string }>({ isOpen: false, url: '' });

  const emojiHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLinkClick = useCallback((url: string) => {
    const cleanUrl = url.trim();
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
  const [mediaViewerState, setMediaViewerState] = useState<{
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  }>({
    isOpen: false,
    initialIndex: 0,
  });

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const sharedSecret = useMemo(() => activeChat?.sharedSecret, [activeChat?.sharedSecret]);

  const chatMediaViewerItems = useMemo(() => {
    const list: MediaViewerItem[] = [];
    messages.forEach((msg, msgIdx) => {
      const media = parseMedia(msg);
      if (msg.mediaItems && msg.mediaItems.length > 0) {
        const isAlbum = msg.mediaItems.length > 1;
        const albumGroupId = msg.id || `album_${msgIdx}`;
        msg.mediaItems.forEach((mi, miIdx) => {
          if (mi.type === 'photo' || mi.type === 'video') {
            list.push({
              id: `${msg.id || msgIdx}_${miIdx}`,
              url: mi.url,
              type: mi.type === 'video' ? 'video' : 'photo',
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
              sharedSecret: mi.key || msg.mediaKey || sharedSecret,
            });
          }
        });
      } else if (media.type === 'image' || media.type === 'video') {
        const isGif = Boolean(
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
        list.push({
          id: msg.id || `${msg.time}_${msgIdx}`,
          url: media.url || msg.mediaUrl || '',
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
          sharedSecret: msg.mediaKey || sharedSecret,
        });
      }
    });
    return list;
  }, [messages, sharedSecret]);

  const openMediaViewer = useCallback((url: string, messageId?: string, customItems?: MediaViewerItem[]) => {
    const items = customItems || chatMediaViewerItems;
    const index = items.findIndex((it) => it.url === url || (messageId && it.messageId === messageId));
    setMediaViewerState({
      isOpen: true,
      initialIndex: index !== -1 ? index : 0,
      customItems: customItems || (index === -1 ? [{
        id: messageId || url,
        url,
        type: 'photo',
        time: Date.now(),
        key: messages.find(m => m.id === messageId)?.mediaKey,
        sharedSecret: messages.find(m => m.id === messageId)?.mediaKey || sharedSecret,
      }] : undefined),
    });
  }, [chatMediaViewerItems, messages, sharedSecret]);
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

  const unreadCount = useMemo(() => {
    if (!messages || messages.length === 0) return 0;
    return messages.filter((m) => !isMessageOutgoing(m, myCode, myNickname, activeChat) && !m.read).length;
  }, [messages, myCode, myNickname, activeChat]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const selection = useSelection();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
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

  // Auto-scroll on new message if user was at bottom or outgoing message
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const wasAdded = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (wasAdded) {
      const lastMsg = messages[messages.length - 1];
      const isOutgoing = lastMsg && isMessageOutgoing(lastMsg, myCode, myNickname, activeChat);
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 180;

      if (isOutgoing || isNearBottom) {
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [messages, myCode, myNickname, activeChat]);

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
    if (e.button === 1) {
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      return;
    }

    const target = e.target as HTMLElement | null;
    if (target) {
      const isInteractive = target.closest(
        'button, input, textarea, a, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], .emoji-picker, .modal, .custom-chat-scrollbar, .rich-editor, [contenteditable="true"]'
      );
      if (isInteractive) {
        return;
      }
    }

    e.preventDefault();

    if (document.activeElement !== inputRef.current) {
      inputRef.current?.focus();
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
        'button, input, textarea, a, select, option, audio, video, [role="button"], [role="menuitem"], [role="dialog"], .emoji-picker, .modal, .custom-chat-scrollbar, .rich-editor, [contenteditable="true"]'
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

    channelService.getChannelPosts(activeChatId).then((posts) => {
      if (posts) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          const fetchedIds = new Set(posts.map((p) => p.id));
          const existingIds = new Set<string>();

          const validExisting = currentMsgs.filter((m) =>
            !m.id || fetchedIds.has(m.id) || (m.isOutgoing && Date.now() - (m.time || 0) < 20000)
          );

          const updatedExisting = validExisting.map((m) => {
            const fetched = posts.find(
              (p) =>
                p.id === m.id ||
                (m.isOutgoing &&
                  m.sender === p.sender &&
                  ((p.text && m.text === p.text) || (p.mediaUrl && m.mediaUrl === p.mediaUrl) || (p.mediaName && m.mediaName === p.mediaName)) &&
                  Math.abs(m.time - (p.time || 0)) < 30000)
            );
            if (fetched) {
              existingIds.add(fetched.id);
              return {
                ...m,
                id: fetched.id,
                time: fetched.time || m.time,
                reactions: fetched.reactions || m.reactions,
              };
            }
            if (m.id) existingIds.add(m.id);
            return m;
          });

          const newItems: Message[] = [];
          posts.forEach((post) => {
            if (!existingIds.has(post.id)) {
              const isMine = myNickname ? post.sender === myNickname : false;
              newItems.push({
                id: post.id,
                sender: post.sender,
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
              });
            }
          });

          const merged = [...updatedExisting, ...newItems].sort((a, b) => a.time - b.time);
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: merged,
            },
          };
        });
      }
    });
  }, [activeChatId]);

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
      const rawPath = (file as any).path || '';
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

      if (fileType === 'photo') {
        preview = `data:${file.type || 'image/jpeg'};base64,${base64}`;
        try {
          const img = new Image();
          img.src = preview;
          await new Promise((r) => { img.onload = r; img.onerror = r; });
          if (img.width && img.height) {
            dimensions = { width: img.width, height: img.height };
          }
        } catch { }
      } else if (fileType === 'video') {
        preview = `data:${file.type || 'video/mp4'};base64,${base64}`;
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
  const lastDateCheckTimeRef = useRef<number>(0);

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
    const ro = new ResizeObserver(() => updateChatThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateChatThumb]);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    handleIsScrolling(true);
    triggerChatActive();

    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 60;
    if (atBottomRef.current !== isAtBottom) {
      atBottomRef.current = isAtBottom;
      setShowScrollDown(!isAtBottom);
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
    }, 1200);

    const now = performance.now();
    if (now - lastDateCheckTimeRef.current > 30) {
      lastDateCheckTimeRef.current = now;
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        if (!messagesContainerRef.current) return;
        const rect = messagesContainerRef.current.getBoundingClientRect();
        const y = rect.top + 50;
        const target =
          document.elementFromPoint(rect.left + rect.width / 2, y)?.closest('[data-datelabel]') ||
          document.elementFromPoint(rect.left + 40, y)?.closest('[data-datelabel]') ||
          document.elementFromPoint(rect.right - 40, y)?.closest('[data-datelabel]');
        const activeDate = target?.getAttribute('data-datelabel') || floatingDateRef.current;

        if (activeDate) {
          floatingDateRef.current = activeDate;
          setFloatingDate(activeDate);

          const allDividers = Array.from(messagesContainerRef.current.querySelectorAll('[data-date-divider]'));
          const currentDivider = allDividers.find((d) => d.getAttribute('data-date-divider') === activeDate);
          let isCurrentDividerVisible = false;
          if (currentDivider) {
            const divRect = currentDivider.getBoundingClientRect();
            if (divRect.bottom > rect.top + 6 && divRect.top < rect.bottom - 10) {
              isCurrentDividerVisible = true;
            }
          }

          if (isCurrentDividerVisible) {
            setShowFloatingDate(false);
            setFloatingDateOffsetY(0);
          } else {
            setShowFloatingDate(true);
            let pushOffsetY = 0;
            for (const div of allDividers) {
              if (div.getAttribute('data-date-divider') === activeDate) continue;
              const r = div.getBoundingClientRect();
              const distFromTop = r.top - rect.top;
              if (distFromTop > 0 && distFromTop < 42) {
                pushOffsetY = distFromTop - 42;
                break;
              }
            }
            setFloatingDateOffsetY(pushOffsetY);
          }
        }
      });
    }
  }, [handleIsScrolling, hasMoreAbove, loadMoreAbove, startIndex]);

  // Read receipts observer & focus/visibility sync (batched and stabilized)
  useEffect(() => {
    if (!readReceiptsEnabled || !activeChatId || activeChatId === 'notes') return;

    const notifyPeerReadBatch = (lastMsgId: string, lastTime: number, readIds?: string[]) => {
      try {
        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${activeChatId}`);
        const sendRead = () => channel.trigger('client-message', {
          type: 'read',
          messageId: lastMsgId,
          time: lastTime,
          sender: myNickname,
        });
        if (channel.subscribed) sendRead();
        else channel.bind('pusher:subscription_succeeded', sendRead);
      } catch {}

      sendEncryptedReadReceipt(activeChatId, readIds || [lastMsgId], lastTime);
    };

    const markUnreadInViewAsRead = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const state = useChatStore.getState();
      const currentMessages = state.messagesByChatId[activeChatId] || [];
      let hasChanges = false;
      let latestReadMsg: { id: string; time: number } | null = null;
      const readIds: string[] = [];

      const updatedMessages = currentMessages.map((m) => {
        if (!isMessageOutgoing(m, myCode, myNickname, activeChat) && !m.read) {
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
              if (msg && !isMessageOutgoing(msg, myCode, myNickname, activeChat) && !msg.read) {
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
  }, [activeChatId, readReceiptsEnabled, myCode, myNickname, activeChat]);

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
    linkPreviewPayload?: LinkPreviewData
  ) => {
    if (!activeChatId) return;

    if (activeChatId === 'notes') {
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
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      return;
    }

    if (activeChatId === 'system_orbitos') {
      const localMessage: Message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: myCode,
        sender: myNickname,
        isOutgoing: true,
        text: text,
        time: Date.now(),
        read: true,
        status: 'sent',
      };
      addMessage(activeChatId, localMessage);
      updateChat(activeChatId, { lastMsg: text });
      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));
      orbitosService.handleUserMessage(text, t);
      return;
    }

    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId);

    if (chat?.type === 'channel') {
      const isOwner = Boolean(chat.isOwner);
      if (!isOwner) return;

      const sentText = text;
      const sentMedia = mediaPayload;
      const sentPreview = linkPreviewPayload;

      setInputText('');
      setReplyingTo(null);
      requestAnimationFrame(() => scrollToBottom(false));

      const optimisticId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const optimisticMessage: Message = {
        id: optimisticId,
        senderId: myCode,
        sender: myNickname,
        isOutgoing: true,
        text: sentText,
        time: Date.now(),
        read: true,
        status: 'read',
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
      updateChat(activeChatId, { lastMsg: sentText || sentMedia?.name || 'Новый пост' });

      channelService.publishPost(
        activeChatId,
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
        optimisticId
      ).then((post) => {
        if (post && post.id !== optimisticId) {
          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[activeChatId] || [];
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [activeChatId]: currentMsgs.map((m) =>
                  m.id === optimisticId ? { ...m, id: post.id, time: post.time || m.time, status: 'read' as const } : m
                ),
              },
            };
          });
        }
      });
      return;
    }

    const pusher = getPusher();
    if (!chat) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
    setInputText('');
    setReplyingTo(null);

    requestAnimationFrame(() => {
      scrollToBottom(false);
    });

    (async () => {
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

        // Get fresh chat state to get latest ratchetState
        const freshChat = useChatStore.getState().chats.find(c => c.id === activeChatId);

        if (!freshChat?.ratchetState) {
          // E2EE session not yet established — save plaintext to non_messages until peer accepts handshake
          console.log('[ChatWindow] No ratchetState yet — saving to non_messages offline queue');
          const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
          if (activeChat?.type === 'private') {
            const plaintext = JSON.stringify(messageData);
            for (const recipientId of recipientTargets) {
              await supabaseService.saveNonMessage(
                activeChatId,
                myCode || myNickname,
                recipientId,
                plaintext,
                messageId,
              ).catch((err) => console.warn('[ChatWindow] non_messages save failed:', err));
            }
          }
          return;
        }

        const ratchet = DoubleRatchet.fromState(freshChat.ratchetState);

        if (!ratchet.canSend()) {
          console.warn('[ChatWindow] Ratchet canSend=false, skipping encrypt');
          return;
        }

        const plaintext = JSON.stringify(messageData);
        const { ciphertext, index, dhPublicKey } = await ratchet.encrypt(plaintext);

        updateChat(activeChatId, { ratchetState: ratchet.getState() });

        const payload = {
          ...(mediaPayload ? { mediaType: mediaPayload.type, mediaUrl: mediaPayload.url, mediaName: mediaPayload.name, mime: mediaPayload.mime } : {}),
          sender: myNickname,
          avatarUrl: myAvatarUrl || null,
          senderCode: myCode,
          senderId: myCode,
          ciphertext,
          type: 'message',
          index,
          dhPublicKey,
          messageId,
          chatId: activeChatId,
        };

        // 1. Instant real-time delivery via Ably WebSocket
        ablyService.sendMessage(activeChatId, payload).catch((err) => {
          console.warn('[ChatWindow] Ably send failed:', err);
        });

        // 2. Real-time delivery via Pusher WebSocket
        const channel = pusher.subscribe(`private-chat-${activeChatId}`);
        const doSendPusher = () => {
          try {
            channel.trigger('client-message', payload);
          } catch (err) {
            console.warn('[ChatWindow] Pusher trigger failed:', err);
          }
        };
        if (channel.subscribed) doSendPusher(); else channel.bind('pusher:subscription_succeeded', doSendPusher);

        const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
        if (activeChat?.type === 'private') {
          for (const recipientId of recipientTargets) {
            await supabaseService.sendOfflineMessage(
              activeChatId,
              myNickname,
              recipientId,
              ciphertext,
              index,
              dhPublicKey,
              messageId
            ).catch((err) => console.warn('[ChatWindow] Offline message dispatch failed:', err));
          }
        }
      } catch (err) {
        console.error('[ChatWindow] Failed to encrypt/send message:', err);
      }
    })();
  };

  const handleSendMessage = (overrideText?: string, linkPreview?: LinkPreviewData) => {
    const textToSend = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    if (!textToSend) return;
    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) clearDraft(activeChatId);
    setInputText('');
    stopTyping();
    if (replyingTo) {
      const cleanText = replyingTo.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
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
  };

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

    // Immediately update local store for instant UI save
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
        const { ciphertext, index: newIndex, dhPublicKey: editDhPublicKey } = await ratchet.encrypt(newText);
        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${activeChatId}`);
        const send = () => {
          channel.trigger('client-message', {
            sender: myNickname,
            text: ciphertext,
            type: 'edit',
            editIndex: index,
            index: newIndex,
            dhPublicKey: editDhPublicKey,
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
      text: '',
      type: 'delete-message',
      targetMessageId: targetMsgId,
      deleteIndex: index,
    };

    ablyService.sendMessage(activeChatId, payload).catch(() => {});

    const pusher = getPusher();
    const channel = pusher.subscribe(
      activeChat?.type === 'channel'
        ? `public-channel-${activeChatId}`
        : activeChat?.type === 'group'
        ? `presence-group-${activeChatId}`
        : `private-chat-${activeChatId}`
    );
    const send = () => {
      channel.trigger('client-message', payload);
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

    if (activeChat?.type === 'channel') {
      if (targetMsgId) {
        channelService.deletePost(activeChatId, targetMsgId);
      }
    } else if (targetMsgId) {
      const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
      for (const rId of recipientTargets) {
        supabaseService.deleteMessage(activeChatId, targetMsgId, rId, myCode).catch(() => {});
      }
    }

    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const triggerPinMessage = (index: number) => {
    if (!activeChatId || !sharedSecret) return;
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
    const channel = pusher.subscribe(`private-chat-${activeChatId}`);
    const send = () => {
      channel.trigger('client-message', { sender: myNickname, text: pinnedMsg.text, type: 'pin', pinData });
      updateChat(activeChatId, { pinnedMessage: pinData });
    };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const triggerUnpinMessage = () => {
    if (!activeChatId || !sharedSecret) return;
    if (activeChatId === 'notes') {
      updateChat(activeChatId, { pinnedMessage: null });
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }

    const pusher = getPusher();
    const channel = pusher.subscribe(`private-chat-${activeChatId}`);
    const send = () => { channel.trigger('client-message', { sender: myNickname, type: 'unpin', text: '' }); updateChat(activeChatId, { pinnedMessage: null }); };
    if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
  };

  const requestDeleteMessage = (index: number) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'delete_message',
      messageIndex: index,
    });
  };

  const requestDeleteSelected = () => {
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
    setContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'pin_message',
      messageIndex: index,
    });
  };

  const requestUnpinMessage = () => {
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

    // Toggle locally and get resulting action ('add' or 'remove') using only the unique msgId
    const action = setReaction(activeChatId, msgId, emoji, myNickname, 'toggle');

    setContextMenu(prev => ({ ...prev, visible: false }));

    if (activeChatId === 'notes') return;

    if (activeChat?.type === 'channel') {
      channelService.toggleReaction(activeChatId, msgId, emoji, myNickname, action);
      return;
    }

    const payload = {
      chatId: activeChatId,
      messageId: msgId,
      emoji,
      sender: myNickname,
      action,
    };

    // Save to Supabase DB for offline persistence
    supabaseService.saveReaction(activeChatId, undefined, msgId, emoji, myNickname, action);

    ablyService.sendMessage(activeChatId, {
      ...payload,
      type: 'reaction',
    });

    try {
      const pusher = getPusher();
      const channelName = activeChat?.type === 'group' ? `presence-group-${activeChatId}` : `private-chat-${activeChatId}`;
      const channel = pusher.subscribe(channelName);
      const send = () => {
        channel.trigger('client-message', {
          ...payload,
          type: 'reaction',
        });
      };
      if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
    } catch (err) {
      console.error('Failed to broadcast reaction:', err);
    }
  };

  useEffect(() => {
    if (!activeChatId || activeChatId === 'notes') return;

    // Sync persisted reactions from Supabase on chat open
    useChatStore.getState().syncReactionsFromSupabase(activeChatId);

    const ablyTopic = activeChat?.type === 'channel' ? `public-channel-${activeChatId}` : activeChatId;
    const unsubAbly = ablyService.subscribeToChatMessages(ablyTopic, (data: any) => {
      if (data?.type === 'channel-post' && data?.post) {
        const post = data.post;
        if (post && post.id) {
          const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
          if (!currentMsgs.some((m) => m.id === post.id)) {
            useChatStore.getState().addMessage(activeChatId, {
              id: post.id,
              sender: post.sender || post.senderNickname || 'Channel',
              text: post.text || '',
              time: post.time || Date.now(),
              read: true,
              status: 'sent',
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
        }
      } else if (data?.type === 'reaction-updated' && data?.postId && data?.reactions) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) =>
                m.id === data.postId ? { ...m, reactions: data.reactions } : m
              ),
            },
          };
        });
      } else if (data?.type === 'reaction' && data?.emoji && data?.sender) {
        if (data.sender === myNickname) return;
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
      }
    });

    const pusher = getPusher();
    const channelName = activeChat?.type === 'channel'
      ? `public-channel-${activeChatId}`
      : activeChat?.type === 'group'
      ? `presence-group-${activeChatId}`
      : `private-chat-${activeChatId}`;
    const channel = pusher.subscribe(channelName);

    const handleReaction = (data: { chatId?: string; messageIndex?: number; messageId?: string; id?: string; emoji?: string; sender?: string; action?: 'add' | 'remove' | 'toggle'; type?: string }) => {
      if (data.sender === myNickname) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(activeChatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    const handleClientMessage = (data: any) => {
      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sender === myNickname) return;
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

    const handleChannelPost = (post: any) => {
      if (!post || !post.id) return;
      const currentMsgs = useChatStore.getState().messagesByChatId[activeChatId] || [];
      if (!currentMsgs.some((m) => m.id === post.id)) {
        const sender = post.sender || post.senderNickname || 'Channel';
        const isMine = myNickname ? sender === myNickname : false;
        useChatStore.getState().addMessage(activeChatId, {
          id: post.id,
          sender,
          text: post.text || '',
          time: post.time || Date.now(),
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
    };

    const handleChannelReaction = (data: any) => {
      if (data?.postId && data?.reactions) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[activeChatId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [activeChatId]: currentMsgs.map((m) =>
                m.id === data.postId ? { ...m, reactions: data.reactions } : m
              ),
            },
          };
        });
      }
    };

    channel.bind('reaction', handleReaction);
    channel.bind('client-message', handleClientMessage);
    channel.bind('new-post', handleChannelPost);
    channel.bind('reaction-updated', handleChannelReaction);

    return () => {
      unsubAbly();
      channel.unbind('reaction', handleReaction);
      channel.unbind('client-message', handleClientMessage);
      channel.unbind('new-post', handleChannelPost);
      channel.unbind('reaction-updated', handleChannelReaction);
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
    const { x, y } = clampMenuPosition(e.clientX, e.clientY, 220, 260);
    const msg = messages[index];
    const type = getMessageMenuType(msg);
    const hasMultipleImages = msg.mediaItems ? msg.mediaItems.filter(item => item.type === 'photo').length > 1 : false;
    setContextMenu({ visible: true, x, y, messageIndex: index, messageId: msg?.id, isOwn, type, hasMultipleImages });
  };

  const handleReply = (index: number) => {
    const originalMessage = messages[index];
    const cleanText = originalMessage.text.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ').trim();
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
    if (!defaultName || (isGif && defaultName.endsWith('.gif'))) {
      if (isGif) {
        const titleMatch = msg.text?.match(/^\[GIF\]\s*https?:\/\/[^\s\/]+\/([^\/\?]+)/);
        const rawName = titleMatch ? titleMatch[1].replace(/[-_]giphy|[-_]tenor/gi, '') : 'animation';
        defaultName = `${rawName.replace(/\.(gif|mp4|webm)$/i, '') || 'animation'}.mp4`;
      } else if (media.type === 'image' || media.type === 'sticker') {
        defaultName = `photo_${Date.now()}.jpg`;
      } else if (media.type === 'video') {
        defaultName = `video_${Date.now()}.mp4`;
      } else if (media.type === 'voice') {
        defaultName = `voice_${Date.now()}.ogg`;
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
      ? [{ name: 'Voice (*.ogg *.mp3 *.wav *.m4a)', extensions: ['ogg', 'mp3', 'wav', 'm4a'] }, { name: 'All Files', extensions: ['*'] }]
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
    if (!sharedSecret || !isRatchetReady) return;
    try {
      await startAudioRecording();
    } catch (err) {
      showToast(t('chatWindow.mic_permission_error'));
    }
  }, [sharedSecret, isRatchetReady, startAudioRecording, showToast, t]);

  const handleStopRecordingAndSend = useCallback(async () => {
    const recorded = await stopAudioRecording();
    if (!recorded || !recorded.blob) return;

    const { blob, duration, waveform } = recorded;
    if (!sharedSecret || !activeChatId) return;

    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const voiceFileName = `voice_${Date.now()}.${ext}`;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const fileKey = generateEphemeralKey();
      const encryptedBlob = await encryptFile(arrayBuffer, fileKey);
      const encryptedBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(encryptedBlob);
      });

      const tempPath = await window.orbita.writeTempFile(encryptedBase64);
      if (!tempPath) {
        showToast(t('chatWindow.upload_failed'));
        return;
      }

      const publicId = `orbita_${Date.now()}`;
      const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
      window.orbita.deleteTempFile?.(tempPath);

      if (result.success && result.secure_url) {
        mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey, blob, blob.type || 'audio/webm;codecs=opus', activeChatId);
        await triggerMessage(`[Audio] ${voiceFileName}`, {
          type: 'voice',
          url: result.secure_url,
          key: fileKey,
          name: voiceFileName,
          mime: blob.type || 'audio/webm;codecs=opus',
          duration,
          waveform,
        });
      } else {
        showToast(t('chatWindow.upload_failed'));
      }
    } catch (error) {
      console.error('Failed to upload recorded audio:', error);
      showToast(t('chatWindow.upload_failed'));
    }
  }, [sharedSecret, activeChatId, stopAudioRecording, triggerMessage, showToast, t]);

  const getMediaDimensionsForFile = useCallback(async (
    filePath: string,
    fileType: AttachedFile['fileType']
  ): Promise<{ width?: number; height?: number; duration?: number }> => {
    if (fileType === 'photo') {
      const dataUrl = await window.orbita.readFileAsDataURL(filePath);
      if (!dataUrl) return {};
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = () => resolve({});
        img.src = dataUrl;
      });
    } else if (fileType === 'video') {
      const dataUrl = await window.orbita.readFileAsDataURL(filePath);
      if (!dataUrl) return {};
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.onloadedmetadata = () => {
          resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
        };
        video.onerror = () => resolve({});
        video.src = dataUrl;
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
          const dataUrl = await window.orbita.readFileAsDataURL(filePath);
          if (dataUrl) {
            preview = dataUrl;
            const binary = atob(dataUrl.split(',')[1] || '');
            const fileArrayBuffer = new ArrayBuffer(binary.length);
            const view = new Uint8Array(fileArrayBuffer);
            for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
            sizeMb = fileArrayBuffer.byteLength / (1024 * 1024);
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

        newFiles.push({
          filePath,
          preview,
          name: fileName,
          sizeMb,
          fileType,
          uploadedMb: 0,
          uploading: false,
          error: null,
          uploadedUrl: null,
          audioMetadata,
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
    if (isChannel) {
      if (!chat.isOwner) return;
    } else {
      if (!sharedSecret || !chat.ratchetState) return;
    }

    setIsSendingFiles(true);

    const uploadedFiles: Array<{
      url: string;
      key?: string;
      type: 'photo' | 'video' | 'audio' | 'file' | 'gif';
      name: string;
      mime?: string;
      audioMetadata?: AudioMetadata;
      size?: number;
      width?: number;
      height?: number;
      duration?: number;
    }> = [];

    const resolveItemType = (ft: string, fileName?: string) => {
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

    for (let i = 0; i < attachedFiles.length; i++) {
      const file = attachedFiles[i];
      if (file.uploadedUrl) {
        uploadedFiles.push({
          url: file.uploadedUrl,
          type: resolveItemType(file.fileType, file.name),
          name: file.name,
          mime: resolveMime(file.fileType, file.name),
          audioMetadata: file.audioMetadata,
          size: file.sizeMb ? file.sizeMb * 1024 * 1024 : file.audioMetadata?.size,
          width: file.width,
          height: file.height,
          duration: file.duration || file.audioMetadata?.duration,
        });
        continue;
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

        if (!fileArrayBuffer) {
          throw new Error('Failed to read file');
        }

        const cleanedBuffer = stripExifMetadata(fileArrayBuffer, file.fileType || file.name);
        let fileKey: string | undefined = undefined;
        let fileBase64: string;

        if (isChannel) {
          const uint8 = new Uint8Array(cleanedBuffer);
          let binary = '';
          const chunkSz = 8192;
          for (let j = 0; j < uint8.length; j += chunkSz) {
            binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(j, j + chunkSz)));
          }
          fileBase64 = btoa(binary);
        } else {
          fileKey = generateEphemeralKey();
          const encryptedBlob = await encryptFile(cleanedBuffer, fileKey);
          fileBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(encryptedBlob);
          });
        }

        const ext = (file.name?.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
        const tempPath = await window.orbita.writeTempFile(fileBase64, isChannel ? ext : undefined);
        if (!tempPath) throw new Error('Failed to write temp file');

        const publicId = `orbita_${Date.now()}_${i}`;
        setAttachedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: true } : f));

        const unsubProgress = window.orbita.onUploadProgress(({ publicId: pid, uploadedBytes }) => {
          if (pid !== publicId) return;
          setAttachedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploadedMb: uploadedBytes / (1024 * 1024) } : f));
        });

        const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
        unsubProgress();
        window.orbita.deleteTempFile?.(tempPath);

        if (!result.success || !result.secure_url) {
          throw new Error(result.error || 'Upload failed');
        }

        const itemMime = resolveMime(file.fileType, file.name);
        const localBlob = new Blob([cleanedBuffer], { type: itemMime });
        mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', localBlob, itemMime, activeChatId);

        uploadedFiles.push({
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
        });

        setAttachedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, uploading: false, uploadedUrl: result.secure_url } : f));
      } catch (err) {
        console.error('Upload error for file', file.name, err);
        setAttachedFiles(prev => prev.map((f, idx) => idx === i ? { ...f, error: (err as Error).message } : f));
        continue;
      }
    }

    if (uploadedFiles.length === 0) {
      setIsSendingFiles(false);
      return;
    }

    if (chat.type === 'channel') {
      const isOwner = Boolean(chat.isOwner);
      if (!isOwner) {
        setIsSendingFiles(false);
        return;
      }

      for (let fIdx = 0; fIdx < uploadedFiles.length; fIdx++) {
        const file = uploadedFiles[fIdx];
        const postCaption = fIdx === 0 ? (caption || '') : '';
        const optimisticId = `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const localMessage: Message = {
          id: optimisticId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: postCaption,
          time: Date.now(),
          read: true,
          status: 'sent',
          mediaType: file.type,
          mediaUrl: file.url,
          mediaName: file.name,
          mediaKey: file.key,
          mime: file.mime,
          audioMetadata: file.audioMetadata,
          width: file.width,
          height: file.height,
          duration: file.duration,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { lastMsg: postCaption || file.name || 'Новый медиа-пост' });

        channelService.publishPost(
          activeChatId,
          myNickname,
          postCaption,
          {
            type: file.type,
            url: file.url,
            name: file.name,
            mime: file.mime,
            duration: file.duration,
            width: file.width,
            height: file.height,
            audioMetadata: file.audioMetadata,
          },
          undefined,
          optimisticId
        ).then((post) => {
          if (post && post.id !== optimisticId) {
            useChatStore.setState((state) => {
              const currentMsgs = state.messagesByChatId[activeChatId] || [];
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: currentMsgs.map((m) =>
                    m.id === optimisticId ? { ...m, id: post.id, time: post.time || m.time } : m
                  ),
                },
              };
            });
          }
        });
      }

      setAttachedFiles([]);
      setIsAttachmentModalOpen(false);
      setIsSendingFiles(false);
      return;
    }

    if (!chat.ratchetState) {
      setIsSendingFiles(false);
      return;
    }

    const ratchet = DoubleRatchet.fromState(chat.ratchetState);

    const shouldGroup = group && uploadedFiles.length > 1;

    if (shouldGroup) {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const messageData = {
        id: messageId,
        senderId: myCode,
        text: caption || '',
        mediaItems: uploadedFiles.map(f => ({
          ...f,
          type: f.type,
          key: f.key,
          audioMetadata: f.audioMetadata ? {
            title: f.audioMetadata.title,
            artist: f.audioMetadata.artist,
            duration: f.audioMetadata.duration,
            size: f.audioMetadata.size,
          } : undefined,
        })),
      };
      const plaintext = JSON.stringify(messageData);
      const { ciphertext, index, dhPublicKey: groupDhPublicKey } = await ratchet.encrypt(plaintext);

      const localMessage: Message = {
        id: messageId,
        senderId: myCode,
        sender: myNickname,
        isOutgoing: true,
        text: caption || '',
        time: Date.now(),
        read: false,
        status: 'sent',
        encryptedText: ciphertext,
        index,
        mediaItems: uploadedFiles,
      };
      addMessage(activeChatId, localMessage);
      updateChat(activeChatId, { ratchetState: ratchet.getState() });

      const pusher = getPusher();
      const channel = pusher.subscribe(`private-chat-${activeChatId}`);
      const send = () => {
        channel.trigger('client-message', {
          type: 'message',
          ciphertext,
          index,
          dhPublicKey: groupDhPublicKey,
          messageId,
          chatId: activeChatId,
          sender: myNickname,
          senderCode: myCode,
          senderId: myCode,
        });
      };
      if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

      try {
        const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
        if (activeChat?.type === 'private') {
          for (const rId of recipientTargets) {
            await supabaseService.sendOfflineMessage(
              activeChatId, myNickname, rId, ciphertext, index, groupDhPublicKey, messageId
            );
          }
        }
      } catch (err) {
        console.error('Failed to save offline message:', err);
      }
    } else {
      for (const file of uploadedFiles) {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const networkAudioMetadata = file.audioMetadata ? {
          title: file.audioMetadata.title,
          artist: file.audioMetadata.artist,
          duration: file.audioMetadata.duration,
          size: file.audioMetadata.size,
        } : undefined;

        const messageData = {
          id: messageId,
          senderId: myCode,
          text: caption || '',
          mediaType: file.type,
          mediaUrl: file.url,
          mediaName: file.name,
          mediaKey: file.key,
          mime: file.mime,
          audioMetadata: networkAudioMetadata,
          width: file.width,
          height: file.height,
          duration: file.duration,
        };
        const plaintext = JSON.stringify(messageData);
        const { ciphertext, index, dhPublicKey: fileDhPublicKey } = await ratchet.encrypt(plaintext);

        const localMessage: Message = {
          id: messageId,
          senderId: myCode,
          sender: myNickname,
          isOutgoing: true,
          text: caption || '',
          time: Date.now(),
          read: false,
          status: 'sent',
          encryptedText: ciphertext,
          index,
          mediaType: file.type,
          mediaUrl: file.url,
          mediaName: file.name,
          mediaKey: file.key,
          mime: file.mime,
          audioMetadata: file.audioMetadata,
          width: file.width,
          height: file.height,
          duration: file.duration,
        };
        addMessage(activeChatId, localMessage);
        updateChat(activeChatId, { ratchetState: ratchet.getState() });

        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${activeChatId}`);
        const send = () => {
          channel.trigger('client-message', {
            type: 'message',
            ciphertext,
            index,
            dhPublicKey: fileDhPublicKey,
            messageId,
            chatId: activeChatId,
            sender: myNickname,
            senderCode: myCode,
            senderId: myCode,
          });
        };
        if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

        try {
          const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
          if (activeChat?.type === 'private') {
            for (const rId of recipientTargets) {
              await supabaseService.sendOfflineMessage(
                activeChatId, myNickname, rId, ciphertext, index, fileDhPublicKey, messageId
              );
            }
          }
        } catch (err) {
          console.error('Failed to save offline message:', err);
        }
      }
    }

    if (draftDebounceTimerRef.current) {
      clearTimeout(draftDebounceTimerRef.current);
      draftDebounceTimerRef.current = null;
    }
    if (activeChatId) clearDraft(activeChatId);
    setAttachedFiles([]);
    setIsAttachmentModalOpen(false);
    setIsSendingFiles(false);
    setInputText('');
  };

  const handleAddMoreFiles = () => {
    handleFilePick();
  };

  const timeBadge = useCallback((msg: Message, isPinned?: boolean) => {
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat);
    return (
      <span className="tabular-nums select-none" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)', fontSize: orbitFs(11), display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
        {isPinned && (
          <CustomPinIcon size={12} style={{ color: isOwn ? 'rgba(255, 255, 255, 0.95)' : 'var(--accent-color, #7C3AED)' }} className="flex-shrink-0" />
        )}
        {formatTime(msg.time)}
        {isOwn && msg.status && (
          <span style={{ display: 'inline-flex', width: '26px', minWidth: '26px', flexShrink: 0, justifyContent: 'flex-end' }}>
            <MessageStatus status={msg.status} isOwn={isOwn} />
          </span>
        )}
      </span>
    );
  }, [myCode, myNickname, activeChat]);

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
      document.execCommand('insertText', false, emoji);
      // Fallback in case execCommand doesn't trigger onInput (it should, but just in case)
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

    triggerMessage(`[Sticker] ${url}`, {
      type: 'sticker' as any,
      url: url,
      name: name,
      mime: 'image/webp',
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



  const renderMediaGroup = useCallback((msg: Message, index: number) => {
    const mediaItems = msg.mediaItems;
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

    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat);

    if (hasAudio && !hasPhotoOrVideo) {
      return (
        <GroupedAudioBubble
          items={mediaItems}
          sharedSecret={sharedSecret}
          msg={msg}
          timeNode={timeBadge(msg, isMessagePinned(index))}
          isOwn={isOwn}
        />
      );
    }

    if (hasPhotoOrVideo) {
      const viewerItems: MediaViewerItem[] = mediaItems.map((item, idx) => ({
        id: `${msg.id || 'msg'}_${idx}_${item.url}`,
        url: item.url,
        type: (item.type === 'video' || item.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(item.name || '')) ? 'video' : 'photo',
        fileName: item.name,
        mime: item.mime,
        key: item.key || msg.mediaKey,
        sharedSecret: item.key || msg.mediaKey || sharedSecret,
        duration: item.duration,
        sender: msg.sender,
        time: msg.time,
        messageId: msg.id,
      }));

      return (
        <TelegramAlbumGrid
          items={mediaItems}
          sharedSecret={sharedSecret}
          msg={msg}
          timeNode={timeBadge(msg, isMessagePinned(index))}
          onMediaClick={(tileIdx) => {
            const clicked = viewerItems[tileIdx];
            if (clicked) {
              openMediaViewer(clicked.url, msg.id, viewerItems);
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
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat);
    return (
      <MessageReactions
        reactions={msg.reactions}
        onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
        isOwn={isOwn}
        activeChatId={activeChatId || undefined}
        isSmallMessage={isShort}
      />
    );
  }, [myCode, myNickname, activeChat, activeChatId, triggerReactionMessage]);

  const renderMessage = useCallback((index: number, msg: Message) => {
    const isOwn = isMessageOutgoing(msg, myCode, myNickname, activeChat);
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

    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

    const prevIsOwn = prevMsg ? isMessageOutgoing(prevMsg, myCode, myNickname, activeChat) : false;
    const isPrevSameSenderGroup = !!(prevMsg && prevIsOwn === isOwn && Math.abs(msg.time - prevMsg.time) <= 15 * 60 * 1000);
    const nextIsOwn = nextMsg ? isMessageOutgoing(nextMsg, myCode, myNickname, activeChat) : false;
    const isNextSameSenderGroup = !!(nextMsg && nextIsOwn === isOwn && Math.abs(nextMsg.time - msg.time) <= 15 * 60 * 1000);

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
        className="flex justify-center items-center w-full my-2.5 select-none pointer-events-none"
      >
        <div
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
          }}
        >
          {dateLabel}
        </div>
      </div>
    ) : null;

    const renderContent = () => {
      const mediaItems = msg.mediaItems;
    if (mediaItems && mediaItems.length > 0) {
      return (
        <div style={{ ...highlightWrapperStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
                  padding: 0,
                  overflow: 'hidden',
                  width: 'fit-content',
                  maxWidth: 'min(440px, 75%)',
                  boxSizing: 'border-box',
                })}
              >
                {renderMediaGroup(msg, index)}
              </div>
              {renderReactionBadges(msg, index)}
            </div>
          </div>
        </div>
      );
    }

    if (!media.type) {
      const isPinned = isMessagePinned(index);
      return (
        <div style={{ ...highlightWrapperStyle }} data-datelabel={getDateLabel(msg.time)}>
          <MessageItem
            msg={msg}
            isOwn={isOwn}
            isPinned={isPinned}
            onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
            themeColor={themeColor}
            bubbleRadius={customRadius}
            currentUserId={myNickname}
            onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
            onQuoteClick={(q) => handleQuoteClick(q, index)}
            isGroup={activeChat?.type === 'group'}
            onLinkClick={handleLinkClick}
          />
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
        <div style={{ ...highlightWrapperStyle }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
                  <span>
                    {mainText}
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: spacerWidth,
                        height: 1,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    />
                  </span>
                  <span
                    aria-hidden
                    className="flex-shrink-0"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      pointerEvents: 'none',
                      userSelect: 'none',
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
        </div>
      );
    }

    return (
      <div style={{ ...highlightWrapperStyle }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
                className="relative w-fit flex flex-col items-end group select-none"
                style={{ padding: '2px', overflowAnchor: 'none' }}
                onClick={(e) => handleMessageClick(e, msg.id!)}
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
              >
                <div className="relative w-[180px] h-[180px] max-w-[min(180px,70vw)] max-h-[min(180px,70vw)] flex items-center justify-center">
                  <img
                    src={media.url!}
                    alt=""
                    className="w-full h-full object-contain select-none cursor-pointer"
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    loading="lazy"
                  />
                  <div
                    className="absolute bottom-0.5 right-0.5 select-none tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150"
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
                    }}
                  >
                    <span>{formatTimeOfDay(msg.time)}</span>
                    {isOwn && msg.status && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '5px', transform: 'translateY(-1.5px)', flexShrink: 0 }}>
                        <MessageStatus status={msg.status} isOwn={isOwn} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {media.type === 'image' && (
              <div
                className="max-w-[min(440px, 75%)] w-fit relative rounded-xl overflow-hidden shadow-lg cursor-pointer"
                style={{ border: 'none', maxWidth: 'min(440px, 75%)', width: 'fit-content', borderRadius: bubbleRadius }}
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
                  timeNode={!(msg.text?.trim() && msg.text.trim().replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*https?:\/\/[^\s]+$/i, '').trim()) ? timeBadge(msg, isMessagePinned(index)) : undefined}
                  onClick={() => openMediaViewer(media.url!, msg.id)}
                  onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, index, isOwn)}
                />
              </div>
            )}

            {media.type === 'video' && (
              <div
                className="max-w-[min(440px, 75%)] w-fit relative rounded-xl overflow-hidden shadow-lg cursor-pointer"
                style={{ border: 'none', maxWidth: 'min(440px, 75%)', width: 'fit-content', borderRadius: bubbleRadius }}
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
                sharedSecret={msg.mediaKey || sharedSecret}
                bubbleRadius={customRadius}
                onContextMenu={(e) => handleContextMenu(e, index, isOwn)}
                timeNode={timeBadge(msg, isMessagePinned(index))}
                isOwn={isOwn}
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
      className="flex flex-col h-full bg-transparent select-none overflow-hidden min-h-0 relative"
      onMouseDown={handleChatWindowMouseDown}
      onClick={handleChatWindowClick}
      onContextMenu={(e) => e.preventDefault()}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDropFiles}
    >
      <div
        ref={headerRef}
        className="sticky top-0 z-20 w-full"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderBottom: 'none',
        }}
      >
        <header
          className="flex justify-center w-full"
          style={{
            padding: '10px 16px',
          }}
        >
          <div
            className="flex items-center justify-between w-full"
            style={{
              maxWidth: '100%',
              borderRadius: 0,
              backgroundColor: 'transparent',
              padding: '0',
            }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0" onClick={() => setActiveProfileChatId(activeChatId)} style={{ cursor: 'pointer' }}>
              {isMobileView && onBack && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBack(); }}
                  aria-label={t('chatWindow.back')}
                  className="flex h-9 w-9 items-center justify-center text-[var(--text-main)] transition-opacity hover:opacity-80"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              {isMobileView && (
                activeChatId === 'notes' ? (
                  <NotesAvatar className="w-10 h-10" />
                ) : activeChat?.type === 'bot' ? (
                  <BotAvatar className="w-10 h-10" />
                ) : (
                  <Avatar src={activeChat?.avatarUrl} alt={activeChat?.name} className="w-10 h-10 rounded-full flex-shrink-0" />
                )
              )}
              <div className="flex flex-col min-w-0 flex-1" style={{ gap: 0 }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {activeChat?.type === 'channel' && (
                    <ChannelMegaphoneIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                  )}
                  <h2 className="font-bold text-[14px] truncate" style={{ color: 'var(--text-main)' }}>
                    {activeChatId === 'notes' ? t('connectModal.notes') : activeChat?.name}
                  </h2>
                  <DeveloperBadge
                    userId={activeChat?.peerCode || (activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined) || (activeChat?.type === 'private' ? (activeChatId ?? undefined) : undefined)}
                    nickname={activeChat?.name}
                    size={20}
                  />
                  {activeChat?.type === 'channel' && activeChat.isOfficial && (
                    <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold uppercase tracking-wider flex-shrink-0">
                      {t('channel.official')}
                    </span>
                  )}
                </div>
                <div>
                  {activeChatId === 'notes' ? null : activeChat?.type === 'channel' ? (
                    <span className="text-[11px] font-medium text-[var(--text-dim)]">
                      {activeChat.subscribersCount
                        ? `${activeChat.subscribersCount.toLocaleString('ru-RU')} ${(() => { const n = activeChat.subscribersCount || 0; const m10 = n % 10; const m100 = n % 100; if (m10 === 1 && m100 !== 11) return 'подписчик'; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'подписчика'; return 'подписчиков'; })()}`
                        : t('channel.subscribers_none', 'подписчиков пока нет')}
                    </span>
                  ) : activeChat?.type === 'bot' ? (
                    <span className="text-[11px] font-medium text-[var(--accent-color)]">
                      {t('orbitos.badge', 'БОТ')}
                    </span>
                  ) : !isServerConnected ? (
                    <span className="text-[11px] font-semibold text-[var(--accent-color)] animate-pulse">
                      {t('common.connecting') || 'соединение...'}
                    </span>
                  ) : (
                    <span
                      className="text-[11.5px] font-normal"
                      style={{
                        color: isOnline ? 'var(--accent-color)' : 'var(--text-dim)',
                        textShadow: isOnline ? '0 0 1.5px color-mix(in srgb, var(--accent-color) 30%, transparent)' : 'none',
                      }}
                    >
                      {otherUserTyping && activeChatId !== 'notes' ? (
                        <span className="text-[11.5px] font-semibold" style={{ color: 'var(--accent-color)' }}>
                          {t('chatWindow.typing')}
                        </span>
                      ) : (
                        isOnline ? t('chatWindow.online') : (activeChat?.lastSeen ? formatLastSeen(activeChat.lastSeen, t) : t('chatWindow.offline'))
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  useChatStore.getState().openInChatSearch('this_chat');
                }}
                aria-label={t('common.search', 'Поиск')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M21.71 20.29L18 16.61A9 9 0 1 0 16.61 18l3.68 3.68a1 1 0 0 0 1.42 0a1 1 0 0 0 0-1.39M11 18a7 7 0 1 1 7-7a7 7 0 0 1-7 7" />
                </svg>
              </button>
              {activeChatId !== 'notes' && activeChat?.type !== 'channel' && voiceCallsEnabled && (
                <button
                  className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); handleAudioCallPress(); }}
                  aria-label={t('call.call', 'Позвонить')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                    <g fill="none">
                      <path fill="currentColor" d="M20 16v4c-2.758 0-5.07-.495-7-1.325-3.841-1.652-6.176-4.63-7.5-7.675C4.4 8.472 4 5.898 4 4h4l1 4l-3.5 3c1.324 3.045 3.659 6.023 7.5 7.675L16 15z" />
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 18.675c1.93.83 4.242 1.325 7 1.325v-4l-4-1zm0 0C9.159 17.023 6.824 14.045 5.5 11m0 0C4.4 8.472 4 5.898 4 4h4l1 4z" />
                    </g>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>
      </div>

      {selection.isSelectionMode && (
        <SelectionPanel
          selectedCount={selection.selectedIds.size}
          onDelete={requestDeleteSelected}
          onCancel={selection.exitSelectionMode}
          height={headerHeight}
        />
      )}

      {/* Removed old top floating date location */}

      {pinnedMessage && (
        <div
          onClick={scrollToPinnedMessage}
          className="flex-shrink-0 flex items-center justify-between cursor-pointer transition-colors select-none"
          style={{
            backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
            gap: '12px',
          }}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div style={{ width: '2px', height: '32px', backgroundColor: 'var(--accent-color)', borderRadius: '1px', flexShrink: 0 }} />
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-semibold truncate" style={{ color: 'var(--accent-color)', fontSize: '13px', lineHeight: '1.2' }}>
                {t('chatWindow.pinned_message')}
              </span>
              <span
                className="truncate mt-0.5"
                style={{ color: 'var(--text-main)', fontSize: '13px', lineHeight: '1.3' }}
                dangerouslySetInnerHTML={{
                  __html: markdownToHtml(
                    formatPreviewText(
                      parseReplyChain(pinnedMessage.text || '').body.trim() || pinnedMessage.text,
                      t
                    ),
                    'var(--accent-color)'
                  ).replace(/<br\s*\/?>/gi, ' ')
                }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName.toLowerCase() === 'a') {
                    e.preventDefault();
                    e.stopPropagation();
                    const url = target.getAttribute('href');
                    if (url) handleLinkClick(url);
                  }
                }}
              />
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              requestUnpinMessage();
            }}
            className="p-1.5 rounded-full text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      )}

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
              className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none select-none"
              style={{ top: '12px' }}
            >
              <div
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
          className="chat-list-scrollbar flex-1 min-h-0 overflow-y-scroll overflow-x-hidden flex flex-col select-text"
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
            <EmptyChatGreeting
              onSendGreeting={() => triggerMessage('👋')}
              isInitiator={activeChat?.isChatInitiator}
              isPeerOnline={activeChat?.online}
              isRatchetReady={Boolean(activeChat?.ratchetState)}
            />
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

      {activeChat?.type === 'channel' && !activeChat.isOwner ? null : (
        <MessageInput
          inputText={inputText}
          setInputText={handleSetInputText}
          editingIndex={editingIndex}
          editingOriginalText={editingIndex !== null && messages[editingIndex] ? messages[editingIndex].text : ''}
          onCancelEdit={() => {
            setEditingIndex(null);
            setEditText('');
          }}
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
          onOpenTxtModal={() => setIsSendAsTxtModalOpen(true)}
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
            onGoToMessage={(msgId) => {
              const el = document.querySelector(`[data-message-id="${msgId}"]`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const idx = messages.findIndex((m) => m.id === msgId);
                if (idx !== -1) {
                  setHighlightedIndex(idx);
                  setTimeout(() => setHighlightedIndex(null), 2000);
                }
              }
            }}
            onForwardMessage={(msgId) => {
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
            }}
            onDeleteMessage={(msgId) => {
              if (activeChatId) {
                useChatStore.getState().deleteMessage(activeChatId, msgId);
                const payload = {
                  sender: myNickname,
                  text: '',
                  type: 'delete-message',
                  targetMessageId: msgId,
                };
                ablyService.sendMessage(activeChatId, payload).catch(() => {});
                const pusher = getPusher();
                const channel = pusher.subscribe(
                  activeChat?.type === 'channel'
                    ? `public-channel-${activeChatId}`
                    : activeChat?.type === 'group'
                    ? `presence-group-${activeChatId}`
                    : `private-chat-${activeChatId}`
                );
                const send = () => {
                  channel.trigger('client-message', payload);
                };
                if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);
                if (activeChat?.type === 'channel') {
                  channelService.deletePost(activeChatId, msgId);
                } else {
                  const recipientTargets = Array.from(new Set([activeChat?.peerCode, activeChat?.name].filter(Boolean))) as string[];
                  for (const rId of recipientTargets) {
                    supabaseService.deleteMessage(activeChatId, msgId, rId, myCode).catch(() => {});
                  }
                }
              }
            }}
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
          onRemoveFile={(idx) => {
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
            />
          </AnimatePresence>,
          document.body
        )
      }

      <style>{`
        :focus-within { outline: none; }
        .select-text::selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
        .select-text::-moz-selection { background-color: var(--selection-bg, rgba(124,58,237,0.3)); color: var(--text-main, #ffffff); }
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

      {unsafeLinkData.isOpen && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }}
            onClick={() => setUnsafeLinkData({ isOpen: false, url: '' })}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-full max-w-[360px] rounded-[8px] p-5 shadow-2xl overflow-hidden"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-left">
                <h3
                  className="text-[15px] font-semibold leading-snug"
                  style={{ color: 'var(--text-main, #ffffff)' }}
                >
                  {t('confirmModal.open_link_title', 'Вы уверены, что хотите открыть эту ссылку в браузере?')}
                </h3>
                <div
                  className="text-[13px] mt-3 font-mono break-all p-2.5 rounded border"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'var(--accent-color, #7C3AED)',
                  }}
                >
                  {unsafeLinkData.url}
                </div>
              </div>

              <div className="flex justify-end items-center gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setUnsafeLinkData({ isOpen: false, url: '' })}
                  className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--accent-color, #7C3AED)',
                  }}
                  onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('common.cancel')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetUrl = unsafeLinkData.url;
                    setUnsafeLinkData({ isOpen: false, url: '' });
                    if (window.orbita?.openExternal) {
                      window.orbita.openExternal(targetUrl);
                    } else {
                      window.open(targetUrl, '_blank');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--accent-color, #7C3AED)',
                  }}
                  onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {t('common.open')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};