import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
  X, File, ArrowLeft,
  Copy, Image as ImageIcon, Download as DownloadIcon,
  CheckCircle, Trash, ChevronDown, Search, Phone, UserPlus
} from 'lucide-react';
import { GroupEmptyCard } from './GroupEmptyCard';
import { AddGroupMemberModal } from './AddGroupMemberModal';
import { useChatStore, type Message, type MediaItem, type LinkPreviewData, isMessageOutgoing } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { DeveloperBadge } from '../ui/DeveloperBadge';
import { getPusher, getGroupPusher, CLIENT_SESSION_ID } from '../../utils/pusher';
import { ablyService } from '../../services/ablyService';
import { MessageStatus } from '../MessageStatus';
import { DoubleRatchet } from '../../lib/double-ratchet';
import { deriveChannelKey, decryptMessage, encryptMessage } from '../../lib/crypto';
import { isValidGroupCode, deriveGroupKey, extractGroupCode } from '../../lib/groupCrypto';
import { useTranslation } from 'react-i18next';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { useCallStore } from '../../store/useCallStore';
import { useConnectionStore } from '../../store/useConnectionStore';
import { supabaseService } from '../../services/supabaseService';
import { AttachedFile } from './FileAttachmentModal';
import { Avatar } from '../common/Avatar';
import { ActiveCallBar } from '../call/ActiveCallBar';
import { NotesAvatar } from '../common/NotesAvatar';
import {
  isEmojiOnly,
  EMOJI_CATEGORIES,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';
import { useDecryptedMedia, getOrbitaMediaUrl } from '../../lib/media-utils';
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
import { GroupUsersIcon } from '../common/GroupUsersIcon';
import { groupService } from '../../services/groupService';
import { BotIcon } from '../common/BotIcon';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useAudioStore } from '../../store/useAudioStore';
import { appVisibility } from '../../utils/appVisibility';
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
import { VerifiedBadge } from '../common/VerifiedBadge';
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

const parseMedia = (msg: Message): { type: 'image' | 'video' | 'audio' | 'music' | 'voice' | 'file' | 'call' | 'sticker' | null; url: string | null; fileName?: string; mime?: string; size?: number } => {
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
    if (msg.mediaType === 'gif') return { type: 'video', url: msg.mediaUrl || null, fileName: msg.mediaName || 'animation.mp4', mime: msg.mime || 'video/mp4' };
  }

  const text = msg.text || '';
  const stickerMatch = text.match(/^\[Sticker\]\s*(\S+.*)$/i);
  if (stickerMatch) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || stickerMatch[1].trim()), fileName: msg.mediaName, mime: msg.mime || (stickerMatch[1].trim().endsWith('.tgs') ? 'application/x-tgsticker' : 'image/webp') };
  const stickerMatchGeneric = text.match(/^\[Sticker\]/i);
  if (stickerMatchGeneric) return { type: 'sticker', url: resolveStickerUrl(msg.mediaUrl || null), fileName: msg.mediaName, mime: msg.mime || 'image/webp' };

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
  expandedHeight = 230,
}: {
  onSelectReaction?: (emoji: string) => void;
  onCloseMenu: () => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  expandedHeight?: number;
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(96);
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
    if (!isExpanded) {
      setDisplayLimit(96);
      setSearchQuery('');
    } else if (searchInputRef.current) {
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

  const displayedEmojis = useMemo(() => {
    if (searchQuery.trim()) return allEmojisList;
    return allEmojisList.slice(0, displayLimit);
  }, [allEmojisList, searchQuery, displayLimit]);

  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setDisplayLimit((prev) => Math.min(allEmojisList.length, prev + 60));
    }
  }, [allEmojisList.length]);

  return (
    <motion.div
      initial={false}
      animate={{
        height: isExpanded ? expandedHeight : 40,
        borderRadius: '8px',
      }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative backdrop-blur-xl select-none overflow-hidden flex flex-col"
      style={{
        width: '224px',
        backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
        border: 'none',
        boxShadow: 'none',
        marginBottom: isExpanded ? '0px' : '10px',
        willChange: 'height',
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
              aria-label={t('common.expand', 'Развернуть')}
              className="w-7 h-7 rounded-full active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
              style={{
                cursor: 'pointer',
                backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                color: 'var(--text-main, #ffffff)',
                border: 'none',
              }}
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
            <div className="flex items-center gap-1 mb-2 flex-shrink-0">
              <div
                className="relative flex-1 flex items-center rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                  border: '1px solid var(--border-color, rgba(128,128,128,0.2))',
                }}
              >
                <Search size={14} style={{ color: 'var(--text-dim, #8e8e93)' }} className="mr-1.5 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-transparent border-none outline-none text-xs"
                  style={{
                    color: 'var(--text-main)',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                aria-label={t('common.collapse', 'Свернуть')}
                className="w-7 h-7 rounded-full active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
                style={{
                  cursor: 'pointer',
                  backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                  color: 'var(--text-main, #ffffff)',
                  border: 'none',
                }}
              >
                <ChevronDown size={14} className="rotate-180" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-0.5 custom-chat-scrollbar"
              onScroll={handleGridScroll}
            >
              <div className="grid grid-cols-6 gap-1 justify-items-center">
                {displayedEmojis.map((emoji) => (
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
  canManageMessages,
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
  canManageMessages?: boolean;
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

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

  if (canManageMessages !== false) {
    items.push({
      label: t('common.reply'),
      onClick: onReply,
      icon: <CustomReplyIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false && menu.isOwn && menu.type === 'text') {
    items.push({
      label: t('common.edit'),
      onClick: onEdit,
      icon: <CustomEditIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: isPinned ? t('common.unpin') : t('common.pin'),
      onClick: onPin,
      icon: isPinned ? (
        <CustomUnpinIcon size={16} style={{ color: iconColor }} />
      ) : (
        <CustomPinIcon size={16} style={{ color: iconColor }} />
      ),
    });
  }

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

  if (canManageMessages !== false) {
    items.push({
      label: t('common.delete'),
      onClick: onDelete,
      icon: <Trash size={16} style={{ color: iconColor }} />,
    });
  }

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
      <motion.div
        ref={menuCardRef}
        animate={{
          opacity: isExpanded ? 0 : 1,
          pointerEvents: isExpanded ? 'none' : 'auto',
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="backdrop-blur-xl select-none overflow-hidden py-1 absolute top-[50px] left-0 z-[1]"
        style={{
          width: '224px',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          borderRadius: '8px',
          border: 'none',
          boxShadow: 'none',
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

      <div className="relative z-[2]">
        <QuickReactionHeader
          onSelectReaction={onSelectReaction}
          onCloseMenu={close}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          expandedHeight={230}
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

    const isOutgoing = isOwn || directionPart.toLowerCase().includes('исходящ') || directionPart.toLowerCase().includes('outgoing');
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
  const { t } = useTranslation();
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
      aria-label={revealed ? undefined : t('chatWindow.clickToShowSpoiler')}
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
      <span className="selectable-message-text" style={{ userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
        {processedNodes}
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
  isOwn = false,
  fileSize,
  blurPreview,
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
  isOwn?: boolean;
  fileSize?: number;
  blurPreview?: string;
}) => {
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia(type === 'image' ? 'photo' : 'video', fileSize, isOwn));
  const { blobUrl, load, isLoading, progress, isUnavailable } = useDecryptedMedia(url, sharedSecret, undefined, undefined, chatId, messageId, autoLoad);
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

  const initialWidth = (msgWidth && msgHeight && msgHeight > 0)
    ? (clampedAspect < 1 ? Math.min(440, Math.round(380 * clampedAspect)) : Math.min(440, msgWidth))
    : 440;

  return (
    <div
      style={{
        width: `${initialWidth}px`,
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
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-10 select-none ${isUnavailable ? 'pointer-events-none' : 'cursor-pointer'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isLoading && !isUnavailable) load();
          }}
        >
          {blurPreview ? (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${blurPreview})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(16px)',
                transform: 'scale(1.15)',
              }}
            />
          ) : (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.22), transparent 70%), radial-gradient(circle at 70% 70%, rgba(59, 130, 246, 0.18), transparent 70%), rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(20px)',
              }}
            />
          )}
          {!isUnavailable && (
            <div className="relative z-10 flex flex-col items-center gap-1.5 pointer-events-auto">
              <AudioCoverWithPlay
                cover={null}
                size={48}
                state={isLoading ? 'downloading' : 'download'}
                progress={isLoading ? progress : undefined}
                onClick={() => { if (!isLoading) load(); }}
                ariaLabel={isLoading ? 'Cancel download' : 'Download media'}
              />
              {fileSize && fileSize > 0 && !isLoading && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          )}
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

const FileMessage = memo(({ url, fileName, sharedSecret, chatId, messageId, size: initialSize, timeNode, isOwn = false, customRadius }: { url: string; fileName?: string; sharedSecret: string | undefined; chatId?: string; messageId?: string; size?: number | null; timeNode?: React.ReactNode; isOwn?: boolean; customRadius?: string }) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(() => {
    if (typeof initialSize === 'number' && initialSize > 0) return initialSize;
    return null;
  });
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia('file', fileSizeBytes, isOwn));
  const { blobUrl, blob, load, isLoading: mediaLoading, progress } = useDecryptedMedia(url, sharedSecret, fileName, undefined, chatId, messageId, autoLoad);
  const [isLoading, setIsLoading] = useState(false);
  const displayName = fileName || t('chatWindow.file');
  const ext = fileName?.split('.').pop()?.toUpperCase() || 'FILE';

  useEffect(() => {
    if (typeof initialSize === 'number' && initialSize > 0) {
      setFileSizeBytes(initialSize);
    }
  }, [initialSize]);

  useEffect(() => {
    if (fileSizeBytes && fileSizeBytes > 0) return;
    if (blob && blob.size > 0) {
      setFileSizeBytes(blob.size);
      return;
    }

    let cancelled = false;

    const probeSize = async () => {
      if (url) {
        const cached = mediaManager.getCachedMedia(url, sharedSecret || '');
        if (cached?.size && cached.size > 0) {
          if (!cancelled) setFileSizeBytes(cached.size);
          return;
        }
      }

      if (window.orbita?.getFileSize && url && !url.startsWith('http') && !url.startsWith('orbita-media:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        try {
          const sz = await window.orbita.getFileSize(url);
          if (!cancelled && sz > 0) {
            setFileSizeBytes(sz);
            return;
          }
        } catch {}
      }

      const targetUrl = blobUrl || (url && (url.startsWith('http') || url.startsWith('orbita-media:') || url.startsWith('blob:')) ? url : null);
      if (targetUrl) {
        try {
          const res = await fetch(targetUrl, { method: 'HEAD' });
          if (cancelled) return;
          const cl = res.headers.get('content-length');
          if (cl) {
            const parsed = parseInt(cl, 10);
            if (!isNaN(parsed) && parsed > 0) {
              setFileSizeBytes(parsed);
              return;
            }
          }
        } catch {}
      }
    };

    probeSize();

    return () => {
      cancelled = true;
    };
  }, [blob, blobUrl, url, sharedSecret, fileSizeBytes]);

  const fileSize = useMemo(() => {
    const bytes = fileSizeBytes || (blob ? blob.size : null);
    if (!bytes || isNaN(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
  }, [fileSizeBytes, blob]);

  const isDownloading = isLoading || mediaLoading;

  const handleOpenFile = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!blobUrl) {
      if (isDownloading) return;
      setIsLoading(true);
      try {
        await load();
      } catch (err) {
        console.error('Failed to load file:', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }
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
  }, [blobUrl, displayName, isDownloading, load]);

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
          state={!blobUrl ? (isDownloading ? 'downloading' : 'download') : 'file'}
          progress={isDownloading ? progress : undefined}
          isOwn={isOwn}
          ariaLabel={isDownloading ? 'Cancel download' : (!blobUrl ? 'Download file' : 'Open file')}
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
            {fileSize ? (ext ? `${fileSize} • ${ext}` : fileSize) : ext || t('chatWindow.document')}
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

const formatVoiceTime = (seconds: number) => {
  if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

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
  const progressOverlayRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const { blobUrl } = useDecryptedMedia(url, sharedSecret, fileName, mime, chatId, messageId);

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

  useEffect(() => {
    if (isCurrentTrack && localDuration > 0 && (!globalDuration || globalDuration === 0)) {
      setStoreDuration(localDuration);
    } else if (isCurrentTrack && globalDuration > 0 && Math.abs(localDuration - globalDuration) > 0.05) {
      setLocalDuration(globalDuration);
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

  const BAR_COUNT = 66;
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
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(newTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }
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

  useEffect(() => {
    let animId: number;
    let lastAudioTime = 0;
    let lastSyncTime = performance.now();

    const tick = () => {
      if (dragStateRef.current.isDragging) return;

      const getLiveTime = useAudioStore.getState().getLiveTime;
      const liveAudioTime = isCurrentTrack
        ? (getLiveTime ? getLiveTime() : useAudioStore.getState().currentTime)
        : 0;
      const now = performance.now();

      let currentExactTime = liveAudioTime;
      const playbackRate = useAudioStore.getState().playbackRate || 1;
      if (isPlaying && playbackRate > 0) {
        let expectedTime = ((now - lastSyncTime) / 1000) * playbackRate;
        if (Math.abs(liveAudioTime - expectedTime) > 0.3 || liveAudioTime < 0.1) {
          lastSyncTime = now - (liveAudioTime * 1000) / playbackRate;
          expectedTime = liveAudioTime;
        }
        currentExactTime = Math.min(effectiveDuration, expectedTime);
      }

      if (liveAudioTime !== lastAudioTime) {
        lastAudioTime = liveAudioTime;
      }

      let ratio = effectiveDuration > 0 ? Math.min(1, currentExactTime / effectiveDuration) : 0;
      if (effectiveDuration > 0 && currentExactTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatVoiceTime(currentExactTime)} / ${formatVoiceTime(effectiveDuration)}`;
      }

      if (isPlaying && appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      if (appVisibility.getIsVisible()) {
        animId = requestAnimationFrame(tick);
      } else {
        tick();
      }
    } else {
      let ratio = dragProgressRatio !== null
        ? dragProgressRatio
        : (effectiveDuration > 0 ? Math.min(1, effectiveCurrentTime / effectiveDuration) : 0);
      if (effectiveDuration > 0 && effectiveCurrentTime >= effectiveDuration - 0.4) {
        ratio = 1;
      }
      if (progressOverlayRef.current) {
        progressOverlayRef.current.style.width = `${ratio * 100}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = isPlaying || effectiveCurrentTime > 0
          ? `${formatVoiceTime(effectiveCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
          : formatVoiceTime(effectiveDuration);
      }
    }

    const unsubVisibility = appVisibility.subscribe((visible) => {
      cancelAnimationFrame(animId);
      if (visible) {
        lastSyncTime = performance.now();
        tick();
      }
    });

    return () => {
      cancelAnimationFrame(animId);
      unsubVisibility();
    };
  }, [isPlaying, isCurrentTrack, effectiveDuration, dragProgressRatio]);

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
          width: '280px',
          height: '64px',
          boxSizing: 'border-box',
        }}
      >
        <MD3CircularSpinner size="small" color={isOwn ? '#ffffff' : 'var(--accent-color, #7C3AED)'} />
        <span style={{ fontSize: orbitFs(10), color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)' }}>{t('chatWindow.loading')}</span>
      </div>
    );
  }

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
        width: '280px',
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
          className="relative flex items-center cursor-pointer select-none"
          style={{ height: '22px', gap: '1px', width: 'max-content', userSelect: 'none' }}
        >
          {bars.map((h, idx) => {
            const barHeight = Math.max(3, Math.round((h / 100) * 20));
            return (
              <div
                key={idx}
                style={{
                  width: '2px',
                  minWidth: '2px',
                  maxWidth: '2px',
                  height: `${barHeight}px`,
                  flexShrink: 0,
                  backgroundColor: isOwn
                    ? 'rgba(255, 255, 255, 0.4)'
                    : 'color-mix(in srgb, var(--text-main) 30%, transparent)',
                  borderRadius: '1px',
                  transform: 'translateZ(0)',
                }}
              />
            );
          })}

          <div
            ref={progressOverlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressRatio * 100}%`,
              overflow: 'hidden',
              pointerEvents: 'none',
              willChange: 'width',
              transform: 'translateZ(0)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '22px',
                gap: '1px',
                width: 'max-content',
              }}
            >
              {bars.map((h, idx) => {
                const barHeight = Math.max(3, Math.round((h / 100) * 20));
                return (
                  <div
                    key={idx}
                    style={{
                      width: '2px',
                      minWidth: '2px',
                      maxWidth: '2px',
                      height: `${barHeight}px`,
                      flexShrink: 0,
                      backgroundColor: isOwn
                        ? '#ffffff'
                        : 'var(--accent-color, #7C3AED)',
                      borderRadius: '1px',
                      transform: 'translateZ(0)',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ fontSize: '10.5px', color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', marginTop: '1px' }}>
          <span ref={timeDisplayRef} className="tabular-nums">
            {isPlaying || displayCurrentTime > 0
              ? `${formatVoiceTime(displayCurrentTime)} / ${formatVoiceTime(effectiveDuration)}`
              : formatVoiceTime(effectiveDuration)}
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

export const ChatWindow = ({ isMobileView = false, onBack }: ChatWindowProps) => {
  const { t, i18n } = useTranslation();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
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
  const reactionDebounceTimers = useRef<Map<string, any>>(new Map());
  const [mediaViewerState, setMediaViewerState] = useState<{
    isOpen: boolean;
    initialIndex: number;
    customItems?: MediaViewerItem[];
  }>({
    isOpen: false,
    initialIndex: 0,
  });

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
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
          if (mi.type === 'photo' || mi.type === 'video') {
            const effectiveSecret = mi.key || msg.mediaKey || sharedSecret;
            const directUrl = getOrbitaMediaUrl(mi.url, effectiveSecret, activeChatId || undefined, msg.id, mi.name || msg.mediaName) || undefined;
            list.push({
              id: `${msg.id || msgIdx}_${miIdx}`,
              url: mi.url,
              directUrl,
              chatId: activeChatId || undefined,
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
              sharedSecret: effectiveSecret,
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
    const finalItems = customItems || (index === -1 && items.length === 0 ? [{
      id: messageId || url,
      url,
      directUrl: getOrbitaMediaUrl(url, messages.find(m => m.id === messageId)?.mediaKey || sharedSecret, activeChatId || undefined, messageId) || undefined,
      chatId: activeChatId || undefined,
      type: 'photo' as const,
      time: Date.now(),
      key: messages.find(m => m.id === messageId)?.mediaKey,
      sharedSecret: messages.find(m => m.id === messageId)?.mediaKey || sharedSecret,
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
    if (!messages || messages.length === 0) return 0;
    return messages.filter((m) => !isMessageOutgoing(m, myCode, myNickname, activeChat, myUserId) && !m.read).length;
  }, [messages, myCode, myNickname, activeChat, myUserId]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  const selection = useSelection();

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const savedSelectionRangeRef = useRef<Range | null>(null);
  const readMessageIdsRef = useRef<Set<string>>(new Set());
  const prevMessagesLengthRef = useRef(messages.length);

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

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (activeChatIdRef.current && el && activeChatIdRef.current !== activeChatId) {
      saveChatScroll(activeChatIdRef.current, el);
    }
    activeChatIdRef.current = activeChatId;

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
              newItems.push({
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
              });
            }
          });

          const merged = [...updatedExisting, ...newItems].sort((a, b) => a.time - b.time);
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
        duration: audioMetadata?.duration,
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
          const wasAtBottom = atBottomRef.current || (el.scrollHeight - el.scrollTop - prevHeight <= 80);
          if (wasAtBottom) {
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
          useChatStore.setState((state) => {
            const currentMsgs = state.messagesByChatId[targetChannelId] || [];
            return {
              messagesByChatId: {
                ...state.messagesByChatId,
                [targetChannelId]: currentMsgs.map((m) =>
                  m.id === optimisticId || m.id === post.id
                    ? { ...m, id: post.id, time: post.time || m.time, status: 'read' as const }
                    : m
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

    if (existingMessageId) {
      useChatStore.setState((state) => {
        const currentMsgs = state.messagesByChatId[activeChatId] || [];
        const updated = currentMsgs.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text,
                status: 'sent' as const,
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

        try {
          (window as any).orbita?.storageAddMessage?.(activeChatId, messageId, localMessage);
        } catch {}

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

            await groupService.sendGroupMessage({
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
          }
          return;
        }

        if (!freshChat?.ratchetState) {
          // E2EE session not yet established — save plaintext to non_messages until peer accepts handshake
          console.log('[ChatWindow] No ratchetState yet — saving to non_messages offline queue');
          const recipientTargets = Array.from(new Set([
            activeChat?.peerCode,
            activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
          ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
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

        const recipientTargets = Array.from(new Set([
          activeChat?.peerCode,
          activeChat?.name && activeChat.name.length === 36 ? activeChat.name : undefined,
        ].filter((t): t is string => Boolean(t && t !== myCode && t !== myUserId))));
        if (activeChat?.type === 'private') {
          for (const recipientId of recipientTargets) {
            await supabaseService.sendOfflineMessage(
              activeChatId,
              myUserId || myCode || myNickname,
              recipientId,
              ciphertext,
              index,
              dhPublicKey,
              messageId,
              prevChainCount
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
    setReaction(activeChatId, msgId, emoji, reactionUserId, 'toggle', userAliases);

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
            if (m && (m.uploading || m.status === 'sending' || m.status === 'pending')) {
              const hasRemoteUrl = Boolean(m.mediaUrl && !m.mediaUrl.startsWith('blob:') && (m.mediaUrl.startsWith('http') || m.mediaUrl.startsWith('orbita-media:')));
              const hasRemoteItems = Boolean(m.mediaItems && m.mediaItems.length > 0 && m.mediaItems.every((it: any) => it.url && !it.url.startsWith('blob:') && (it.url.startsWith('http') || it.url.startsWith('orbita-media:'))));
              if (hasRemoteUrl || hasRemoteItems || !m.isOutgoing) {
                const fixed = { ...m, uploading: false, status: 'sent' as const };
                (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
                return fixed;
              }
              const fixed = { ...m, uploading: false };
              (window as any).orbita?.storageAddMessage?.(targetChatId, m.id, fixed).catch(() => {});
              return fixed;
            }
            return m;
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
              const merged = Array.from(map.values()).sort((a, b) => (a.time || 0) - (b.time || 0));
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
              [targetGroupId]: [...(state.messagesByChatId[targetGroupId] || []), ...newMessages].sort((a, b) => a.time - b.time),
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
      try {
        pusher.unsubscribe(channelName);
      } catch {}
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

    const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const voiceFileName = `voice_${Date.now()}.${ext}`;

    const localBlobUrl = URL.createObjectURL(blob);
    const optimisticMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    mediaManager.setDirectDecryptedMedia(localBlobUrl, '', blob, blob.type || 'audio/webm;codecs=opus', activeChatId, optimisticMessageId);

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
      mime: blob.type || 'audio/webm;codecs=opus',
      duration,
      waveform,
    };

    addMessage(activeChatId, optimisticMessage);
    updateChat(activeChatId, { lastMsg: voiceFileName || t('chatWindow.voice_message') });
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

        const tempPath = await window.orbita.writeTempFile(encryptedBase64, isPublic ? ext : undefined);
        if (!tempPath) {
          showToast(t('chatWindow.upload_failed'));
          useChatStore.getState().deleteMessage(activeChatId, optimisticMessageId);
          return;
        }

        const publicId = `orbita_${Date.now()}`;
        const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
        window.orbita.deleteTempFile?.(tempPath);

        if (result.success && result.secure_url) {
          mediaManager.setDirectDecryptedMedia(result.secure_url, fileKey || '', blob, blob.type || 'audio/webm;codecs=opus', activeChatId, optimisticMessageId);
          await triggerMessage(
            `[Audio] ${voiceFileName}`,
            {
              type: 'voice',
              url: result.secure_url,
              key: fileKey,
              name: voiceFileName,
              mime: blob.type || 'audio/webm;codecs=opus',
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
  ): Promise<{ width?: number; height?: number; duration?: number; blurPreview?: string }> => {
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
          duration: audioMetadata?.duration,
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
        let fileBase64: string;

        const isPublic = isChannel || isBotChat;
        if (isPublic) {
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
        const tempPath = await window.orbita.writeTempFile(fileBase64, isPublic ? ext : undefined);
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
          thumbnail: file.preview || file.blurPreview,
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
              useChatStore.setState((state) => {
                const msgs = state.messagesByChatId[activeChatId];
                if (!msgs) return state;
                return {
                  messagesByChatId: {
                    ...state.messagesByChatId,
                    [activeChatId]: msgs.map((m) => {
                      if (m.id !== messageId) return m;
                      const updatedItems = m.mediaItems ? m.mediaItems.map((it, idx) =>
                        idx === fIdx ? { ...it, uploadedMb } : it
                      ) : undefined;
                      return { ...m, mediaItems: updatedItems };
                    }),
                  },
                };
              });
            });

            if (!uploaded) return;
            uploadedItems.push({
              ...uploaded,
              uploading: false,
            });
          }

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
            mediaItems: uploadedItems.map((f) => ({
              ...f,
              type: f.type,
              key: f.key,
              width: f.width,
              height: f.height,
              duration: f.duration,
              audioMetadata: f.audioMetadata ? {
                title: f.audioMetadata.title,
                artist: f.audioMetadata.artist,
                duration: f.audioMetadata.duration,
                size: f.audioMetadata.size,
              } : undefined,
            })),
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

          const pusher = getPusher();
          const channel = pusher.subscribe(`private-chat-${activeChatId}`);
          const send = () => {
            channel.trigger('client-message', {
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
            });
          };
          if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

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
            useChatStore.setState((state) => {
              const msgs = state.messagesByChatId[activeChatId];
              if (!msgs) return state;
              return {
                messagesByChatId: {
                  ...state.messagesByChatId,
                  [activeChatId]: msgs.map((m) =>
                    m.id === messageId ? { ...m, uploadedMb } : m
                  ),
                },
              };
            });
          });

          if (!uploaded) return;

          const isPresent = useChatStore.getState().messagesByChatId[activeChatId]?.some((m) => m.id === messageId);
          if (!isPresent) return;

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
            blurPreview: uploaded.blurPreview,
            thumbnail: uploaded.thumbnail,
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
          updateChat(activeChatId, { ratchetState: ratchet.getState() });

          const pusher = getPusher();
          const channel = pusher.subscribe(`private-chat-${activeChatId}`);
          const send = () => {
            channel.trigger('client-message', {
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
            });
          };
          if (channel.subscribed) send(); else channel.bind('pusher:subscription_succeeded', send);

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
      const viewerItems: MediaViewerItem[] = itemsToRender.map((item, idx) => ({
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
          items={itemsToRender}
          sharedSecret={sharedSecret}
          msg={msg}
          timeNode={timeBadge(msg, isMessagePinned(index))}
          customRadius={customRadius}
          isOwn={isOwn}
          onMediaClick={(tileIdx) => {
            const clicked = viewerItems[tileIdx];
            if (clicked) {
              openMediaViewer(clicked.url, msg.id);
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
      <MessageReactions
        reactions={msg.reactions}
        onToggleReaction={(emoji) => triggerReactionMessage(msg.id || index, emoji)}
        isOwn={isOwn}
        activeChatId={activeChatId || undefined}
        isSmallMessage={isShort}
      />
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

    const prevMsg = index > 0 ? messages[index - 1] : null;
    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

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
                 m.nickname === msg.sender
        )
      : null;
    const senderAvatar = senderMember?.avatarUrl || (msg as any).senderAvatar || (msg as any).avatarUrl;
    const senderNickname = senderMember?.nickname || msg.sender || '';

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
              <Avatar
                src={senderAvatar}
                alt={senderNickname}
                className="w-[34px] h-[34px]"
                style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }}
              />
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
      const isSingleImageOrVideo = (media.type === 'image' || media.type === 'video') && Boolean(media.url || msg.mediaUrl);
      const effectiveMediaItems = (mediaItems && mediaItems.length > 0)
        ? mediaItems
        : (isSingleImageOrVideo ? [{
            type: (media.type === 'video' || msg.mime?.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(media.fileName || msg.mediaName || '')) ? ('video' as const) : ('photo' as const),
            url: media.url || msg.mediaUrl || '',
            name: media.fileName || msg.mediaName || '',
            mime: msg.mime,
            key: msg.mediaKey,
            duration: msg.duration,
            width: msg.width,
            height: msg.height,
            blurPreview: msg.blurPreview,
            thumbnail: msg.thumbnail || msg.blurPreview,
          }] : null);

      if (effectiveMediaItems && effectiveMediaItems.length > 0) {
        const isPhotoGroup = effectiveMediaItems.some((it) => it.type === 'photo' || it.type === 'video');
        const isAudioGroup = effectiveMediaItems.every((it) => it.type === 'audio' || it.mime?.startsWith('audio/'));

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
                      padding: isPhotoGroup ? '2px 2px 4px 2px' : (isAudioGroup ? '0px' : '1px 1px 4px 1px'),
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
      <div
        ref={headerRef}
        className="sticky top-0 z-20 w-full select-none"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderBottom: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <header
          className="flex justify-center w-full select-none"
          style={{
            padding: '10px 16px',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <div
            className="flex items-center justify-between w-full select-none"
            style={{
              maxWidth: '100%',
              borderRadius: 0,
              backgroundColor: 'transparent',
              padding: '0',
            }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0 select-none" onClick={() => setActiveProfileChatId(activeChatId)} style={{ cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}>
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
              <div className="flex flex-col min-w-0 flex-1 select-none" style={{ gap: 0, userSelect: 'none', WebkitUserSelect: 'none' }}>
                <div className="flex items-center gap-1.5 min-w-0 select-none">
                  {activeChat?.type === 'channel' && (
                    <ChannelMegaphoneIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                  )}
                  {activeChat?.type === 'group' && (
                    <GroupUsersIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                  )}
                  {activeChat?.type === 'bot' && (
                    <BotIcon size={16} className="flex-shrink-0 text-[var(--accent-color)]" style={{ marginRight: 2 }} />
                  )}
                  <h2 className="font-bold text-[14px] truncate select-none" style={{ color: 'var(--text-main)', userSelect: 'none', WebkitUserSelect: 'none' }}>
                    {activeChatId === 'notes' ? t('connectModal.notes') : activeChat?.name}
                  </h2>
                  {activeChat?.type === 'bot' && (
                    <VerifiedBadge size={16} className="flex-shrink-0" />
                  )}
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
                <div className="select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  {activeChatId === 'notes' ? null : activeChat?.type === 'channel' ? (
                    <span className="text-[11px] font-medium text-[var(--text-dim)]">
                      {activeChat.subscribersCount
                        ? `${activeChat.subscribersCount.toLocaleString('ru-RU')} ${(() => { const n = activeChat.subscribersCount || 0; const m10 = n % 10; const m100 = n % 100; if (m10 === 1 && m100 !== 11) return 'подписчик'; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'подписчика'; return 'подписчиков'; })()}`
                        : t('channel.subscribers_none', 'подписчиков пока нет')}
                    </span>
                  ) : activeChat?.type === 'group' ? (
                    <span className="text-[11px] font-medium text-[var(--text-dim)]">
                      {activeChat.onlineCount && activeChat.onlineCount > 0
                        ? t('groupSettings.members_and_online', {
                            count: activeChat.membersCount || activeChat.members?.length || 1,
                            online: Math.min(activeChat.membersCount || activeChat.members?.length || 1, activeChat.onlineCount),
                          })
                        : t('groupSettings.members_count', {
                            count: activeChat.membersCount || activeChat.members?.length || 1,
                          })}
                    </span>
                  ) : activeChat?.type === 'bot' ? null : !isServerConnected ? (
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
              {activeChatId === 'system_support' && supportService.isAdmin && (
                <button
                  className="p-2 transition-colors duration-200 text-[var(--accent-color, #7C3AED)] hover:opacity-80 cursor-pointer bg-transparent border-none outline-none flex items-center justify-center relative"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSupportTicketsModalOpen(true);
                  }}
                  aria-label={t('support.open_tickets_modal', 'Тикеты поддержки')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
                    <path d="M13 5v2"/>
                    <path d="M13 17v2"/>
                    <path d="M13 11v2"/>
                  </svg>
                </button>
              )}
              {activeChat?.type === 'group' && (
                <button
                  className="p-2 transition-colors duration-200 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer bg-transparent border-none outline-none flex items-center justify-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAddMemberModalOpen(true);
                  }}
                  aria-label={t('groupSettings.add_member', 'Добавить участника')}
                >
                  <UserPlus size={20} />
                </button>
              )}
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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>
        <ActiveCallBar />
      </div>

      {selection.isSelectionMode && (
        <SelectionPanel
          selectedCount={selection.selectedIds.size}
          onDelete={activeChat?.type === 'channel' && !isChannelOwner ? undefined : requestDeleteSelected}
          onCancel={selection.exitSelectionMode}
          height={headerHeight}
        />
      )}

      {activeChat?.type === 'group' && activeChat.activeCallRoom && (
        <div
          className="flex-shrink-0 flex items-center justify-between select-none px-4 py-2.5 transition-all"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 14%, var(--bg-secondary))',
            borderBottom: '1px solid color-mix(in srgb, var(--accent-color, #7C3AED) 25%, transparent)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--accent-color)] text-white animate-pulse">
              <Phone size={15} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-[var(--text-main)] truncate">
                {t('groupCall.active_title', 'Идёт групповой звонок')}
              </span>
              <span className="text-[11px] text-[var(--text-dim)] truncate">
                {t('groupCall.max_participants', 'До 10 участников')}
              </span>
            </div>
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

          {(activeChat?.type !== 'channel' || isChannelOwner) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                requestUnpinMessage();
              }}
              className="p-1.5 rounded-full text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors flex-shrink-0"
              aria-label={t('common.unpin')}
            >
              <X size={18} />
            </button>
          )}
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
                onSendGreeting={() => triggerMessage('👋')}
                isInitiator={activeChat?.isChatInitiator}
                isPeerOnline={activeChat?.online}
                isRatchetReady={Boolean(activeChat?.ratchetState)}
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
};