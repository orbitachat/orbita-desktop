// src/components/layout/MainLayout.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import i18n from 'i18next';
import { useChatStore, type Chat, type Message, type IncomingFriendRequest, isMessageOutgoing } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { DeveloperBadge, revalidateDevelopersOnConnection } from '../ui/DeveloperBadge';
import { X, Trash, WifiOff, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { markdownToHtml } from '../../utils/messageUtils';
import { getPusher } from '../../utils/pusher';
import {
  generateChatId,
  generateKeyPair,
  derivePublicKey,
  deriveSharedSecret,
  deriveRootKey,
  decryptMessage,
} from '../../lib/crypto';
import { generateRandomCode } from '../../lib/codes';
import { messageQueue } from '../../lib/message-queue';
import { ChatPlaceholder } from '../chat/ChatPlaceholder';
import {
  ChatWindow,
  CustomPinIcon,
  CustomUnpinIcon,
  CustomMuteIcon,
  CustomUnmuteIcon,
  CustomClearHistoryIcon
} from '../chat/ChatWindow';
import { ablyService } from '../../services/ablyService';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { DoubleRatchet } from '../../lib/double-ratchet';
import { useTranslation } from 'react-i18next';
import { showNotification } from '../../utils/notification';
import { MessageStatus } from '../../components/MessageStatus';
import { channelService, type ChannelInfo } from '../../services/channelService';
import { deriveChannelKey } from '../../lib/crypto';
import { useCallStore } from '../../store/useCallStore';
import { callSoundService } from '../../services/callSoundService';
import { ResizableSidebar } from './ResizableSidebar';
import { supabaseService } from '../../services/supabaseService';
import { gatewayManager } from '../../services/gatewayManager';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import { GlobalAudioPlayer } from '../audio/GlobalAudioPlayer';
import { GlobalAudioEngine } from '../audio/GlobalAudioEngine';
import { CallMiniPlayer } from '../call/CallMiniPlayer';
import { useShallow } from 'zustand/react/shallow';
import { type ConfirmActionType } from '../common/ActionConfirmModal';
import { useConnectionStore } from '../../store/useConnectionStore';
import { InChatSidebarSearch } from './InChatSidebarSearch';
import { SettingsScreen } from '../chat/SettingsScreen';
import { ProfileScreen } from '../chat/ProfileScreen';
import { MyProfileModal } from '../chat/MyProfileModal';
import { ConnectModal } from './ConnectModal';
import { FriendRequestsModal } from './FriendRequestsModal';
import { IncomingCallModal } from '../call/IncomingCallModal';
import { CallWindow } from '../call/CallWindow';
import { CallsModal } from '../call/CallsModal';
import { MainMenuDrawer } from './MainMenuDrawer';
import { DeleteAccountModal } from '../common/DeleteAccountModal';
import { ActionConfirmModal } from '../common/ActionConfirmModal';
import { DevicePermissionModal } from '../common/DevicePermissionModal';
import { ChannelMegaphoneIcon } from '../common/ChannelMegaphoneIcon';
import { BotIcon } from '../common/BotIcon';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { BotAvatar } from '../common/BotAvatar';
import { sendEncryptedReadReceipt } from '../../services/receiptService';
import { extractCodeFromInput } from '../../utils/inviteLink';
import { orbitosService } from '../../services/orbitosService';
import { supportService } from '../../services/supportService';

interface ChatContextMenu {
  visible: boolean;
  x: number;
  y: number;
  chatId: string;
}

const getLastMsgDisplay = (chat: Chat, lastMsg: Message | null, t: any): React.ReactNode => {
  const accentStyle: React.CSSProperties = { color: 'var(--accent-color, #7C3AED)' };

  if (!lastMsg) {
    if (chat.lastMsg === 'HISTORY_CLEARED') return t('common.history_cleared');
    return t('common.no_messages');
  }

  if (lastMsg.text?.startsWith('[Call]')) {
    const parts = lastMsg.text.split(', ');
    const directionPart = parts[0].replace(/^\[Call\]\s/, '');
    const isOutgoing = directionPart.includes('Исходящий');
    const status = lastMsg.mediaName || 'completed';
    const displayStatus = status === 'busy' ? 'rejected' : status;

    let text = '';
    if (displayStatus === 'missed') {
      text = t('call.missed_call');
    } else if (displayStatus === 'rejected') {
      text = t('call.rejected_call');
    } else if (displayStatus === 'completed') {
      text = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    } else {
      text = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    }
    return (
      <span className="truncate" style={accentStyle}>{text}</span>
    );
  }

  if (lastMsg?.mediaItems && lastMsg.mediaItems.length > 0) {
    if (lastMsg.text && lastMsg.text.trim()) {
      const cleanText = lastMsg.text.replace(/^↩\s.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ');
      return cleanText ? <span dangerouslySetInnerHTML={{ __html: markdownToHtml(cleanText, 'currentColor') }} /> : null;
    }

    const items = lastMsg.mediaItems;
    const isRu = i18n.language?.startsWith('ru');
    const photoCount = items.filter(i => i.type === 'photo').length;
    const videoCount = items.filter(i => i.type === 'video').length;
    const audioCount = items.filter(i => i.type === 'audio').length;
    const fileCount = items.filter(i => i.type === 'file').length;

    if (photoCount > 0 && videoCount === 0 && audioCount === 0 && fileCount === 0) {
      const count = photoCount;
      let label = photoCount === 1 ? t('chatWindow.photo') : `${photoCount} ${t('chatWindow.photos', 'photos')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'фотографий';
        if (mod10 === 1 && mod100 !== 11) word = 'фотография';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'фотографии';
        label = count === 1 ? t('chatWindow.photo') : `${count} ${word}`;
      }
      return (
        <span className="truncate" style={accentStyle}>{label}</span>
      );
    }

    if (videoCount > 0 && photoCount === 0 && audioCount === 0 && fileCount === 0) {
      const count = videoCount;
      let label = videoCount === 1 ? t('chatWindow.video') : `${videoCount} ${t('chatWindow.videos', 'videos')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'видеозаписей';
        if (mod10 === 1 && mod100 !== 11) word = 'видеозапись';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'видеозаписи';
        label = count === 1 ? t('chatWindow.video') : `${count} ${word}`;
      }
      return (
        <span className="truncate" style={accentStyle}>{label}</span>
      );
    }

    if ((photoCount > 0 || videoCount > 0) && audioCount === 0 && fileCount === 0) {
      const count = photoCount + videoCount;
      let label = `${count} ${t('chatWindow.media_items', 'media files')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'медиафайлов';
        if (mod10 === 1 && mod100 !== 11) word = 'медиафайл';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'медиафайла';
        label = `${count} ${word}`;
      }
      return (
        <span className="truncate" style={accentStyle}>{label}</span>
      );
    }

    if (audioCount > 0 && photoCount === 0 && videoCount === 0 && fileCount === 0) {
      const count = audioCount;
      let label = audioCount === 1 ? t('chatWindow.audio') : `${audioCount} ${t('chatWindow.audio_files', 'audio files')}`;
      if (isRu) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        let word = 'аудиофайлов';
        if (mod10 === 1 && mod100 !== 11) word = 'аудиофайл';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'аудиофайла';
        label = count === 1 ? t('chatWindow.audio') : `${count} ${word}`;
      }
      return (
        <span className="truncate block min-w-0" style={accentStyle}>🎧 {label}</span>
      );
    }

    const totalFiles = items.length;
    let label = `${totalFiles} ${t('chatWindow.files', 'files')}`;
    if (isRu) {
      const mod10 = totalFiles % 10;
      const mod100 = totalFiles % 100;
      let word = 'файлов';
      if (mod10 === 1 && mod100 !== 11) word = 'файл';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'файла';
      label = `${totalFiles} ${word}`;
    }
    return (
      <span className="truncate" style={accentStyle}>{label}</span>
    );
  }

  if (lastMsg?.mediaType) {
    if (lastMsg.text && /^\[GIF\]/i.test(lastMsg.text)) {
      return (
        <span className="truncate" style={accentStyle}>GIF</span>
      );
    }
    if (lastMsg.text && /^\[Sticker\]/i.test(lastMsg.text)) {
      return (
        <span className="truncate" style={accentStyle}>{t('chatWindow.sticker')}</span>
      );
    }

    switch (lastMsg.mediaType) {
      case 'photo':
        return (
          <span className="truncate" style={accentStyle}>{t('chatWindow.photo')}</span>
        );
      case 'video':
        return (
          <span className="truncate" style={accentStyle}>{t('chatWindow.video')}</span>
        );
      case 'voice':
        return (
          <span className="truncate" style={accentStyle}>{t('chatWindow.voice_message')}</span>
        );
      case 'audio': {
        const meta = lastMsg.audioMetadata;
        const title = (meta && meta.artist && meta.title) ? `${meta.artist} – ${meta.title}` : (lastMsg.mediaName || t('chatWindow.audio'));
        return (
          <span className="truncate block min-w-0" style={accentStyle}>🎧 {title}</span>
        );
      }
      case 'file':
        return (
          <span className="truncate" style={accentStyle}>{lastMsg.mediaName || t('chatWindow.file')}</span>
        );
      default:
        return (
          <span className="truncate" style={accentStyle}>{lastMsg.mediaName || t('chatWindow.file')}</span>
        );
    }
  }

  if (lastMsg?.text) {
    const text = lastMsg.text.replace(/\[emoji:[a-zA-Z0-9_]+\]/g, '').trim();
    if (text.startsWith('http://') || text.startsWith('https://')) {
      return (
        <span className="truncate">{text}</span>
      );
    }
    const cleanText = text.replace(/^↩\s.+?:.+?,\s\d{2}:\d{2}\n/, '').replace(/\n/g, ' ');
    if (/^\[Sticker\]/i.test(cleanText)) {
      return (
        <span className="truncate" style={accentStyle}>{t('chatWindow.sticker')}</span>
      );
    }
    if (/^\[GIF\]/i.test(cleanText)) {
      return (
        <span className="truncate" style={accentStyle}>GIF</span>
      );
    }
    if (/^\[Photo\]/i.test(cleanText)) {
      return (
        <span className="truncate" style={accentStyle}>{t('chatWindow.photo')}</span>
      );
    }
    if (/^\[Video\]/i.test(cleanText)) {
      return (
        <span className="truncate" style={accentStyle}>{t('chatWindow.video')}</span>
      );
    }
    if (/^\[Audio\]\s+voice_\d+\.ogg/i.test(cleanText) || /^voice_\d+\.ogg/i.test(cleanText)) {
      return (
        <span className="truncate" style={accentStyle}>{t('chatWindow.voice_message')}</span>
      );
    }
    if (/^\[Audio\]/i.test(cleanText)) {
      const match = cleanText.match(/^\[Audio\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const title = match ? match[1] : t('chatWindow.audio');
      return (
        <span className="truncate block min-w-0" style={accentStyle}>🎧 {title}</span>
      );
    }
    if (/^\[File\]/i.test(cleanText)) {
      const match = cleanText.match(/^\[File\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
      const fileName = match ? match[1] : t('chatWindow.file');
      return (
        <span className="truncate" style={accentStyle}>{fileName}</span>
      );
    }
    const plain = cleanText
      .replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\|\|(.*?)\|\|/g, '$1')
      .replace(/^>\s?(.*)$/gm, '$1')
      .replace(/\n+/g, ' ')
      .trim();
    return plain || t('common.no_messages');
  }

  if (chat.lastMsg === 'E2EE_SECURE_CHANNEL_READY') return t('common.no_messages');
  if (chat.lastMsg === 'HISTORY_CLEARED') return t('common.history_cleared');
  if (!chat.lastMsg && !lastMsg) return t('common.no_messages');

  let cleanText = chat.lastMsg || '';
  if (/^\[Sticker\]/i.test(cleanText)) {
    return (
      <span className="truncate" style={accentStyle}>{t('chatWindow.sticker')}</span>
    );
  }
  if (/^\[GIF\]/i.test(cleanText)) {
    return (
      <span className="truncate" style={accentStyle}>GIF</span>
    );
  }
  if (/^\[Photo\]/i.test(cleanText)) {
    return (
      <span className="truncate" style={accentStyle}>{t('chatWindow.photo')}</span>
    );
  }
  if (/^\[Video\]/i.test(cleanText)) {
    return (
      <span className="truncate" style={accentStyle}>{t('chatWindow.video')}</span>
    );
  }
  if (/^\[Audio\]\s+voice_\d+\.ogg/i.test(cleanText) || /^voice_\d+\.ogg/i.test(cleanText)) {
    return (
      <span className="truncate" style={accentStyle}>{t('chatWindow.voice_message')}</span>
    );
  }
  if (/^\[Audio\]/i.test(cleanText)) {
    const match = cleanText.match(/^\[Audio\]\s+(.+?)\s+https?:\/\//i);
    if (match) {
      if (/^voice_\d+\.ogg$/i.test(match[1])) {
        return (
          <span className="truncate" style={accentStyle}>
            {t('chatWindow.voice_message')}
          </span>
        );
      }
      const parts = match[1].split(' – ');
      const title = parts.length === 2 ? `${parts[0]} – ${parts[1]}` : match[1];
      return (
        <span className="truncate block min-w-0" style={accentStyle}>🎧 {title}</span>
      );
    }
    return (
      <span className="truncate block min-w-0" style={accentStyle}>🎧 {t('chatWindow.audio')}</span>
    );
  }
  if (/^\[File\]/i.test(cleanText)) {
    const match = cleanText.match(/^\[File\]\s+(.+?)\s+https?:\/\//i);
    const fileName = match ? match[1] : t('chatWindow.file');
    return (
      <span className="truncate" style={accentStyle}>{fileName}</span>
    );
  }

  const plain = cleanText
    .replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\|\|(.*?)\|\|/g, '$1')
    .replace(/^>\s?(.*)$/gm, '$1')
    .replace(/\n+/g, ' ')
    .trim();
  return plain || t('common.no_messages');
};

const formatUnreadCount = (count: number): string => {
  if (count === 0) return '';
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const ChatListItem = React.memo(({
  chat,
  isActive,
  isPinned,
  onSelect,
  onContextMenu,
  nickname,
  myCode,
  t,
  isLightTheme,
}: {
  chat: Chat;
  isActive: boolean;
  isPinned: boolean;
  onSelect: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  nickname: string;
  myCode?: string;
  t: any;
  isLightTheme: boolean;
}) => {
  const lastMsg = useChatStore(
    useCallback((s) => {
      const msgs = s.messagesByChatId[chat.id];
      return msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
    }, [chat.id])
  );
  const lastMsgTime = lastMsg ? new Date(lastMsg.time) : null;
  const timeStr = lastMsgTime
    ? `${lastMsgTime.getHours().toString().padStart(2, '0')}:${lastMsgTime.getMinutes().toString().padStart(2, '0')}`
    : '';
  const isOwn = isMessageOutgoing(lastMsg, myCode, nickname, chat);
  const status = isOwn && lastMsg?.status ? lastMsg.status : undefined;

  const rawDraft = useChatStore(
    useCallback((s) => s.draftsByChatId[chat.id], [chat.id])
  );
  const draftText = rawDraft ? rawDraft.trim() : '';
  const showDraft = !!(draftText && !isActive);

  const ringColor = isActive
    ? (isLightTheme ? '#e5e5e7' : '#2c2c2c')
    : (isLightTheme ? '#f5f5f5' : '#1e1e1e');

  return (
    <div
      onClick={() => onSelect(chat.id)}
      onContextMenu={(e) => onContextMenu(e, chat.id)}
      className="group relative cursor-pointer"
      style={{
        borderRadius: 0,
        width: '100%',
        backgroundColor: isActive
          ? (isLightTheme ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)')
          : 'transparent',
        border: 'none',
        padding: '8px 11px 8px 14px',
        minHeight: 48,
        boxSizing: 'border-box',
        contentVisibility: 'auto',
        containIntrinsicSize: '64px',
        willChange: 'transform',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = isLightTheme
            ? 'rgba(0, 0, 0, 0.04)'
            : 'rgba(255, 255, 255, 0.04)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div className="flex justify-between items-center min-w-0">
        <div style={{ width: 48, height: 48, marginRight: 10, flexShrink: 0, position: 'relative' }}>
          {chat.id === 'notes' ? (
            <NotesAvatar className="w-12 h-12" />
          ) : chat.type === 'bot' ? (
            <BotAvatar className="w-12 h-12" />
          ) : (
            <Avatar src={chat.avatarUrl} alt={chat.name} className="w-12 h-12" style={{ borderRadius: '50%' }} />
          )}
          {chat.type === 'private' && chat.id !== 'notes' && chat.online && (
            <span
              aria-label={t('common.online', 'В сети')}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-color, #7C3AED)',
                boxShadow: `0 0 0 2px ${ringColor}`,
                zIndex: 2,
                pointerEvents: 'none',
                flexShrink: 0,
                transition: 'box-shadow 0.12s ease',
              }}
            />
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <div className="flex items-center gap-1 min-w-0 flex-1">
              {chat.type === 'channel' && (
                <ChannelMegaphoneIcon
                  size={15}
                  className="flex-shrink-0"
                  style={{
                    color: isLightTheme ? '#555555' : 'rgba(255, 255, 255, 0.85)',
                    marginRight: 2,
                  }}
                />
              )}
              {chat.type === 'bot' && (
                <BotIcon
                  size={15}
                  className="flex-shrink-0"
                  style={{
                    color: isLightTheme ? '#555555' : 'rgba(255, 255, 255, 0.85)',
                    marginRight: 2,
                  }}
                />
              )}
              <span
                className="text-[14px] font-bold truncate whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                style={{
                  color: isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)',
                  fontFamily: 'inherit'
                }}
              >
                {chat.id === 'notes' ? t('connectModal.notes') : chat.name}
              </span>
              {chat.type === 'bot' && (
                <VerifiedBadge size={16} className="flex-shrink-0" />
              )}
              <DeveloperBadge
                userId={chat.peerCode || (chat.name && chat.name.length === 36 ? chat.name : undefined) || (chat.type === 'private' ? chat.id : undefined)}
                size={18}
              />
              {chat.type === 'channel' && chat.isOfficial && (
                <span className="px-1 py-0.2 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[9px] font-extrabold uppercase flex-shrink-0">
                  {t('channel.official', 'ОФИЦ')}
                </span>
              )}
            </div>
            <div className="ml-auto flex items-center flex-shrink-0" style={{ gap: 3 }}>
              {status && (
                <div style={{ display: 'flex', alignItems: 'center', transform: 'translateY(-2.5px)' }}>
                  <MessageStatus
                    status={status}
                    isOwn={true}
                    color={status === 'read' ? 'var(--accent-color, #7C3AED)' : (isLightTheme ? '#757575' : '#ffffff')}
                  />
                </div>
              )}
              {timeStr && (
                <span
                  className="text-[12px] font-medium tabular-nums whitespace-nowrap"
                  style={{
                    color: isLightTheme ? '#757575' : 'var(--text-dim, #808080)',
                  }}
                >
                  {timeStr}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center min-w-0 w-full overflow-hidden">
            <div
              className="text-[13px] font-normal whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0"
              style={{
                color: showDraft
                  ? (isLightTheme ? '#111111' : 'rgba(255,255,255,0.85)')
                  : (isLightTheme ? '#757575' : 'var(--text-dim, #8e8e93)'),
                textTransform: 'none',
                fontFamily: 'inherit'
              }}
            >
              {showDraft ? (
                <span className="truncate block min-w-0">
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Черновик: </span>
                  <span>{draftText}</span>
                </span>
              ) : (
                getLastMsgDisplay(chat, lastMsg, t)
              )}
            </div>
            {chat.type === 'group' && chat.role && (
              <span className="text-[9px] uppercase font-bold flex-shrink-0 ml-1.5" style={{ color: 'var(--accent-color, #7C3AED)' }}>
                {chat.role === 'owner' ? t('groupSettings.owner') : chat.role === 'admin' ? t('groupSettings.admin') : chat.role === 'member' ? t('groupSettings.member') : ''}
              </span>
            )}
            {(isPinned || (chat.unreadCount ?? 0) > 0) && (
              <div className="ml-1.5 flex items-center gap-1.5 flex-shrink-0">
                {isPinned && (
                  <CustomPinIcon size={13} style={{ color: 'var(--accent-color, #7C3AED)' }} className="flex-shrink-0" />
                )}
                {(chat.unreadCount ?? 0) > 0 && (
                  <span
                    className="text-[12px] font-bold px-2 rounded-full text-gray flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-color, #7C3AED)',
                      paddingTop: '0.1rem',
                      paddingBottom: '0.1rem',
                      minWidth: '24px',
                      textAlign: 'center',
                    }}
                  >
                    {formatUnreadCount(chat.unreadCount!)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export const MainLayout = () => {
  const { t } = useTranslation();
  const {
    chats,
    activeChatId,
    setActiveChat,
    currentView,
    setCurrentView,
    addMessage,
    updateChat,
    myCode,
    setMyCode,
    addChat,
    resetChats,
    setIsHandshaking,
    closeChat: closeChatStore,
    activeProfileChatId,
    setActiveProfileChatId,
    messagesByChatId,
    incomingFriendRequests,
    addIncomingFriendRequest,
    removeIncomingFriendRequest,
    inChatSearch,
    closeInChatSearch,
    addChannelChat,
    hideProfileId,
    deletedChatSessions,
  } = useChatStore(useShallow(state => ({
    chats: state.chats,
    activeChatId: state.activeChatId,
    setActiveChat: state.setActiveChat,
    currentView: state.currentView,
    setCurrentView: state.setCurrentView,
    addMessage: state.addMessage,
    updateChat: state.updateChat,
    myCode: state.myCode,
    setMyCode: state.setMyCode,
    addChat: state.addChat,
    resetChats: state.resetChats,
    isHandshaking: state.isHandshaking,
    setIsHandshaking: state.setIsHandshaking,
    closeChat: state.closeChat,
    activeProfileChatId: state.activeProfileChatId,
    setActiveProfileChatId: state.setActiveProfileChatId,
    messagesByChatId: state.messagesByChatId,
    incomingFriendRequests: state.incomingFriendRequests,
    addIncomingFriendRequest: state.addIncomingFriendRequest,
    removeIncomingFriendRequest: state.removeIncomingFriendRequest,
    inChatSearch: state.inChatSearch,
    closeInChatSearch: state.closeInChatSearch,
    addChannelChat: state.addChannelChat,
    hideProfileId: state.hideProfileId,
    deletedChatSessions: state.deletedChatSessions,
  })));
  const isServerConnected = useConnectionStore((state) => state.isServerConnected);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const { nickname, avatarUrl, step, deleteAccount } = useAuthStore(useShallow(state => ({
    nickname: state.nickname,
    avatarUrl: state.avatarUrl,
    step: state.step,
    deleteAccount: state.deleteAccount,
  })));
  const [searchQuery, setSearchQuery] = useState('');
  const [connectModalConfig, setConnectModalConfig] = useState<{
    isOpen: boolean;
    type: 'group' | 'channel' | 'friend';
  }>({ isOpen: false, type: 'friend' });
  const [searchChannelResult, setSearchChannelResult] = useState<ChannelInfo | null>(null);
  const [isSearchingChannel, setIsSearchingChannel] = useState(false);
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const [isMyProfileOpen, setIsMyProfileOpen] = useState(false);
  const [showCallsModal, setShowCallsModal] = useState(false);
  const [showFriendRequestsModal, setShowFriendRequestsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isMobileView, setIsMobileView] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 680 : false);
  const [chatContextMenu, setChatContextMenu] = useState<ChatContextMenu>({
    visible: false,
    x: 0,
    y: 0,
    chatId: '',
  });
  const pinnedChatIds = useChatStore((s) => s.pinnedChatIds) || [];
  const togglePinChat = useChatStore((s) => s.togglePinChat);
  const pinnedChatsSet = useMemo(() => new Set(pinnedChatIds), [pinnedChatIds]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: ConfirmActionType | null;
    chatId: string;
    chatName: string;
    avatarUrl?: string;
    isNotes?: boolean;
  }>({
    isOpen: false,
    type: null,
    chatId: '',
    chatName: '',
  });
  const [pendingSwitchChatId, setPendingSwitchChatId] = useState<string | null>(null);
  const [showVoiceDiscardModal, setShowVoiceDiscardModal] = useState(false);

  const activeSubscriptions = useRef<Map<string, { channel: any; handler: (data: any) => void }>>(new Map());

  const processedChatIds = useRef<Set<string>>(new Set());
  const codeChannelRef = useRef<any>(null);
  const pingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const lastPongTime = useRef<Map<string, number>>(new Map());
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const handshakeGuard = useRef<boolean>(false);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const ablyMessageUnsubscribes = useRef<Map<string, () => void>>(new Map());

  const deliveryUnsubscribes = useRef<Map<string, () => void>>(new Map());



  const isLoadingPendingRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).orbita?.onOpenChat) {
      const unsub = (window as any).orbita.onOpenChat((openChatId: string) => {
        if (openChatId) {
          setActiveChat(openChatId);
          setCurrentView('chats');
        }
      });
      return unsub;
    }
  }, [setActiveChat, setCurrentView]);

  // Создаём чат "Заметки для себя" при старте, если его нет
  useEffect(() => {
    const notes = chats.find(c => c.id === 'notes');
    if (!notes) {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const sharedSecret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
      // Notes chat: self-only, use initForNotes which bootstraps both chain keys internally
      const notesRootKey = deriveRootKey(sharedSecret);
      const notesRatchet = DoubleRatchet.initForNotes(notesRootKey);
      addChat({
        id: 'notes',
        type: 'private',
        name: t('connectModal.notes'),
        lastMsg: 'E2EE_SECURE_CHANNEL_READY',
        online: true,
        sharedSecret,
        isChatInitiator: true,
        ratchetState: notesRatchet.getState(),
        avatarUrl: undefined,
      });
    } else {
      // Если чат заметок уже есть, но имя не совпадает с локализацией, обновляем
      const expectedName = t('connectModal.notes');
      if (notes.name !== expectedName) {
        updateChat('notes', { name: expectedName });
      }
    }
  }, [chats, addChat, updateChat, t]);

  useEffect(() => {
    orbitosService.initOrbitosChat(t);
    supportService.initSupportChat(t, myCode);
  }, [t, myCode]);

  useEffect(() => {
    if (activeChatId === supportService.BOT_ID) {
      supportService.checkAdminStatus();
    }
  }, [activeChatId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        closeChatStore();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeChatStore]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 680);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node))
        setChatContextMenu((prev) => ({ ...prev, visible: false }));
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!myCode) setMyCode(generateRandomCode());
  }, []);

  useEffect(() => {
    if (step === 'main' && nickname && myCode) {
      const myKeys = generateKeyPair();
      supabaseService.publishPublicProfile(myCode, nickname, avatarUrl || null, myKeys.publicKey, hideProfileId).catch(() => {});
    }
  }, [step, nickname, myCode, avatarUrl, hideProfileId]);

  useEffect(() => {
    const pusher = getPusher();
    (window as any).__orbitaPusher = pusher;

    const updateConn = () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const pusherConnected = pusher.connection.state === 'connected';
      useConnectionStore.getState().setServerConnected(isOnline && pusherConnected);
    };

    pusher.connection.bind('connected', updateConn);
    pusher.connection.bind('disconnected', updateConn);
    pusher.connection.bind('unavailable', updateConn);
    pusher.connection.bind('connecting', updateConn);
    pusher.connection.bind('state_change', updateConn);

    updateConn();

    return () => {
      pusher.connection.unbind('connected', updateConn);
      pusher.connection.unbind('disconnected', updateConn);
      pusher.connection.unbind('unavailable', updateConn);
      pusher.connection.unbind('connecting', updateConn);
      pusher.connection.unbind('state_change', updateConn);
    };
  }, []);

  useEffect(() => {
    const pusher = getPusher();
    const groupOwnerChannels: any[] = [];

    chats.forEach((chat) => {
      if (chat.type !== 'group' || !chat.inviteCode) return;
      if (chat.role !== 'owner' && chat.role !== 'admin') return;

      const channelName = `private-group-invite-${chat.inviteCode}`;
      const ch = pusher.subscribe(channelName);

      const handleJoinRequest = (data: any) => {
        const currentChat = useChatStore.getState().chats.find(c => c.id === chat.id);
        if (!currentChat) return;

        if (currentChat.inviteCodeTTL && Date.now() > currentChat.inviteCodeTTL) {
          ch.trigger('client-invite-response', { error: t('connectModal.invite_expired') });
          return;
        }

        const alreadyMember = currentChat.members?.some(m => m.nickname === data.nickname);
        if (alreadyMember) {
          ch.trigger('client-invite-response', {
            chatId: currentChat.id,
            name: currentChat.name,
            sharedSecret: currentChat.sharedSecret,
            members: currentChat.members,
            inviteCodeTTL: currentChat.inviteCodeTTL,
          });
          return;
        }

        const newMember = { nickname: data.nickname, role: 'member' as const, lastSeen: Date.now() };
        const updatedMembers = [...(currentChat.members || []), newMember];
        updateChat(currentChat.id, { members: updatedMembers });

        const respond = () => ch.trigger('client-invite-response', {
          chatId: currentChat.id,
          name: currentChat.name,
          sharedSecret: currentChat.sharedSecret,
          members: updatedMembers,
          inviteCodeTTL: currentChat.inviteCodeTTL,
        });

        if (ch.subscribed) respond();
        else ch.bind('pusher:subscription_succeeded', respond);

        const groupChannel = pusher.subscribe(`presence-group-${currentChat.id}`);
        const notifyMembers = () => groupChannel.trigger('client-message', {
          type: 'member-joined',
          nickname: data.nickname,
          members: updatedMembers,
        });
        if (groupChannel.subscribed) notifyMembers();
        else groupChannel.bind('pusher:subscription_succeeded', notifyMembers);
      };

      ch.bind('client-join-request', handleJoinRequest);
      groupOwnerChannels.push({ ch, channelName });
    });

    return () => {
      groupOwnerChannels.forEach(({ ch, channelName }) => {
        ch.unbind_all();
        pusher.unsubscribe(channelName);
      });
    };
  }, [chats.map(c => c.id + (c.inviteCode || '')).join(','), updateChat, t]);

  useEffect(() => {
    if (!myCode && !nickname) return;
    const pusher = getPusher();
    const unsubscribes: (() => void)[] = [];
    const keysToListen = Array.from(new Set([
      myCode,
      myCode?.toUpperCase(),
      myCode?.toLowerCase(),
      nickname,
      nickname?.toUpperCase(),
      nickname?.toLowerCase(),
    ].filter(Boolean))) as string[];

    const handleRequest = (data: any) => {
      console.log('[Handshake] Real-time request received:', data);
      const chatId = data.chatId;

      const existing = useChatStore
        .getState()
        .chats.find(
          (c) =>
            c.type === 'private' &&
            (c.id === chatId || c.name === data.senderNickname)
        );
      if (existing) {
        console.log('Ignoring duplicate handshake request from', data.senderNickname);
        return;
      }

      const myKeys = generateKeyPair();
      const sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
      const rootKey = deriveRootKey(sharedSecret);

      const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);

      addChat({
        id: chatId,
        type: 'private',
        name: data.senderNickname,
        lastMsg: 'E2EE_SECURE_CHANNEL_READY',
        online: false,
        sharedSecret: sharedSecret,
        isChatInitiator: false,
        ratchetState: ratchet.getState(),
        avatarUrl: data.avatarUrl ?? undefined,
        peerCode: data.senderCode,
      });

      ablyService.sendHandshakeConfirm(data.senderCode, {
        nickname,
        publicKey: myKeys.publicKey,
        chatId,
        avatarUrl,
      }).catch((err) => console.warn('[Ably] Handshake confirm send error:', err));

      const pusher = getPusher();
      const senderChannel = pusher.subscribe(`private-handshake-${data.senderCode}`);
      const sendConfirm = () =>
        senderChannel.trigger('client-identity-confirmed', {
          nickname,
          publicKey: myKeys.publicKey,
          chatId,
          avatarUrl,
        });

      if (senderChannel.subscribed) sendConfirm();
      else senderChannel.bind('pusher:subscription_succeeded', sendConfirm);

      supabaseService.sendOfflineHandshake(
        chatId,
        `CONFIRM:${data.senderCode}`,
        nickname,
        myKeys.publicKey,
        avatarUrl,
        myCode
      ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));

      if (data.senderNickname && data.senderNickname !== data.senderCode) {
        supabaseService.sendOfflineHandshake(
          chatId,
          `CONFIRM:${data.senderNickname}`,
          nickname,
          myKeys.publicKey,
          avatarUrl,
          myCode
        ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
      }

      if (data.senderCode) {
        revalidateDevelopersOnConnection(data.senderCode);
      }
    };

    const handleConfirm = (data: any) => {
      if (!data || !data.chatId || !data.publicKey) return;
      console.log('[Handshake] Real-time confirmation received for chat:', data.chatId, data);
      const currentChats = useChatStore.getState().chats;
      const existing = currentChats.find(c => c.id === data.chatId);
      if (!existing) return;

      const peerCode = data.senderCode || existing.peerCode || (existing.name && existing.name.length === 36 ? existing.name : undefined);
      if (peerCode) {
        revalidateDevelopersOnConnection(peerCode);
      }

      const updates: Partial<Chat> = {
        name: data.nickname || existing.name,
        avatarUrl: data.avatarUrl ?? existing.avatarUrl,
        peerCode: peerCode,
      };

      if (existing.sharedSecret && !existing.ratchetState) {
        const initiatorPrivateKey = existing.sharedSecret;
        const initiatorPublicKey = derivePublicKey(initiatorPrivateKey);
        const sharedSecret = deriveSharedSecret(initiatorPrivateKey, data.publicKey);
        const rootKey = deriveRootKey(sharedSecret);
        const ratchet = DoubleRatchet.initSymmetric(rootKey, initiatorPrivateKey, initiatorPublicKey, data.publicKey);

        updates.sharedSecret = sharedSecret;
        updates.ratchetState = ratchet.getState();
        updates.lastMsg = 'E2EE_SECURE_CHANNEL_READY';
      }

      updateChat(data.chatId, updates);
    };

    keysToListen.forEach((key) => {
      const channel = pusher.subscribe(`private-handshake-${key}`);
      channel.bind('client-request-identity', handleRequest);
      channel.bind('client-identity-confirmed', handleConfirm);
      const unsubAbly = ablyService.subscribeToHandshake(key, handleRequest, handleConfirm);

      unsubscribes.push(() => {
        unsubAbly();
        channel.unbind_all();
        pusher.unsubscribe(`private-handshake-${key}`);
      });
    });

    return () => {
      unsubscribes.forEach((u) => u());
    };
  }, [myCode, nickname, addIncomingFriendRequest, updateChat]);

  const chatPresenceKey = useMemo(() => {
    return chats
      .filter((c) => c.type === 'private' && c.id !== 'notes')
      .map((c) => `${c.id}:${c.peerCode || ''}:${c.name || ''}`)
      .join('|');
  }, [chats]);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    chats.forEach((chat) => {
      if (chat.type === 'private' && chat.id !== 'notes') {
        const targetIds = Array.from(
          new Set([chat.peerCode, chat.name].filter((id): id is string => Boolean(id && id.trim() && id !== 'Unknown' && id !== 'notes')))
        );
        const presenceStates = new Map<string, boolean>();

        targetIds.forEach((targetId) => {
          const unsubscribe = ablyService.subscribeToUserPresence(
            targetId,
            (isOnline, lastSeen) => {
              presenceStates.set(targetId, isOnline);
              const anyOnline = Array.from(presenceStates.values()).some(Boolean);
              const current = useChatStore.getState().chats.find(c => c.id === chat.id);
              if (current && current.online === anyOnline && (lastSeen ? current.lastSeen === lastSeen : true)) return;
              updateChat(chat.id, {
                online: anyOnline,
                ...(lastSeen ? { lastSeen } : {}),
              });
            }
          );
          unsubscribes.push(unsubscribe);
        });
      }
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [chatPresenceKey, updateChat]);

  const handleAcceptFriendRequest = useCallback(async (req: IncomingFriendRequest) => {
    const myKeys = generateKeyPair();
    const sharedSecret = deriveSharedSecret(myKeys.privateKey, req.senderPublicKey);
    const rootKey = deriveRootKey(sharedSecret);

    const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, req.senderPublicKey);

    addChat({
      id: req.chatId,
      type: 'private',
      name: req.senderNickname,
      lastMsg: 'E2EE_SECURE_CHANNEL_READY',
      online: false,
      sharedSecret: sharedSecret,
      isChatInitiator: false,
      ratchetState: ratchet.getState(),
      avatarUrl: req.avatarUrl ?? undefined,
      peerCode: req.senderCode,
    });

    // Send confirmation over Ably
    ablyService.sendHandshakeConfirm(req.senderCode, {
      nickname,
      publicKey: myKeys.publicKey,
      chatId: req.chatId,
      avatarUrl,
    }).catch((err) => console.warn('[Ably] Handshake confirm send error:', err));

    // Send confirmation over Pusher
    const pusher = getPusher();
    const senderChannel = pusher.subscribe(`private-handshake-${req.senderCode}`);
    const sendConfirm = () =>
      senderChannel.trigger('client-identity-confirmed', {
        nickname,
        publicKey: myKeys.publicKey,
        chatId: req.chatId,
        avatarUrl,
      });

    if (senderChannel.subscribed) sendConfirm();
    else senderChannel.bind('pusher:subscription_succeeded', sendConfirm);

    // Save offline confirmation for initiator in Supabase (under both senderCode and senderNickname)
    supabaseService.sendOfflineHandshake(
      req.chatId,
      `CONFIRM:${req.senderCode}`,
      nickname,
      myKeys.publicKey,
      avatarUrl,
      myCode
    ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));

    if (req.senderNickname && req.senderNickname !== req.senderCode) {
      supabaseService.sendOfflineHandshake(
        req.chatId,
        `CONFIRM:${req.senderNickname}`,
        nickname,
        myKeys.publicKey,
        avatarUrl,
        myCode
      ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
    }

    try {
      await supabaseService.markHandshakeConsumed(req.id);
    } catch {}

    removeIncomingFriendRequest(req.id);
    setShowFriendRequestsModal(false);
    setActiveChat(req.chatId);
  }, [nickname, avatarUrl, addChat, removeIncomingFriendRequest, setActiveChat]);

  const handleRejectFriendRequest = useCallback(async (req: IncomingFriendRequest) => {
    try {
      await supabaseService.markHandshakeConsumed(req.id);
    } catch {}
    removeIncomingFriendRequest(req.id);
  }, [removeIncomingFriendRequest]);

  const loadPendingHandshakes = useCallback(async () => {
    if (!nickname && !myCode) return;
    const keysToCheck = Array.from(new Set([myCode, nickname].filter(Boolean))) as string[];
    const processedIds = new Set<string>();

    try {
      // 1. Incoming handshake requests (checking both myCode and nickname)
      for (const key of keysToCheck) {
        const records = await supabaseService.getPendingHandshakes(key);
        for (const hs of records) {
          if (processedIds.has(hs.id)) continue;
          processedIds.add(hs.id);

          const currentChats = useChatStore.getState().chats;
          if (currentChats.some(c => c.id === hs.chat_id)) {
            await supabaseService.markHandshakeConsumed(hs.id);
            continue;
          }

          const myKeys = generateKeyPair();
          const sharedSecret = deriveSharedSecret(myKeys.privateKey, hs.sender_public_key);
          const rootKey = deriveRootKey(sharedSecret);

          const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, hs.sender_public_key);
          const peerCodeForOffline = hs.sender_code || hs.recipient_code;

          addChat({
            id: hs.chat_id,
            type: 'private',
            name: hs.sender_nickname,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: sharedSecret,
            isChatInitiator: false,
            ratchetState: ratchet.getState(),
            avatarUrl: hs.sender_avatar_url ?? undefined,
            peerCode: peerCodeForOffline,
          });

          if (peerCodeForOffline) {
            supabaseService.sendOfflineHandshake(
              hs.chat_id,
              `CONFIRM:${peerCodeForOffline}`,
              nickname,
              myKeys.publicKey,
              avatarUrl,
              myCode
            ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by code:', err));
          }

          if (hs.sender_nickname && hs.sender_nickname !== peerCodeForOffline) {
            supabaseService.sendOfflineHandshake(
              hs.chat_id,
              `CONFIRM:${hs.sender_nickname}`,
              nickname,
              myKeys.publicKey,
              avatarUrl,
              myCode
            ).catch((err) => console.warn('[Handshake] Failed to save offline confirmation by nick:', err));
          }

          await supabaseService.markHandshakeConsumed(hs.id);

          if (hs.sender_code) {
            revalidateDevelopersOnConnection(hs.sender_code);
          }
        }
      }

      const confirmKeys = keysToCheck.map(k => `CONFIRM:${k}`);

      for (const key of confirmKeys) {
        const confirmations = await supabaseService.getPendingHandshakes(key);
        for (const conf of confirmations) {
          const currentChats = useChatStore.getState().chats;
          const existing = currentChats.find(c => c.id === conf.chat_id);

          if (!existing) {
            console.warn('[Handshake] Confirmation received but chat not found, consuming:', conf.chat_id);
            await supabaseService.markHandshakeConsumed(conf.id).catch(() => {});
            continue;
          }

          if (existing.sharedSecret && !existing.ratchetState) {
            const initiatorPrivateKey = existing.sharedSecret;
            const initiatorPublicKey = derivePublicKey(initiatorPrivateKey);
            const sharedSecret = deriveSharedSecret(initiatorPrivateKey, conf.sender_public_key);
            const rootKey = deriveRootKey(sharedSecret);
            const ratchet = DoubleRatchet.initSymmetric(rootKey, initiatorPrivateKey, initiatorPublicKey, conf.sender_public_key);

            const peerCode = conf.sender_code || existing.peerCode || (existing.name && existing.name.length === 36 ? existing.name : undefined);
            if (peerCode) {
              revalidateDevelopersOnConnection(peerCode);
            }
            updateChat(conf.chat_id, {
              name: conf.sender_nickname,
              lastMsg: 'E2EE_SECURE_CHANNEL_READY',
              online: false,
              sharedSecret: sharedSecret,
              ratchetState: ratchet.getState(),
              avatarUrl: conf.sender_avatar_url ?? undefined,
              peerCode: peerCode,
            });

            await supabaseService.markHandshakeConsumed(conf.id);
          } else if (existing.ratchetState) {
            await supabaseService.markHandshakeConsumed(conf.id);
          }
        }
      }
    } catch (err) {
      console.error('[MainLayout] Failed to load pending handshakes:', err);
    }
  }, [nickname, myCode, addIncomingFriendRequest, updateChat]);

  const loadPendingMessages = useCallback(async () => {
    if (!nickname && !myCode) return;
    if (isLoadingPendingRef.current) {
      console.log('[MainLayout] loadPendingMessages already running, skipping');
      return;
    }
    isLoadingPendingRef.current = true;
    try {
      const keysToCheck = Array.from(new Set([nickname, myCode].filter(Boolean))) as string[];
      for (const key of keysToCheck) {
        const records = await supabaseService.getPendingMessages(key);
        if (records.length === 0) continue;

        for (const record of records) {
          if (processedMessageIds.current.has(record.id)) {
            continue;
          }

        const currentChats = useChatStore.getState().chats;
        let chat = currentChats.find(c => c.id === record.chat_id);
        if (!chat) {
          const restored = useChatStore.getState().restoreDeletedChat(record.chat_id);
          if (restored) {
            chat = restored;
            if (chat.sharedSecret) {
              subscribeToChat(chat.id, chat.sharedSecret);
              subscribeToDeliveryUpdates(chat.id);
            }
          }
        }
        if (!chat || !chat.sharedSecret || !chat.ratchetState) {
          processedMessageIds.current.add(record.id);
          supabaseService.markMessageDelivered(record.id).catch(() => {});
          continue;
        }

        const ratchet = DoubleRatchet.fromState(chat.ratchetState);
        const decrypted = await ratchet.decrypt(
          record.ciphertext,
          record.message_index,
          record.dh_public_key,
        );
        if (decrypted === null) {
          processedMessageIds.current.add(record.id);
          supabaseService.markMessageDelivered(record.id).catch(() => {});
          continue;
        }
        updateChat(record.chat_id, { ratchetState: ratchet.getState() });

        let messageData;
        try {
          messageData = JSON.parse(decrypted);
        } catch {
          processedMessageIds.current.add(record.id);
          supabaseService.markMessageDelivered(record.id).catch(() => {});
          continue;
        }

        if (messageData?.type === 'delete-message' || messageData?.type === 'delete') {
          processedMessageIds.current.add(record.id);
          const targetChatId = messageData.chatId || record.chat_id;
          const targetId = messageData.targetMessageId || messageData.messageId;
          if (targetId) {
            useChatStore.getState().deleteMessage(targetChatId, targetId);
          }
          try {
            await supabaseService.markMessageDelivered(record.id);
          } catch {}
          continue;
        }

        if (messageData?.type === 'receipt' || messageData?.type === 'read' || messageData?.receiptType === 'read') {
          processedMessageIds.current.add(record.id);
          const targetChatId = messageData.chatId || record.chat_id;
          const targetIds = new Set((messageData.messageIds || [messageData.messageId]).filter(Boolean));
          const targetTime = messageData.time;

          const currentMessages = useChatStore.getState().messagesByChatId[targetChatId] || [];
          const updatedMessages = currentMessages.map((m) => {
            const isTarget = (m.id && targetIds.has(m.id)) || (targetTime && m.time <= targetTime && m.isOutgoing);
            if (isTarget) {
              return { ...m, read: true, status: 'read' as const, readAt: messageData.time || Date.now() };
            }
            return m;
          });

          useChatStore.setState((s) => ({
            messagesByChatId: {
              ...s.messagesByChatId,
              [targetChatId]: updatedMessages,
            },
          }));

          try {
            await supabaseService.markMessageDelivered(record.id);
          } catch {}
          continue;
        }

        const msgId = messageData?.id || record.id;

        const isActiveChat = useChatStore.getState().activeChatId === record.chat_id && typeof document !== 'undefined' && document.visibilityState === 'visible';
        addMessage(record.chat_id, {
          id: msgId,
          senderId: record.sender_id,
          sender: messageData?.sender || chat.name || record.sender_id,
          isOutgoing: false,
          text: messageData.text || '',
          time: new Date(record.created_at).getTime(),
          read: isActiveChat,
          mediaType: messageData.mediaType || null,
          mediaUrl: messageData.mediaUrl || null,
          mediaName: messageData.mediaName || null,
          mediaKey: messageData.mediaKey || null,
          mime: messageData.mime || null,
          mediaItems: messageData.mediaItems || undefined,
          audioMetadata: messageData.audioMetadata || undefined,
          duration: messageData.duration || undefined,
          waveform: messageData.waveform || undefined,
          linkPreview: messageData.linkPreview || undefined,
        });

        if (isActiveChat) {
          sendEncryptedReadReceipt(record.chat_id, [msgId], Date.now());
        }

        try {
          await supabaseService.markMessageDelivered(record.id);
        } catch (err) {
          console.error('[MainLayout] Failed to mark delivered:', err);
        }
        }
      }

      for (const key of keysToCheck) {
        try {
          const nonRecords = await supabaseService.getPendingNonMessages(key);
          for (const record of nonRecords) {
            if (processedMessageIds.current.has(record.id)) continue;
            processedMessageIds.current.add(record.id);

            let messageData;
            try {
              messageData = JSON.parse(record.ciphertext);
            } catch {
              await supabaseService.markNonMessageDelivered(record.id);
              continue;
            }

            const currentChats = useChatStore.getState().chats;
            const chat = currentChats.find(c => c.id === record.chat_id);
            if (!chat) {
              await supabaseService.markNonMessageDelivered(record.id);
              continue;
            }

            if (messageData?.type === 'delete-message' || messageData?.type === 'delete') {
              const targetId = messageData.targetMessageId || messageData.messageId;
              if (targetId) {
                useChatStore.getState().deleteMessage(record.chat_id, targetId);
              }
              await supabaseService.markNonMessageDelivered(record.id);
              continue;
            }

            if (messageData?.type === 'profile-update') {
              const myCode = useChatStore.getState().myCode;
              const myNickname = useAuthStore.getState().nickname;
              if (
                (messageData.sender && (messageData.sender === myNickname || messageData.sender === nickname)) ||
                (messageData.senderCode && myCode && messageData.senderCode === myCode) ||
                (messageData.senderId && myCode && messageData.senderId === myCode) ||
                (messageData.nickname && (messageData.nickname === myNickname || messageData.nickname === nickname))
              ) {
                await supabaseService.markNonMessageDelivered(record.id);
                continue;
              }
              const updates: Partial<Chat> = {};
              if (messageData.avatarUrl !== undefined) updates.avatarUrl = messageData.avatarUrl;
              if (messageData.nickname !== undefined && messageData.nickname !== myNickname && messageData.nickname !== nickname) updates.name = messageData.nickname;
              if (messageData.hideProfileId !== undefined) {
                updates.hideProfileId = Boolean(messageData.hideProfileId);
                if (updates.hideProfileId) updates.peerCode = undefined;
              }
              if (!updates.hideProfileId && messageData.senderCode && (!myCode || messageData.senderCode !== myCode)) {
                updates.peerCode = messageData.senderCode;
              }
              if (Object.keys(updates).length > 0) {
                updateChat(record.chat_id, updates);
              }
              await supabaseService.markNonMessageDelivered(record.id);
              continue;
            }

            const msgId = messageData?.id || record.id;
            const isNonActiveChat = useChatStore.getState().activeChatId === record.chat_id && typeof document !== 'undefined' && document.visibilityState === 'visible';
            addMessage(record.chat_id, {
              id: msgId,
              senderId: record.sender_id,
              sender: messageData?.sender || chat.name || record.sender_id,
              isOutgoing: false,
              text: messageData.text || '',
              time: new Date(record.created_at).getTime(),
              read: isNonActiveChat,
              mediaType: messageData.mediaType || null,
              mediaUrl: messageData.mediaUrl || null,
              mediaName: messageData.mediaName || null,
              mediaKey: messageData.mediaKey || null,
              mime: messageData.mime || null,
              mediaItems: messageData.mediaItems || undefined,
              audioMetadata: messageData.audioMetadata || undefined,
              duration: messageData.duration || undefined,
              waveform: messageData.waveform || undefined,
              linkPreview: messageData.linkPreview || undefined,
            });

            await supabaseService.markNonMessageDelivered(record.id);
          }
        } catch (err) {
          console.warn('[MainLayout] Failed to load non_messages for', key, err);
        }
      }
    } catch (err) {
      console.error('[MainLayout] Failed to load pending messages:', err);
    } finally {
      isLoadingPendingRef.current = false;
    }
  }, [nickname, myCode, addMessage, updateChat]);

  const checkedRecoveryChatsRef = useRef<Set<string>>(new Set());

  const recoverCorruptedFriendProfiles = useCallback(async () => {
    const currentChats = useChatStore.getState().chats;
    const privateChats = currentChats.filter((c) => c.type === 'private' && c.id !== 'notes');
    if (privateChats.length === 0) return;

    for (const chat of privateChats) {
      if (checkedRecoveryChatsRef.current.has(chat.id)) continue;
      const is36CharCode = Boolean(chat.name && chat.name.length === 36 && !chat.name.includes(' '));
      const isCorruptedName =
        (nickname && chat.name === nickname) ||
        chat.name === 'Peppe' ||
        chat.name === 'Saizzi' ||
        chat.name === 'undefined' ||
        chat.name === 'null' ||
        is36CharCode;

      const isCorruptedAvatar = Boolean(
        (avatarUrl && chat.avatarUrl === avatarUrl) ||
        chat.avatarUrl === 'undefined' ||
        chat.avatarUrl === 'null'
      );

      const isCorruptedPeerCode = Boolean(myCode && chat.peerCode === myCode);

      if (!isCorruptedName && !isCorruptedAvatar && !isCorruptedPeerCode) continue;

      let recoveredName: string | undefined;
      let recoveredAvatar: string | undefined = isCorruptedAvatar ? undefined : chat.avatarUrl;
      let recoveredPeerCode: string | undefined = (chat.peerCode && chat.peerCode !== 'undefined' && chat.peerCode !== 'null' && (!myCode || chat.peerCode !== myCode)) ? chat.peerCode : undefined;

      const msgs = useChatStore.getState().messagesByChatId[chat.id] || [];
      for (const m of msgs) {
        if (
          m.sender &&
          m.sender !== nickname &&
          m.sender !== 'Peppe' &&
          m.sender !== 'Saizzi' &&
          m.sender !== 'YOU' &&
          m.sender !== 'undefined' &&
          m.sender !== 'null' &&
          m.sender.length !== 36
        ) {
          recoveredName = m.sender.trim();
        }
        if (
          m.senderId &&
          myCode &&
          m.senderId !== myCode &&
          m.senderId !== 'undefined' &&
          m.senderId !== 'null' &&
          m.senderId.length >= 8
        ) {
          recoveredPeerCode = m.senderId.trim();
        }
        if (recoveredName && recoveredPeerCode) break;
      }

      try {
        const handshakes = await supabaseService.getHandshakeRecordsForChat(chat.id);
        for (const hs of handshakes) {
          if (hs.sender_code && myCode && hs.sender_code !== myCode && hs.sender_code !== 'undefined' && hs.sender_code !== 'null') {
            if (!recoveredName && hs.sender_nickname && hs.sender_nickname.length !== 36 && hs.sender_nickname !== 'undefined' && hs.sender_nickname !== 'null') {
              recoveredName = hs.sender_nickname.trim();
            }
            if (!recoveredAvatar && hs.sender_avatar_url && hs.sender_avatar_url !== 'undefined' && hs.sender_avatar_url !== 'null' && hs.sender_avatar_url.trim()) {
              recoveredAvatar = hs.sender_avatar_url.trim();
            }
            if (!recoveredPeerCode) {
              recoveredPeerCode = hs.sender_code.trim();
            }
            break;
          } else if (
            hs.sender_nickname &&
            hs.sender_nickname !== nickname &&
            hs.sender_nickname !== 'Peppe' &&
            hs.sender_nickname !== 'Saizzi' &&
            hs.sender_nickname !== 'undefined' &&
            hs.sender_nickname !== 'null' &&
            hs.sender_nickname.length !== 36
          ) {
            if (!recoveredName) recoveredName = hs.sender_nickname.trim();
            if (!recoveredAvatar && hs.sender_avatar_url && hs.sender_avatar_url !== 'undefined' && hs.sender_avatar_url !== 'null' && hs.sender_avatar_url.trim()) {
              recoveredAvatar = hs.sender_avatar_url.trim();
            }
          }
          if (
            hs.recipient_code &&
            myCode &&
            hs.recipient_code !== myCode &&
            !hs.recipient_code.startsWith('CONFIRM:') &&
            hs.recipient_code !== 'undefined' &&
            hs.recipient_code !== 'null'
          ) {
            if (!recoveredPeerCode) {
              recoveredPeerCode = hs.recipient_code.trim();
            }
          }
        }
      } catch (err) {
        console.warn('[Recovery] Failed to fetch handshake for chat', chat.id, err);
      }

      const updates: Partial<Chat> = {};
      const targetCode = (recoveredPeerCode || (!myCode || chat.peerCode !== myCode ? chat.peerCode : undefined))?.trim();
      if (targetCode && targetCode !== 'undefined' && targetCode !== 'null' && (!myCode || targetCode !== myCode)) {
        try {
          const profile = await supabaseService.lookupPublicProfile(targetCode);
          if (profile) {
            if (profile.hide_profile_id !== undefined && profile.hide_profile_id !== null) {
              updates.hideProfileId = Boolean(profile.hide_profile_id);
            }
            if (!recoveredName && profile.nickname && profile.nickname.length !== 36 && profile.nickname !== 'undefined' && profile.nickname !== 'null') {
              recoveredName = profile.nickname.trim();
            }
            if (profile.avatar_url && profile.avatar_url !== 'undefined' && profile.avatar_url !== 'null' && profile.avatar_url.trim()) {
              recoveredAvatar = profile.avatar_url.trim();
            }
          }
        } catch {}
      }

      if (isCorruptedAvatar && (recoveredAvatar === avatarUrl || recoveredAvatar === 'undefined' || recoveredAvatar === 'null')) {
        recoveredAvatar = undefined;
      }

      const isHidden = updates.hideProfileId !== undefined ? updates.hideProfileId : Boolean(chat.hideProfileId);

      const updatesFinal: Partial<Chat> = { ...updates };
      if (isHidden) {
        updatesFinal.hideProfileId = true;
        updatesFinal.peerCode = undefined;
      }
      if (recoveredName && recoveredName !== chat.name && recoveredName !== 'undefined' && recoveredName !== 'null') {
        updatesFinal.name = recoveredName;
      }
      if (isCorruptedAvatar) {
        if (recoveredAvatar !== chat.avatarUrl) {
          updatesFinal.avatarUrl = recoveredAvatar;
        }
      } else if (recoveredAvatar && recoveredAvatar !== chat.avatarUrl && recoveredAvatar !== 'undefined' && recoveredAvatar !== 'null') {
        updatesFinal.avatarUrl = recoveredAvatar;
      }
      if (!isHidden) {
        if (recoveredPeerCode && recoveredPeerCode !== chat.peerCode && recoveredPeerCode !== 'undefined' && recoveredPeerCode !== 'null') {
          updatesFinal.peerCode = recoveredPeerCode;
        } else if (chat.peerCode && myCode && chat.peerCode === myCode && !recoveredPeerCode) {
          updatesFinal.peerCode = undefined;
        }
      }

      if (Object.keys(updatesFinal).length > 0) {
        console.log('[Recovery] Cleaned friend profile for chat', chat.id, updatesFinal);
        updateChat(chat.id, updatesFinal);
      }

      const finalName = updatesFinal.name || chat.name;
      const finalAvatar = updatesFinal.avatarUrl !== undefined ? updatesFinal.avatarUrl : chat.avatarUrl;
      const finalPeerCode = updatesFinal.peerCode !== undefined ? updatesFinal.peerCode : chat.peerCode;
      const stillCorrupted =
        (nickname && finalName === nickname) ||
        finalName === 'Peppe' ||
        finalName === 'Saizzi' ||
        (avatarUrl && finalAvatar === avatarUrl) ||
        (myCode && finalPeerCode === myCode);
      if (!stillCorrupted) {
        checkedRecoveryChatsRef.current.add(chat.id);
      }
    }
  }, [nickname, avatarUrl, myCode, updateChat]);

  const syncOfflineFriendProfiles = useCallback(async () => {
    const myNickname = useAuthStore.getState().nickname;
    const myCode = useChatStore.getState().myCode;
    const currentChats = useChatStore.getState().chats;
    const privateChats = currentChats.filter((c) => c.type === 'private' && c.id !== 'notes');
    for (const chat of privateChats) {
      try {
        const update = await supabaseService.getLatestProfileUpdate(chat.id, myCode || undefined);
        const updates: Partial<Chat> = {};
        const isMyOwnUpdate = update && (
          (myCode && update.sender_code === myCode) ||
          (myNickname && update.nickname === myNickname) ||
          (nickname && update.nickname === nickname)
        );
        const targetPeerCode = (chat.peerCode && chat.peerCode !== myCode)
          ? chat.peerCode
          : (update?.sender_code && update.sender_code !== myCode)
            ? update.sender_code
            : (chat.name && chat.name.length === 36 && chat.name !== myCode)
              ? chat.name
              : undefined;

        if (update && !isMyOwnUpdate) {
          if (update.nickname && update.nickname !== chat.name && update.nickname !== myNickname && update.nickname !== nickname) updates.name = update.nickname;
          if (update.avatar_url !== undefined && update.avatar_url !== chat.avatarUrl) updates.avatarUrl = update.avatar_url || undefined;
          if (update.hide_profile_id !== undefined && update.hide_profile_id !== null) {
            updates.hideProfileId = Boolean(update.hide_profile_id);
            if (updates.hideProfileId) updates.peerCode = undefined;
          }
          if (!updates.hideProfileId && !chat.hideProfileId && update.sender_code && update.sender_code !== myCode && !chat.peerCode) {
            updates.peerCode = update.sender_code;
          }
        }

        if (updates.hideProfileId === undefined && targetPeerCode) {
          const pub = await supabaseService.lookupPublicProfile(targetPeerCode);
          if (pub) {
            if (pub.nickname && pub.nickname !== chat.name && pub.nickname !== myNickname && pub.nickname !== nickname && !updates.name) updates.name = pub.nickname;
            if (pub.avatar_url !== undefined && pub.avatar_url !== chat.avatarUrl && !updates.avatarUrl) updates.avatarUrl = pub.avatar_url || undefined;
            if (pub.hide_profile_id !== undefined && pub.hide_profile_id !== null) {
              updates.hideProfileId = Boolean(pub.hide_profile_id);
              if (updates.hideProfileId) updates.peerCode = undefined;
            }
          }
        }
        if (Object.keys(updates).length > 0) {
          updateChat(chat.id, updates);
        }
      } catch {}
    }

    const currentChannels = useChatStore.getState().chats.filter((c) => c.type === 'channel');
    for (const ch of currentChannels) {
      channelService.getChannel(ch.id).then((info) => {
        if (info) {
          const current = useChatStore.getState().chats.find((c) => c.id === ch.id);
          if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
            return;
          }
          const myNick = (useAuthStore.getState().nickname || '').trim().toLowerCase();
          const isCreator = Boolean(
            current?.isOwner ||
            current?.role === 'owner' ||
            (info.creatorNickname && myNick && info.creatorNickname.trim().toLowerCase() === myNick) ||
            (ch.creatorNickname && myNick && ch.creatorNickname.trim().toLowerCase() === myNick)
          );
          const updates: Partial<Chat> = {
            subscribersCount: info.subscribersCount,
            creatorNickname: info.creatorNickname || ch.creatorNickname,
          };
          if (isCreator) {
            updates.isOwner = true;
          }
          if (!isCreator) {
            updates.name = info.name;
            updates.description = info.description;
            updates.avatarUrl = info.avatarUrl || undefined;
            if (info.updatedAt) updates.updatedAt = info.updatedAt;
          } else {
            if (info.name && !current?.name) updates.name = info.name;
            if (info.description && !current?.description) updates.description = info.description;
            if (info.avatarUrl && !current?.avatarUrl) updates.avatarUrl = info.avatarUrl;
          }
          useChatStore.getState().updateChat(ch.id, updates);
        }
      }).catch(() => {});
    }
  }, [updateChat]);

  const loadPendingHandshakesRef = useRef(loadPendingHandshakes);
  loadPendingHandshakesRef.current = loadPendingHandshakes;
  const loadPendingMessagesRef = useRef(loadPendingMessages);
  loadPendingMessagesRef.current = loadPendingMessages;
  const recoverProfilesRef = useRef(recoverCorruptedFriendProfiles);
  recoverProfilesRef.current = recoverCorruptedFriendProfiles;
  const syncOfflineProfilesRef = useRef(syncOfflineFriendProfiles);
  syncOfflineProfilesRef.current = syncOfflineFriendProfiles;

  const lastSyncTimeRef = useRef<number>(0);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    if (step !== 'main' || (!nickname && !myCode)) return;

    let isDestroyed = false;

    const syncAll = async (force = false) => {
      if (isDestroyed || isSyncingRef.current) return;
      const now = Date.now();
      if (!force && now - lastSyncTimeRef.current < 15000) return;
      lastSyncTimeRef.current = now;
      isSyncingRef.current = true;

      try {
        const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        const fastestGateway = await gatewayManager.selectFastestGateway(force);
        const isGatewayHealthy = fastestGateway && fastestGateway.status === 'healthy';

        if (isGatewayHealthy) {
          setIsNetworkOnline(true);
        } else if (!navOnline) {
          setIsNetworkOnline(false);
          useConnectionStore.getState().setServerConnected(false);
          return;
        }

        const pusher = getPusher();
        const pusherConnected = pusher.connection.state === 'connected';
        if (pusher.connection.state === 'disconnected' || pusher.connection.state === 'unavailable' || pusher.connection.state === 'failed') {
          try {
            pusher.connect();
          } catch (e) {
            console.warn('[Reconnect] Pusher connect error:', e);
          }
        }

        const ablyState = ablyService.getConnectionState();
        if (ablyState === 'disconnected' || ablyState === 'suspended' || ablyState === 'failed') {
          ablyService.reconnect();
        } else if (ablyState === 'initialized' && (nickname || myCode)) {
          ablyService.connect(myCode || nickname).catch(() => {});
        }

        await Promise.allSettled([
          loadPendingHandshakesRef.current(),
          loadPendingMessagesRef.current(),
          syncOfflineProfilesRef.current(),
        ]);

        const isConnected = isGatewayHealthy || pusherConnected;
        useConnectionStore.getState().setServerConnected(isConnected);
        if (isConnected) {
          setIsNetworkOnline(true);
        }
      } catch (err) {
        console.warn('[SyncManager] Sync cycle warning:', err);
        useConnectionStore.getState().setServerConnected(false);
      } finally {
        isSyncingRef.current = false;
      }
    };

    recoverProfilesRef.current().finally(() => {
      syncAll(true);
    });

    const handleOnline = () => {
      console.log('[SyncManager] Network online event received! Instantly restoring connections...');
      setIsNetworkOnline(true);
      useConnectionStore.getState().setServerConnected(true);
      syncAll(true);
    };

    const handleOffline = () => {
      console.log('[SyncManager] Network offline event received!');
      setIsNetworkOnline(false);
      useConnectionStore.getState().setServerConnected(false);
    };

    const handleFocus = () => {
      syncAll(true);
    };

    const handleSyncNow = () => {
      lastSyncTimeRef.current = 0;
      syncAll(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('orbita:sync-now', handleSyncNow);

    const interval = setInterval(() => syncAll(false), 15000);
    const checkTimer = setInterval(() => {
      const navOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const isConnected = useConnectionStore.getState().isServerConnected;
      if (!navOnline) {
        setIsNetworkOnline(false);
        useConnectionStore.getState().setServerConnected(false);
      } else if (!isConnected) {
        syncAll(true);
      }
    }, 3000);

    return () => {
      isDestroyed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('orbita:sync-now', handleSyncNow);
      clearInterval(interval);
      clearInterval(checkTimer);
    };
  }, [step, nickname, myCode]);

  const handleConnectRequest = useCallback(
    (friendCode: string, callback: (success: boolean, error?: string) => void) => {
      if (handshakeGuard.current) {
        callback(false, t('connectModal.already_connecting'));
        return;
      }
      handshakeGuard.current = true;
      setIsHandshaking(true);

      const pusher = getPusher();
      const friendChannel = pusher.subscribe(`private-handshake-${friendCode}`);
      const myKeys = generateKeyPair();
      const chatId = generateChatId();
      let settled = false;

      const sendRequest = () => {
        revalidateDevelopersOnConnection(friendCode);
        friendChannel.trigger('client-request-identity', {
          senderNickname: nickname,
          senderCode: myCode,
          publicKey: myKeys.publicKey,
          avatarUrl,
          chatId,
        });
        ablyService.sendHandshakeRequest(friendCode, {
          senderNickname: nickname,
          senderCode: myCode,
          publicKey: myKeys.publicKey,
          avatarUrl,
          chatId,
        }).catch((err) => console.warn('[Ably] Handshake request error:', err));
      };

      const subscriptionErrorHandler = () => {
        cleanup();
        callback(false, t('connectModal.server_error'));
      };

      const confirmationHandler = (data: any) => {
        if (settled) return;
        const sharedSecret = deriveSharedSecret(myKeys.privateKey, data.publicKey);
        const rootKey = deriveRootKey(sharedSecret);
        const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, data.publicKey);
        const currentChats = useChatStore.getState().chats;
        const peerCode = data.senderCode || friendCode;
        if (peerCode) {
          revalidateDevelopersOnConnection(peerCode);
        }
        if (currentChats.some((c) => c.id === chatId)) {
          updateChat(chatId, {
            name: data.nickname,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            sharedSecret: sharedSecret,
            ratchetState: ratchet.getState(),
            avatarUrl: data.avatarUrl ?? undefined,
            peerCode: peerCode,
          });
        } else {
          addChat({
            id: chatId,
            type: 'private',
            name: data.nickname,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: sharedSecret,
            isChatInitiator: true,
            ratchetState: ratchet.getState(),
            avatarUrl: data.avatarUrl ?? undefined,
            peerCode: peerCode,
          });
        }
        cleanup();
        callback(true);
      };

      const unsubAblyConfirm = ablyService.subscribeToHandshake(myCode, () => {}, confirmationHandler);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        unsubAblyConfirm();
        pusher.unsubscribe(`private-handshake-${friendCode}`);
        if (codeChannelRef.current) {
          codeChannelRef.current.unbind('client-identity-confirmed', confirmationHandler);
        }
        friendChannel.unbind('pusher:subscription_succeeded', sendRequest);
        friendChannel.unbind('pusher:subscription_error', subscriptionErrorHandler);
        handshakeGuard.current = false;
        setIsHandshaking(false);
      };

      // Add local chat with our handshake private key
      addChat({
        id: chatId,
        type: 'private',
        name: friendCode,
        lastMsg: 'Заявка отправлена',
        online: false,
        isChatInitiator: true,
        sharedSecret: myKeys.privateKey,
        avatarUrl: undefined,
        peerCode: friendCode,
      });
      setActiveChat(chatId);

      // Мгновенный поиск публичной карточки друга в реестре профилей
      supabaseService.lookupPublicProfile(friendCode).then((friendProfile) => {
        if (friendProfile && !settled) {
          console.log('[Handshake] Found instant public profile for friend:', friendProfile);
          if (friendProfile.public_key) {
            const sharedSecret = deriveSharedSecret(myKeys.privateKey, friendProfile.public_key);
            const rootKey = deriveRootKey(sharedSecret);
            const ratchet = DoubleRatchet.initSymmetric(rootKey, myKeys.privateKey, myKeys.publicKey, friendProfile.public_key);
            const isFriendHidden = Boolean(friendProfile.hide_profile_id);
            updateChat(chatId, {
              name: friendProfile.nickname,
              avatarUrl: friendProfile.avatar_url ?? undefined,
              sharedSecret: sharedSecret,
              ratchetState: ratchet.getState(),
              lastMsg: 'E2EE_SECURE_CHANNEL_READY',
              hideProfileId: isFriendHidden || undefined,
              peerCode: isFriendHidden ? undefined : friendCode,
            });
          } else {
            const isFriendHidden = Boolean(friendProfile.hide_profile_id);
            updateChat(chatId, {
              name: friendProfile.nickname,
              avatarUrl: friendProfile.avatar_url ?? undefined,
              hideProfileId: isFriendHidden || undefined,
              peerCode: isFriendHidden ? undefined : friendCode,
            });
          }
        }
      }).catch((err) => {
        console.warn('[Handshake] Profile lookup warning:', err);
      });

      supabaseService
        .sendOfflineHandshake(
          chatId,
          friendCode,
          nickname,
          myKeys.publicKey,
          avatarUrl,
          myCode
        )
        .then(() => {
          console.log('[Handshake] Offline handshake saved in Supabase for', friendCode);
          if (!settled) {
            cleanup();
            callback(true);
          }
        })
        .catch((err) => {
          console.error('[Handshake] Failed to persist handshake:', err);
          if (!settled) {
            cleanup();
            callback(false, err?.message || 'Не удалось отправить заявку');
          }
        });

      if (friendChannel.subscribed) sendRequest();
      else friendChannel.bind('pusher:subscription_succeeded', sendRequest);
      friendChannel.bind('pusher:subscription_error', subscriptionErrorHandler);

      if (codeChannelRef.current) {
        codeChannelRef.current.bind('client-identity-confirmed', confirmationHandler);
      }
    },
    [myCode, nickname, avatarUrl, addChat, setIsHandshaking, t]
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).orbita?.onDeepLink) {
      const unsub = (window as any).orbita.onDeepLink((url: string) => {
        if (!url) return;
        const code = extractCodeFromInput(url);
        if (code && code.length === 36) {
          handleConnectRequest(code.toUpperCase(), () => {});
        }
      });
      return unsub;
    }
  }, [handleConnectRequest]);

  const subscribeToGroupChat = useCallback((chatId: string) => {
    const pusher = getPusher();
    if (activeSubscriptions.current.has(chatId)) return activeSubscriptions.current.get(chatId)!.channel;
    const channel = pusher.subscribe(`presence-group-${chatId}`);
    const handleMessage = (data: any) => {
      if (data.type === 'system') {
        if (data.action === 'delete-chat') {
          useChatStore.setState({ chats: useChatStore.getState().chats.filter(c => c.id !== chatId) });
          if (activeSubscriptions.current.has(chatId)) { const sub = activeSubscriptions.current.get(chatId)!; sub.channel.unbind_all(); pusher.unsubscribe(`presence-group-${chatId}`); activeSubscriptions.current.delete(chatId); }
          return;
        }
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [],
            }
          }));
          updateChat(chatId, {
            lastMsg: t('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now()
          });
          return;
        }
        return;
      }
      lastPongTime.current.set(chatId, Date.now());
      const chat = useChatStore.getState().chats.find(c => c.id === chatId);
      if (!chat) return;

      const messages = useChatStore.getState().messagesByChatId[chatId] || [];

      if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(chatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const updated = messages.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            }
          }));
          updateChat(chatId, { lastMsg: updated.length > 0 ? updated[updated.length - 1].text : t('common.history_cleared') });
        }
        return;
      }
      if (data.type === 'edit' && messages[data.editIndex]) {
        const decrypted = data.text;
        const updated = [...messages];
        updated[data.editIndex] = { ...updated[data.editIndex], text: decrypted };
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          }
        }));
        return;
      }
      if (data.type === 'pin') { updateChat(chatId, { pinnedMessage: data.pinData }); return; }
      if (data.type === 'unpin') { updateChat(chatId, { pinnedMessage: null }); return; }
      if (data.type === 'member-joined') {
        if (data.members) updateChat(chatId, { members: data.members });
        return;
      }
      if (data.type === 'kick') {
        const updatedMembers = (chat.members || []).filter((member: any) => member.nickname !== data.target) as any;
        updateChat(chatId, { members: updatedMembers });
        if (data.target === nickname) {
          useChatStore.setState((state) => ({
            chats: state.chats.filter((c) => c.id !== chatId),
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
          }));
        }
        return;
      }
      if (data.type === 'promote') {
        const updatedMembers = (chat.members || []).map((member) => member.nickname === data.target ? { ...member, role: 'admin' } : member) as any;
        updateChat(chatId, { members: updatedMembers });
        if (data.target === nickname) updateChat(chatId, { role: 'admin' });
        return;
      }
      if (data.type === 'demote') {
        const updatedMembers = (chat.members || []).map((member) => member.nickname === data.target ? { ...member, role: 'member' } : member) as any;
        updateChat(chatId, { members: updatedMembers });
        if (data.target === nickname) updateChat(chatId, { role: 'member' });
        return;
      }
      if (data.type === 'read') {
        const updatedMessages = messages.map((msg) =>
          (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing)
            ? { ...msg, read: true, status: 'read' as const }
            : msg
        );
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'delivered') {
        const updatedMessages = messages.map((msg) =>
          (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing)
            ? (msg.status === 'read' ? msg : { ...msg, status: 'delivered' as const })
            : msg
        );
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'reaction' && data.emoji && data.sender) {
        if (data.sender === nickname) return;
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
        return;
      }

      if (data.sender === nickname) return;

      decryptMessage(data.text, chat.sharedSecret!).then((decrypted) => {
        let parsedData: any;
        try {
          parsedData = JSON.parse(decrypted);
        } catch {
          parsedData = { text: decrypted };
        }
        const msgId = parsedData?.id || data.messageId || data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const isCurrentActive = useChatStore.getState().activeChatId === chatId && typeof document !== 'undefined' && document.visibilityState === 'visible';
        addMessage(chatId, {
          id: msgId,
          sender: data.sender,
          text: parsedData?.text !== undefined ? parsedData.text : decrypted,
          time: data.time || Date.now(),
          read: isCurrentActive
        });
        if (isCurrentActive) {
          const sendRead = () => channel.trigger('client-message', { type: 'read', time: data.time, messageId: msgId, sender: nickname });
          if (channel.subscribed) sendRead();
          else channel.bind('pusher:subscription_succeeded', sendRead);
        } else {
          const sendDelivered = () => channel.trigger('client-message', { type: 'delivered', time: data.time, messageId: msgId, sender: nickname });
          if (channel.subscribed) sendDelivered();
          else channel.bind('pusher:subscription_succeeded', sendDelivered);
        }
      });
    };

    const handleReaction = (data: any) => {
      if (data.sender === nickname) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    channel.bind('message', handleMessage);
    channel.bind('edit', handleMessage);
    channel.bind('delete', handleMessage);
    channel.bind('pin', handleMessage);
    channel.bind('unpin', handleMessage);
    channel.bind('kick', handleMessage);
    channel.bind('promote', handleMessage);
    channel.bind('demote', handleMessage);
    channel.bind('system', handleMessage);
    channel.bind('client-message', handleMessage);
    channel.bind('reaction', handleReaction);
    activeSubscriptions.current.set(chatId, { channel, handler: handleMessage });
    startPingForChat(chatId);
    return channel;
  }, [nickname, addMessage, updateChat, t]);

  const subscribeToPublicChannel = useCallback((channelId: string) => {
    const pusher = getPusher();
    if (activeSubscriptions.current.has(channelId)) {
      return activeSubscriptions.current.get(channelId)!.channel;
    }

    const channelName = `public-channel-${channelId}`;
    const channel = pusher.subscribe(channelName);

    const handleNewPost = async (post: any) => {
      console.log('[MainLayout] Received new channel post:', post);
      if (!post || !post.id) return;

      let postText = post.text || '';
      if (postText.startsWith('orb_e2e:')) {
        const channelKey = deriveChannelKey(channelId);
        const decrypted = await decryptMessage(postText.slice(8), channelKey);
        if (decrypted && decrypted !== '[ENCRYPTED MESSAGE]') {
          postText = decrypted;
        }
      }

      const currentChat = useChatStore.getState().chats.find((c) => c.id === channelId);
      const activeChatId = useChatStore.getState().activeChatId;
      const isViewingThisChannel = activeChatId === channelId;

      const sender = post.sender || post.senderNickname || 'Channel';
      const myNickname = useAuthStore.getState().nickname;
      const isMine = myNickname ? sender === myNickname : false;

      const newMsg: Message = {
        id: post.id,
        sender,
        text: postText,
        time: post.time || Date.now(),
        read: isViewingThisChannel,
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

      const currentMsgs = useChatStore.getState().messagesByChatId[channelId] || [];
      const existingMatch = currentMsgs.find(
        (m) =>
          m.id === post.id ||
          (m.isOutgoing &&
            m.sender === (post.sender || post.senderNickname) &&
            ((post.text && m.text === post.text) ||
              (post.mediaUrl && m.mediaUrl === post.mediaUrl) ||
              (post.mediaName && m.mediaName === post.mediaName)) &&
            Math.abs(m.time - (post.time || 0)) < 30000)
      );

      if (existingMatch) {
        useChatStore.setState((state) => {
          const list = state.messagesByChatId[channelId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: list.map((m) =>
                m.id === existingMatch.id
                  ? {
                      ...m,
                      id: post.id,
                      text: postText || m.text,
                      time: post.time || m.time,
                    }
                  : m
              ),
            },
          };
        });
      } else {
        addMessage(channelId, newMsg);
      }
      useChatStore.getState().updateChat(channelId, { lastMsg: postText || 'Новый пост' });

      if (!isViewingThisChannel) {
        let notifBody = post.text;
        if (!notifBody) {
          if (post.mediaType === 'photo' || post.mediaType === 'image') notifBody = t('chatWindow.photo') || '📷 Фотография';
          else if (post.mediaType === 'video') notifBody = t('chatWindow.video') || '📹 Видео';
          else if (post.mediaType === 'voice') notifBody = t('chatWindow.voice_message') || '🎤 Голосовое сообщение';
          else if (post.mediaType === 'audio') notifBody = post.mediaName || t('chatWindow.audio') || '🎵 Музыка';
          else if (post.mediaType === 'file') notifBody = post.mediaName || t('chatWindow.file') || '📁 Файл';
          else notifBody = 'Новый пост в сообществе';
        }
        showNotification(currentChat?.name || post.sender || 'Канал', notifBody, channelId, currentChat?.avatarUrl || null);
      }
    };

    const handleReaction = (data: any) => {
      console.log('[MainLayout] Received channel reaction update:', data);
      if (data?.postId && data?.reactions) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[channelId] || [];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: currentMsgs.map((m) =>
                m.id === data.postId ? { ...m, reactions: data.reactions } : m
              ),
            },
          };
        });
      }
    };

    const handleSubscribers = (data: any) => {
      console.log('[MainLayout] Received channel subscribers update:', data);
      if (typeof data?.subscribersCount === 'number') {
        useChatStore.getState().updateChat(channelId, {
          subscribersCount: data.subscribersCount,
        });
      }
    };

    const handleChannelUpdated = (data: any) => {
      const updates: Partial<Chat> = {};
      if (data?.name !== undefined && data.name) updates.name = data.name;
      if (data?.description !== undefined) updates.description = data.description;
      if (data?.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
      updates.updatedAt = data?.updatedAt || Date.now();
      useChatStore.getState().updateChat(channelId, updates);
    };

    const handleDeletePost = (data: any) => {
      const postId = data?.postId || data?.targetMessageId || data?.id;
      if (postId) {
        useChatStore.getState().deleteMessage(channelId, postId);
      }
    };

    channel.bind('new-post', handleNewPost);
    channel.bind('delete-post', handleDeletePost);
    channel.bind('post-deleted', handleDeletePost);
    channel.bind('reaction-updated', handleReaction);
    channel.bind('subscribers-updated', handleSubscribers);
    channel.bind('channel-updated', handleChannelUpdated);

    if (!ablyMessageUnsubscribes.current.has(channelId)) {
      const unsub = ablyService.subscribeToChatMessages(`public-channel-${channelId}`, (data: any) => {
        if (data?.type === 'channel-post' && data?.post) {
          handleNewPost(data.post);
        } else if (data?.type === 'delete-post' || data?.type === 'post-deleted' || data?.type === 'delete-message') {
          handleDeletePost(data);
        } else if (data?.type === 'reaction-updated') {
          handleReaction(data);
        } else if (data?.type === 'channel-updated') {
          handleChannelUpdated(data);
        } else if (data?.type === 'subscribers-updated' && typeof data?.subscribersCount === 'number') {
          useChatStore.getState().updateChat(channelId, { subscribersCount: data.subscribersCount });
        } else if (data?.id) {
          handleNewPost(data);
        }
      });
      ablyMessageUnsubscribes.current.set(channelId, unsub);
    }

    activeSubscriptions.current.set(channelId, {
      channel,
      handler: handleNewPost,
    });

    channelService.getChannel(channelId).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === channelId);
        if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
          return;
        }
        const myNick = (useAuthStore.getState().nickname || '').trim().toLowerCase();
        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (info.creatorNickname && myNick && info.creatorNickname.trim().toLowerCase() === myNick) ||
          (current?.creatorNickname && myNick && current.creatorNickname.trim().toLowerCase() === myNick)
        );
        const updates: Partial<Chat> = {
          subscribersCount: info.subscribersCount,
          creatorNickname: info.creatorNickname || current?.creatorNickname,
        };
        if (isCreator) {
          updates.isOwner = true;
        }
        if (!isCreator) {
          updates.name = info.name;
          updates.description = info.description;
          updates.avatarUrl = info.avatarUrl || undefined;
          if (info.updatedAt) updates.updatedAt = info.updatedAt;
        } else {
          if (info.name && !current?.name) updates.name = info.name;
          if (info.description && !current?.description) updates.description = info.description;
          if (info.avatarUrl && !current?.avatarUrl) updates.avatarUrl = info.avatarUrl;
        }
        useChatStore.getState().updateChat(channelId, updates);
      }
    }).catch(() => {});

    channelService.getChannelPosts(channelId).then((posts) => {
      if (posts) {
        useChatStore.setState((state) => {
          const currentMsgs = state.messagesByChatId[channelId] || [];
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
                text: fetched.text || m.text,
                time: fetched.time || m.time,
                reactions: fetched.reactions || m.reactions,
              };
            }
            if (m.id) existingIds.add(m.id);
            return m;
          });
          const newItems: Message[] = [];
          const myNickname = useAuthStore.getState().nickname;
          posts.forEach((post) => {
            if (!existingIds.has(post.id)) {
              const isMine = myNickname ? post.sender === myNickname : false;
              newItems.push({
                id: post.id,
                sender: post.sender,
                text: post.text,
                time: post.time,
                read: state.activeChatId === channelId,
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
          if (newItems.length === 0 && updatedExisting.length === currentMsgs.length && updatedExisting === currentMsgs) return state;
          const merged = [...updatedExisting, ...newItems].sort((a, b) => a.time - b.time);
          const latest = merged[merged.length - 1];
          return {
            messagesByChatId: {
              ...state.messagesByChatId,
              [channelId]: merged,
            },
            chats: state.chats.map((c) =>
              c.id === channelId
                ? {
                    ...c,
                    lastMsg: latest ? (latest.text || (latest.mediaType ? `[${latest.mediaType}]` : c.lastMsg)) : 'История очищена',
                  }
                : c
            ),
          };
        });
      }
    }).catch(() => {});

    return channel;
  }, [addMessage, t]);

  const startPingForChat = useCallback((chatId: string) => {
    // Ably Presence automatically handles real-time online/offline presence without Pusher rate-limit overhead
    void chatId;
  }, []);

  const subscribeToChat = useCallback((chatId: string, sharedSecret: string) => {
    void sharedSecret;

    const pusher = getPusher();
    if (activeSubscriptions.current.has(chatId)) {
      console.log(`[subscribeToChat] Already subscribed to ${chatId}, skipping.`);
      return activeSubscriptions.current.get(chatId)!.channel;
    }
    console.log(`[Pusher] Subscribing to private-chat-${chatId}`);
    const channel = pusher.subscribe(`private-chat-${chatId}`);

    const handleMessage = (data: any) => {
      let chat = useChatStore.getState().chats.find((c) => c.id === chatId);
      if (!chat) {
        chat = useChatStore.getState().restoreDeletedChat(chatId) || undefined;
      }
      const isSelf = Boolean(
        (myCode && (data.senderCode === myCode || data.senderId === myCode)) ||
        (nickname && (data.sender === nickname || data.senderNickname === nickname)) ||
        data.sender === 'YOU' ||
        (data.messageId && processedMessageIds.current.has(data.messageId))
      );

      if (isSelf) return;

      if (data.type === 'reaction' && data.emoji && data.sender) {
        const targetId = data.messageId || data.id;
        if (targetId) {
          useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
        }
        return;
      }

      if (data.type === 'delivered') {
        const currentMessages = useChatStore.getState().messagesByChatId[chatId] || [];
        const updatedMessages = currentMessages.map((msg) => {
          const isTarget = (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
          if (isTarget) {
            if (msg.status === 'read') return msg;
            return { ...msg, status: 'delivered' as const, deliveredAt: data.timestamp || Date.now() };
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'read') {
        const currentMessages = useChatStore.getState().messagesByChatId[chatId] || [];
        const updatedMessages = currentMessages.map((msg) => {
          const isTarget = (data.messageId && msg.id === data.messageId) || (data.time && msg.time <= data.time && msg.isOutgoing);
          if (isTarget) {
            return { ...msg, read: true, status: 'read' as const, readAt: data.timestamp || Date.now() };
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
        return;
      }

      if (data.type === 'message-ack') {
        messageQueue.handleAcknowledgment({
          messageId: data.messageId,
          chatId: data.chatId,
          receivedBy: data.receivedBy,
          timestamp: data.timestamp,
        });
        return;
      }

      if (data.type === 'system') {
        if (data.action === 'delete-chat') {
          useChatStore.setState({
            chats: useChatStore.getState().chats.filter((c) => c.id !== chatId),
          });
          if (activeSubscriptions.current.has(chatId)) {
            const sub = activeSubscriptions.current.get(chatId)!;
            sub.channel.unbind_all();
            pusher.unsubscribe(`private-chat-${chatId}`);
            activeSubscriptions.current.delete(chatId);
          }
          if (ablyMessageUnsubscribes.current.has(chatId)) {
            ablyMessageUnsubscribes.current.get(chatId)!();
            ablyMessageUnsubscribes.current.delete(chatId);
          }
          return;
        }
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [],
            }
          }));
          updateChat(chatId, {
            lastMsg: t('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
          });
          return;
        }
        return;
      }

      if (!chat) return;

      if (data.type === 'profile-update') {
        const myCode = useChatStore.getState().myCode;
        const myNickname = useAuthStore.getState().nickname;
        if (
          (data.sender && (data.sender === myNickname || data.sender === nickname)) ||
          (data.senderCode && myCode && data.senderCode === myCode) ||
          (data.senderId && myCode && data.senderId === myCode) ||
          (data.nickname && (data.nickname === myNickname || data.nickname === nickname))
        ) {
          return;
        }
        const updates: Partial<Chat> = {};
        if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
        if (data.nickname !== undefined && data.nickname !== myNickname && data.nickname !== nickname) updates.name = data.nickname;
        if (data.hideProfileId !== undefined) {
          updates.hideProfileId = Boolean(data.hideProfileId);
          if (updates.hideProfileId) updates.peerCode = undefined;
        }
        if (!updates.hideProfileId && data.senderCode && (!myCode || data.senderCode !== myCode)) {
          updates.peerCode = data.senderCode;
        }
        updateChat(chatId, updates);
        return;
      }

      if (data.type === 'message') {
        const messageKey = data.messageId || `${chatId}_${data.index}_${data.ciphertext?.slice(0, 16)}`;
        if (processedMessageIds.current.has(messageKey)) {
          return;
        }
        processedMessageIds.current.add(messageKey);

        (async () => {
          let currentChat = useChatStore.getState().chats.find((c) => c.id === chatId);
          if (!currentChat) {
            currentChat = useChatStore.getState().restoreDeletedChat(chatId) || undefined;
          }
          if (!currentChat || !currentChat.ratchetState) {
            console.warn('[subscribeToChat] Chat or ratchetState not ready for chatId:', chatId);
            return;
          }
          const ratchet = DoubleRatchet.fromState(currentChat.ratchetState);
          const decrypted = await ratchet.decrypt(
            data.ciphertext,
            data.index,
            data.dhPublicKey ?? '',
          );
          if (decrypted === null) {
            console.warn('[subscribeToChat] Cannot decrypt message index (stale or duplicate):', data.index);
            return;
          }
          updateChat(chatId, { ratchetState: ratchet.getState() });

          let messageData;
          try {
            messageData = JSON.parse(decrypted);
          } catch {
            console.warn('[subscribeToChat] Invalid JSON in message');
            return;
          }

          if (messageData?.type === 'receipt' || messageData?.type === 'read' || messageData?.receiptType === 'read') {
            const targetIds = new Set((messageData.messageIds || [messageData.messageId]).filter(Boolean));
            const targetTime = messageData.time;

            const currentMessages = useChatStore.getState().messagesByChatId[chatId] || [];
            const updatedMessages = currentMessages.map((m) => {
              const isTarget = (m.id && targetIds.has(m.id)) || (targetTime && m.time <= targetTime && m.isOutgoing);
              if (isTarget) {
                return { ...m, read: true, status: 'read' as const, readAt: messageData.time || Date.now() };
              }
              return m;
            });

            useChatStore.setState((s) => ({
              messagesByChatId: {
                ...s.messagesByChatId,
                [chatId]: updatedMessages,
              },
            }));

            try {
              if (data.messageId) {
                await supabaseService.markMessageDelivered(data.messageId);
              }
            } catch {}
            return;
          }

          const msgId = messageData?.id || data.messageId || data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const senderCode = messageData?.senderId || messageData?.senderCode || data.senderId || data.senderCode || chat.peerCode;
          const senderNick = messageData?.sender || data.sender;
          const senderAvatar = messageData?.avatarUrl || data.avatarUrl;

          const chatUpdates: Partial<Chat> = {};
          if (senderNick && senderNick !== nickname && senderNick !== 'Peppe' && senderNick !== 'Saizzi' && senderNick !== 'YOU') {
            if (chat.name.length === 36 || chat.name === 'Peppe' || chat.name === 'Saizzi' || chat.name === nickname) {
              chatUpdates.name = senderNick;
            }
          }
          if (senderAvatar && (!chat.avatarUrl || chat.avatarUrl === avatarUrl)) {
            chatUpdates.avatarUrl = senderAvatar;
          }
          if (senderCode && !chat.peerCode) {
            chatUpdates.peerCode = senderCode;
          }
          if (Object.keys(chatUpdates).length > 0) {
            updateChat(chatId, chatUpdates);
          }

          const isCurrentActive = useChatStore.getState().activeChatId === chatId && typeof document !== 'undefined' && document.visibilityState === 'visible';

          addMessage(
            chatId,
            {
              id: msgId,
              senderId: senderCode,
              sender: data.sender,
              isOutgoing: false,
              text: messageData.text || '',
              time: data.time || Date.now(),
              read: isCurrentActive,
              index: data.index,
              mediaType: messageData.mediaType || null,
              mediaUrl: messageData.mediaUrl || null,
              mediaName: messageData.mediaName || null,
              mediaKey: messageData.mediaKey || null,
              mime: messageData.mime || null,
              mediaItems: messageData.mediaItems || undefined,
              audioMetadata: messageData.audioMetadata || undefined,
              duration: messageData.duration || undefined,
              waveform: messageData.waveform || undefined,
              linkPreview: messageData.linkPreview || undefined,
            },
            data.ciphertext,
            data.index
          );

          try {
            if (data.messageId) {
              await supabaseService.markMessageDelivered(data.messageId);
              console.log('[MainLayout] Message marked as delivered in Supabase:', data.messageId);
            }
          } catch (err) {
            console.error('[MainLayout] Failed to mark message as delivered in Supabase:', err);
          }

          if (!isSelf && chat) {
            const activeChatId = useChatStore.getState().activeChatId;
            if (activeChatId !== chatId) {
              let notifBody = messageData.text;
              if (!notifBody) {
                if (messageData.mediaType === 'image') notifBody = t('chatWindow.photo') || '📷 Фотография';
                else if (messageData.mediaType === 'video') notifBody = t('chatWindow.video') || '📹 Видео';
                else if (messageData.mediaType === 'voice') notifBody = t('chatWindow.voice_message') || '🎤 Голосовое сообщение';
                else if (messageData.mediaType === 'audio') notifBody = messageData.mediaName || t('chatWindow.audio') || '🎵 Аудиозапись';
                else if (messageData.mediaType === 'file') notifBody = messageData.mediaName || t('chatWindow.file') || '📁 Файл';
                else if (messageData.mediaType === 'sticker') notifBody = t('chatWindow.sticker') || 'Стикер';
                else notifBody = t('chatWindow.new_message') || 'Новое сообщение';
              }
              const notifAvatar = chat.avatarUrl || null;
              showNotification(data.sender, notifBody, chatId, notifAvatar);
            }
          }

          if (!isSelf) {
            ablyService.markMessageDelivered(chatId, data.messageId);
            const pusher = getPusher();
            const ch = pusher.subscribe(`private-chat-${chatId}`);
            if (isCurrentActive) {
              ablyService.markMessageRead(chatId, data.messageId);
              const sendRead = () => ch.trigger('client-message', { type: 'read', messageId: data.messageId, time: data.time, sender: nickname });
              if (ch.subscribed) sendRead(); else ch.bind('pusher:subscription_succeeded', sendRead);
            } else {
              const sendDelivered = () => ch.trigger('client-message', { type: 'delivered', messageId: data.messageId, time: data.time, sender: nickname });
              if (ch.subscribed) sendDelivered(); else ch.bind('pusher:subscription_succeeded', sendDelivered);
            }
          }
        })();
        return;
      }
      if (data.type === 'edit') {
        const messages = useChatStore.getState().messagesByChatId[chatId] || [];
        if (!messages[data.editIndex]) return;
        (async () => {
          const ratchet = DoubleRatchet.fromState(chat.ratchetState!);
          const decrypted = await ratchet.decrypt(
            data.text,
            data.index,
            data.dhPublicKey ?? '',
          );
          if (decrypted === null) return;
          updateChat(chatId, { ratchetState: ratchet.getState() });
          const updatedMessages = [...messages];
          updatedMessages[data.editIndex] = {
            ...updatedMessages[data.editIndex],
            text: decrypted,
            encryptedText: data.text,
            index: data.index,
          };
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updatedMessages,
            }
          }));
        })();
        return;
      }

      if (data.type === 'delete' || data.type === 'delete-message') {
        const targetId = data.targetMessageId || data.messageId;
        if (targetId) {
          useChatStore.getState().deleteMessage(chatId, targetId);
        } else if (data.deleteIndex !== undefined) {
          const messages = useChatStore.getState().messagesByChatId[chatId] || [];
          const updated = messages.filter((_, i) => i !== data.deleteIndex);
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            }
          }));
          updateChat(chatId, {
            lastMsg: updated.length > 0 ? updated[updated.length - 1].text : t('common.history_cleared'),
          });
        }
        return;
      }

      if (data.type === 'pin') {
        updateChat(chatId, { pinnedMessage: data.pinData });
        return;
      }

      if (data.type === 'unpin') {
        updateChat(chatId, { pinnedMessage: null });
        return;
      }

      if (data.type === 'ping') {
        const updates: Partial<Chat> = {};
        if (data.senderCode) updates.peerCode = data.senderCode;
        if (Object.keys(updates).length > 0) updateChat(chatId, updates);
        lastPongTime.current.set(chatId, Date.now());
      }

      if (data.type === 'system') {
        if (data.action === 'delete-chat') {
          if (activeSubscriptions.current.has(chatId)) {
            const sub = activeSubscriptions.current.get(chatId)!;
            sub.channel.unbind_all();
            getPusher().unsubscribe(`private-chat-${chatId}`);
            activeSubscriptions.current.delete(chatId);
          }
          useChatStore.getState().deleteChat(chatId);
          if (useChatStore.getState().activeChatId === chatId) {
            useChatStore.getState().setActiveChat(null);
          }
          return;
        }
        if (data.action === 'clear-history') {
          useChatStore.setState((state) => ({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: [],
            }
          }));
          updateChat(chatId, {
            lastMsg: t('common.history_cleared'),
            unreadCount: 0,
            lastReadTimestamp: Date.now()
          });
          return;
        }
      }

      if (typeof data.type === 'string' && data.type.startsWith('call-')) {
        const myNick = nickname || useAuthStore.getState().nickname || useCallStore.getState().myNickname;
        const myCurrentCode = myCode || useChatStore.getState().myCode;
        if (
          (data.sender && myNick && data.sender === myNick) ||
          (data.sender && myCurrentCode && data.sender === myCurrentCode) ||
          (data.senderId && myCurrentCode && data.senderId === myCurrentCode)
        ) {
          return;
        }

        if (data.type !== 'call-offer') {
          const state = useCallStore.getState();
          const currentRoom = state.activeCall?.roomName || state.incomingCall?.roomName;
          if (data.roomName && currentRoom && data.roomName !== currentRoom) {
            return;
          }
        }
      }

      if (data.type === 'call-offer') {
        const currentState = useCallStore.getState();
        if (
          (currentState.incomingCall && currentState.incomingCall.roomName === data.roomName) ||
          (currentState.activeCall && currentState.activeCall.roomName === data.roomName) ||
          currentState.processedRoomNames.includes(data.roomName)
        ) {
          return;
        }

        if (currentState.activeCall || currentState.incomingCall) {
          const pusher = getPusher();
          const channel = pusher.subscribe(`private-chat-${chatId}`);
          const sendBusy = () => {
            try {
              channel.trigger('client-message', {
                type: 'call-busy',
                sender: nickname,
                text: '',
                roomName: data.roomName,
              });
            } catch {}
            try {
              ablyService.sendMessage(chatId, {
                type: 'call-busy',
                sender: nickname,
                text: '',
                roomName: data.roomName,
              });
            } catch {}
          };
          if (channel.subscribed) sendBusy();
          else channel.bind('pusher:subscription_succeeded', sendBusy);
          return;
        }
        useCallStore.getState().setIncomingCall({
          from: data.sender,
          chatId,
          callType: data.callType,
          roomName: data.roomName,
          timestamp: Date.now(),
          verificationSalt: data.verificationSalt,
        });
        return;
      }

      if (data.type === 'call-accept') {
        useCallStore.getState().handleAccept(data.roomName);
        return;
      }

      if (data.type === 'call-connected') {
        useCallStore.getState().handleConnected(data.connectedAt, data.roomName);
        return;
      }

      if (data.type === 'call-reject') {
        callSoundService.stop();
        if (data.roomName) {
          useCallStore.getState().addProcessedRoomName(data.roomName);
        }
        useCallStore.getState().handleReject(data.roomName);
        return;
      }

      if (data.type === 'call-busy') {
        callSoundService.stop();
        useCallStore.getState().handleBusy(data.roomName);
        return;
      }

      if (data.type === 'call-cancel') {
        callSoundService.stop();
        if (data.roomName) {
          useCallStore.getState().addProcessedRoomName(data.roomName);
        }
        useCallStore.getState().handleCancel(data.roomName);
        return;
      }

      if (data.type === 'call-hangup') {
        callSoundService.stop();
        useCallStore.getState().handleHangup(data.roomName);
        return;
      }
    };

    const handleReaction = (data: any) => {
      const isSelf = Boolean(
        myCode && (data.senderCode === myCode || data.senderId === myCode)
      );
      if (isSelf) return;
      const targetId = data.messageId || data.id;
      if (targetId && data.emoji && data.sender) {
        useChatStore.getState().setReaction(chatId, targetId, data.emoji, data.sender, data.action || 'add');
      }
    };

    channel.bind('client-message', handleMessage);
    channel.bind('reaction', handleReaction);
    activeSubscriptions.current.set(chatId, { channel, handler: handleMessage });
    console.log(`[Pusher] Subscribed to private-chat-${chatId}`);

    if (!ablyMessageUnsubscribes.current.has(chatId)) {
      const unsub = ablyService.subscribeToChatMessages(chatId, handleMessage);
      ablyMessageUnsubscribes.current.set(chatId, unsub);
      console.log(`[Ably] Subscribed to chat:${chatId}`);
    }

    startPingForChat(chatId);
    return channel;
  }, [addMessage, updateChat, startPingForChat, nickname, t]);

  const subscribeToDeliveryUpdates = useCallback((chatId: string) => {
    if (deliveryUnsubscribes.current.has(chatId)) {
      return;
    }
    const unsubscribe = ablyService.subscribeToDeliveryUpdates(
      chatId,
      (messageId, _userId, status, timestamp) => {
        const chat = useChatStore.getState().chats.find(c => c.id === chatId);
        if (!chat) return;
        const messages = useChatStore.getState().messagesByChatId[chatId] || [];
        const updatedMessages = messages.map((msg) => {
          if (msg.id === messageId) {
            if (msg.status === 'read' && status === 'delivered') return msg;
            return { ...msg, status, deliveredAt: timestamp };
          }
          return msg;
        });
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updatedMessages,
          }
        }));
      }
    );
    deliveryUnsubscribes.current.set(chatId, unsubscribe);
  }, [updateChat]);

  useEffect(() => {
    const allRelevantChats = [
      ...chats,
      ...Object.values(deletedChatSessions || {}),
    ];
    allRelevantChats.forEach((chat) => {
      if (!chat.id) return;
      if (chat.id === 'notes') return;
      if (activeSubscriptions.current.has(chat.id)) return;
      if (chat.type === 'channel') {
        subscribeToPublicChannel(chat.id);
      } else if (chat.type === 'group') {
        subscribeToGroupChat(chat.id);
      } else {
        if (!chat.sharedSecret) return;
        subscribeToChat(chat.id, chat.sharedSecret);
        subscribeToDeliveryUpdates(chat.id);
      }
    });
  }, [chats, deletedChatSessions, subscribeToChat, subscribeToGroupChat, subscribeToPublicChannel, subscribeToDeliveryUpdates]);

  useEffect(() => {
    return () => {
      const pusher = getPusher();
      activeSubscriptions.current.forEach((sub) => { try { sub.channel.unbind_all(); pusher.unsubscribe(sub.channel.name); } catch {} });
      activeSubscriptions.current.clear();

      pingIntervals.current.forEach(t => clearInterval(t)); pingIntervals.current.clear();
      if (codeChannelRef.current) { codeChannelRef.current.unbind_all(); pusher.unsubscribe(codeChannelRef.current.name); }
      processedChatIds.current.clear();
      processedMessageIds.current.clear();
      messageQueue.destroy();
      deliveryUnsubscribes.current.forEach((unsubscribe) => unsubscribe());
      deliveryUnsubscribes.current.clear();
      ablyMessageUnsubscribes.current.forEach((unsubscribe) => {
        try { unsubscribe(); } catch {}
      });
      ablyMessageUnsubscribes.current.clear();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setChatContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    const handleScroll = () => {
      if (chatContextMenu.visible) {
        setChatContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    if (chatContextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [chatContextMenu.visible]);

  const handleDeleteAccount = () => { deleteAccount(); resetChats(); setShowDeleteModal(false); };
  const handleChatContextMenu = (e: React.MouseEvent, chatId: string) => { e.preventDefault(); e.stopPropagation(); setChatContextMenu({ visible: true, x: e.clientX, y: e.clientY, chatId }); };

  const requestClearHistory = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const isNotes = chat.id === 'notes';
    const chatName = isNotes ? t('connectModal.notes') : chat.name;
    setChatContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: 'clear_history',
      chatId,
      chatName,
      avatarUrl: chat.avatarUrl,
      isNotes,
    });
  };

  const requestDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    const isNotes = chat.id === 'notes';
    const isChannel = chat.type === 'channel';
    const chatName = isNotes ? t('connectModal.notes') : chat.name;
    setChatContextMenu(prev => ({ ...prev, visible: false }));
    setConfirmModal({
      isOpen: true,
      type: isChannel ? 'leave_channel' : 'delete_chat',
      chatId,
      chatName,
      avatarUrl: chat.avatarUrl,
      isNotes,
    });
  };

  const handleClearHistory = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    if (chat.sharedSecret && chat.id !== 'notes') {
      const pusher = getPusher();
      const channel = pusher.subscribe(`private-chat-${chatId}`);
      const sendSystemMsg = () => channel.trigger('client-message', { sender: nickname, type: 'system', action: 'clear-history', text: '' });
      if (channel.subscribed) sendSystemMsg();
      else channel.bind('pusher:subscription_succeeded', sendSystemMsg);
    }
    useChatStore.setState((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: [],
      }
    }));
    updateChat(chatId, {
      lastMsg: t('common.history_cleared'),
      unreadCount: 0,
      lastReadTimestamp: Date.now()
    });
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleDeleteChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;
    if (chat.type === 'channel') {
      channelService.leaveChannel(chatId, nickname);
      if (activeSubscriptions.current.has(chatId)) {
        const sub = activeSubscriptions.current.get(chatId)!;
        sub.channel.unbind_all();
        getPusher().unsubscribe(`public-channel-${chatId}`);
        activeSubscriptions.current.delete(chatId);
      }
      if (ablyMessageUnsubscribes.current.has(chatId)) {
        const unsub = ablyMessageUnsubscribes.current.get(chatId)!;
        unsub();
        ablyMessageUnsubscribes.current.delete(chatId);
      }
    }
    useChatStore.getState().deleteChat(chatId);
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handlePinChat = (chatId: string) => {
    if (chatId === 'notes') return;
    togglePinChat(chatId);
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleMuteChat = (chatId: string) => {
    if (chatId === 'notes') return; // у заметок нет уведомлений
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      updateChat(chatId, { muted: !chat.muted });
    }
    setChatContextMenu(prev => ({ ...prev, visible: false }));
  };

  // Фильтрация: показываем заметки только если есть сообщения
  const filteredChats = useMemo(() => {
    return chats.filter(chat => {
      if (chat.id === 'notes') {
        const messages = messagesByChatId['notes'] || [];
        return messages.length > 0;
      }
      return true;
    });
  }, [chats, messagesByChatId]);

  const sortedChats = useMemo(() => {
    return [...filteredChats].sort((a, b) => {
      // Заметки всегда первые (если отображаются)
      if (a.id === 'notes') return -1;
      if (b.id === 'notes') return 1;
      if (pinnedChatsSet.has(a.id) && !pinnedChatsSet.has(b.id)) return -1;
      if (!pinnedChatsSet.has(a.id) && pinnedChatsSet.has(b.id)) return 1;
      return 0;
    });
  }, [filteredChats, pinnedChatsSet]);

  const isSupportFound = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return false;
    const name = (t('support.name', 'Техническая поддержка') || '').toLowerCase();
    if (name.includes(q)) return true;
    const keywords = [
      'support',
      'техподдержка',
      'поддержка',
      'поддержк',
      'саппорт',
      'суппорт',
      'помощь',
      'помощ',
      'тикет',
      'ticket',
      'help',
      'tech',
      'служба поддержки',
      'техническая поддержка',
      'system_support',
    ];
    return keywords.some((kw) => kw.includes(q) || q.includes(kw));
  }, [searchQuery, t]);

  const isBotFound = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return false;
    const name = (t('orbitos.name', 'ORBITA') || '').toLowerCase();
    if (name.includes(q)) return true;
    const keywords = [
      'орбита',
      'orbita',
      'orbitos',
      'орбитос',
      'орбит',
      'бот',
      'боты',
      'bot',
      'bots',
      'ии',
      'ai',
      'gemini',
      'помощник',
      'ассистент',
      'assistant',
      'нейросеть',
      'нейро',
      'чат-бот',
      'чатбот',
      'system_orbitos',
    ];
    return keywords.some((kw) => kw.includes(q) || q.includes(kw));
  }, [searchQuery, t]);

  const searchedChats = useMemo(() => {
    if (!searchQuery.trim()) return sortedChats;
    const q = searchQuery.toLowerCase().trim();
    return sortedChats.filter(chat => {
      if (isSupportFound && chat.id === supportService.BOT_ID) return false;
      if (isBotFound && chat.id === orbitosService.BOT_ID) return false;
      return (
        chat.name.toLowerCase().includes(q) ||
        (chat.id && chat.id.toLowerCase().includes(q))
      );
    });
  }, [sortedChats, searchQuery, isSupportFound, isBotFound]);

  const isLightTheme = document.documentElement.getAttribute('data-theme-light') === 'true';

  const handleOpenSettings = () => {
    setCurrentView('settings');
  };

  const CHAT_BATCH_SIZE = 25;
  const [renderedChatCount, setRenderedChatCount] = useState<number>(CHAT_BATCH_SIZE);

  useEffect(() => {
    setRenderedChatCount(CHAT_BATCH_SIZE);
  }, [searchQuery]);

  useEffect(() => {
    const trimmed = extractCodeFromInput(searchQuery).trim();
    if (trimmed.length < 3) {
      setSearchChannelResult(null);
      setIsSearchingChannel(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingChannel(true);
      channelService.getChannel(trimmed).then((channel) => {
        if (!cancelled) {
          setSearchChannelResult(channel);
          setIsSearchingChannel(false);
        }
      }).catch(() => {
        if (!cancelled) {
          setSearchChannelResult(null);
          setIsSearchingChannel(false);
        }
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSelectFoundChannel = useCallback(async (channel: ChannelInfo) => {
    const exists = chats.some(c => c.id === channel.id);
    if (!exists) {
      addChannelChat({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        avatarUrl: channel.avatarUrl,
        creatorNickname: channel.creatorNickname,
        subscribersCount: channel.subscribersCount,
        isOfficial: channel.isOfficial,
        isOwner: false,
        isSubscribed: false,
      });
    }
    setActiveChat(channel.id);
    setSearchQuery('');
    setSearchChannelResult(null);
  }, [chats, addChannelChat, setActiveChat]);

  const visibleChats = useMemo(() => {
    return searchedChats.slice(0, renderedChatCount);
  }, [searchedChats, renderedChatCount]);

  const chatListScrollRef = useRef<HTMLDivElement>(null);
  const chatThumbRef = useRef<HTMLDivElement>(null);
  const chatTrackRef = useRef<HTMLDivElement>(null);
  const chatListScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateChatThumbDom = useCallback(() => {
    const el = chatListScrollRef.current;
    const thumb = chatThumbRef.current;
    const track = chatTrackRef.current;
    if (!el || !thumb || !track) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 4 || clientHeight === 0) {
      thumb.style.display = 'none';
      track.style.display = 'none';
      return;
    }
    thumb.style.display = 'block';
    track.style.display = 'block';

    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    const top = maxTop * ratio;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }, []);

  const showChatScrollbar = useCallback(() => {
    updateChatThumbDom();
    if (chatThumbRef.current) chatThumbRef.current.style.opacity = '1';
    if (chatTrackRef.current) chatTrackRef.current.style.opacity = '1';
    if (chatListScrollTimerRef.current) clearTimeout(chatListScrollTimerRef.current);
    chatListScrollTimerRef.current = setTimeout(() => {
      if (chatThumbRef.current) chatThumbRef.current.style.opacity = '0';
      if (chatTrackRef.current) chatTrackRef.current.style.opacity = '0';
    }, 900);
  }, [updateChatThumbDom]);

  const handleChatListMouseLeave = useCallback(() => {
    if (chatListScrollTimerRef.current) clearTimeout(chatListScrollTimerRef.current);
    if (chatThumbRef.current) chatThumbRef.current.style.opacity = '0';
    if (chatTrackRef.current) chatTrackRef.current.style.opacity = '0';
  }, []);

  useEffect(() => {
    updateChatThumbDom();
  }, [visibleChats, sortedChats, updateChatThumbDom]);

  useEffect(() => {
    const el = chatListScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateChatThumbDom());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateChatThumbDom]);

  const handleChatListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    showChatScrollbar();

    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 350) {
      setRenderedChatCount((prev) => {
        if (prev < searchedChats.length) {
          return Math.min(searchedChats.length, prev + CHAT_BATCH_SIZE);
        }
        return prev;
      });
    }
  }, [searchedChats.length, showChatScrollbar]);

  const CHAT_MIN_WIDTH = 300;
  const SIDEBAR_MIN_WIDTH = 260;

  const isCallMinimized = useCallStore((state) => state.isMinimized && !!state.activeCall);
  const showCallModalsInWindow = !((window as any).orbita?.openCallWindow);

  const maxSidebarWidth = useMemo(() => {
    return undefined;
  }, []);

  const handleBannerReconnect = useCallback(() => {
    setIsNetworkOnline(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('orbita:sync-now'));
    }
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    if (chatId === activeChatId) return;
    if (useChatStore.getState().isRecordingVoice) {
      setPendingSwitchChatId(chatId);
      setShowVoiceDiscardModal(true);
      return;
    }
    setActiveChat(chatId);
  }, [activeChatId, setActiveChat]);

  const handleSelectFoundSupport = useCallback(() => {
    supportService.initSupportChat(t, myCode);
    handleSelectChat(supportService.BOT_ID);
    setSearchQuery('');
  }, [t, myCode, handleSelectChat]);

  const handleSelectFoundBot = useCallback(() => {
    orbitosService.initOrbitosChat(t);
    handleSelectChat(orbitosService.BOT_ID);
    setSearchQuery('');
  }, [t, handleSelectChat]);

  const renderChat = useCallback((chat: Chat) => {
    const isActive = activeChatId === chat.id;
    const isPinned = pinnedChatsSet.has(chat.id);
    return (
      <ChatListItem
        key={chat.id}
        chat={chat}
        isActive={isActive}
        isPinned={isPinned}
        onSelect={handleSelectChat}
        onContextMenu={handleChatContextMenu}
        nickname={nickname || ''}
        myCode={myCode}
        t={t}
        isLightTheme={isLightTheme}
      />
    );
  }, [activeChatId, pinnedChatsSet, handleSelectChat, nickname, myCode, t, isLightTheme]);

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {!isMobileView && (
        <div
          className="flex flex-col items-center shrink-0 select-none"
          style={{
            width: '72px',
            backgroundColor: 'var(--surface-container-soft, rgba(255,255,255,0.02))',
            borderRight: '1px solid var(--border-color)',
          }}
        >
          <div
            className="w-full flex items-center justify-center"
            style={{
              height: '61px',
              boxSizing: 'border-box',
            }}
          >
            <button
              type="button"
              onClick={() => setIsMainMenuOpen(true)}
              aria-label={t('mainMenu.open_menu', 'Открыть меню')}
              className="flex items-center justify-center cursor-pointer transition-all active:scale-95 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--surface-container)] rounded-xl"
              style={{
                width: '40px',
                height: '40px',
                border: 'none',
                background: 'transparent',
                outline: 'none',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6h18M3 12h18M3 18h18"/>
              </svg>
            </button>
          </div>

          <button
            type="button"
            aria-label={t('common.all_chats', 'Все чаты')}
            className="w-full flex items-center justify-center cursor-pointer transition-all text-[var(--text-dim)] hover:text-[var(--text-main)]"
            style={{
              height: '64px',
              border: 'none',
              borderRadius: 0,
              backgroundColor: 'var(--surface-container-strong)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="24" height="24">
              <path fill="currentColor" d="M1.5 22C1.5 10.678 10.678 1.5 22 1.5c10.994 0 19.966 8.654 20.477 19.521A15.43 15.43 0 0 0 34 18.5c-8.56 0-15.5 6.94-15.5 15.5c0 3.129.927 6.041 2.521 8.477a20.4 20.4 0 0 1-9.602-2.915c-2.081.838-4.47 1.709-6.657 2.316c-1.657.46-3.15-.965-2.73-2.645c.566-2.27 1.438-4.722 2.304-6.823A20.4 20.4 0 0 1 1.5 22"/>
              <path fill="currentColor" d="M34 21.5c6.904 0 12.5 5.596 12.5 12.5c0 2.3-.622 4.458-1.707 6.31c.4.871.795 1.858 1.112 2.912c.507 1.681-1.023 3.133-2.675 2.593a29 29 0 0 1-2.802-1.093A12.44 12.44 0 0 1 34 46.5c-6.904 0-12.5-5.596-12.5-12.5S27.096 21.5 34 21.5"/>
            </svg>
          </button>
        </div>
      )}

      {(!isMobileView || !activeChatId) && (
        <ResizableSidebar
          defaultWidth={320}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={maxSidebarWidth}
          className="md:flex-none"
        >
          {inChatSearch?.isOpen ? (
            <InChatSidebarSearch
              onClose={closeInChatSearch}
              activeChatId={activeChatId}
              isMobileView={isMobileView}
            />
          ) : (
            <div className="flex flex-col h-full">
              {isMobileView && !activeChatId && (isCallMinimized ? <CallMiniPlayer /> : <GlobalAudioPlayer />)}

              <div
                className="px-4 py-1 select-none"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                }}
              >
                <div className="flex items-center min-w-0" style={{ width: '100%' }}>
                  {isMobileView && (
                    <button
                      type="button"
                      onClick={() => setIsMainMenuOpen(true)}
                      aria-label={t('mainMenu.open_menu', 'Открыть меню')}
                      className="flex items-center justify-center cursor-pointer transition-all active:scale-95 text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-[var(--surface-container)] rounded-full shrink-0"
                      style={{
                        width: '36px',
                        height: '36px',
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        marginRight: '8px',
                        padding: 0,
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20">
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6h18M3 12h18M3 18h18"/>
                      </svg>
                    </button>
                  )}
                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('common.search', 'Поиск')}
                      style={{
                        width: '100%',
                        height: '36px',
                        borderRadius: '999px',
                        border: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                        backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
                        color: 'var(--text-main, #e0e0e0)',
                        fontSize: '13px',
                        paddingLeft: '14px',
                        paddingRight: searchQuery ? '32px' : '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-dim, #9ca3af)',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 1,
                        }}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isMobileView && (
                <div
                  className="flex items-center px-4 pt-2.5 pb-1 gap-5 overflow-x-auto no-scrollbar select-none"
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <div className="relative pb-1.5 cursor-pointer text-[13px] font-semibold text-[var(--accent-color)] flex-shrink-0">
                    <span>{t('common.all', 'Все')}</span>
                    <div
                      className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                      style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                    />
                  </div>
                </div>
              )}

              {incomingFriendRequests.length > 0 && (
                <div className="px-4 pt-2.5 pb-1">
                  <button
                    onClick={() => setShowFriendRequestsModal(true)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-full hover:opacity-90 transition-opacity text-xs font-medium cursor-pointer shadow-none select-none"
                    style={{
                      borderRadius: '9999px',
                      border: 'none',
                      backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
                      color: 'var(--text-main, #ffffff)',
                    }}
                  >
                    <span className="font-semibold text-xs text-[var(--text-main)]">
                      {t('friendRequests.pending_banner', 'Запросы на переписку')}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded-full font-bold text-[11px]"
                      style={{
                        borderRadius: '9999px',
                        backgroundColor: 'var(--accent-color, #7C3AED)',
                        color: '#ffffff',
                      }}
                    >
                      {incomingFriendRequests.length}
                    </span>
                  </button>
                </div>
              )}

              <div
                className="relative flex-1 min-h-0 overflow-hidden flex flex-col"
                onMouseEnter={showChatScrollbar}
                onMouseLeave={handleChatListMouseLeave}
              >
                <div
                  ref={chatListScrollRef}
                  onScroll={handleChatListScroll}
                  className="flex-1 chat-list-scrollbar select-none"
                  style={{
                    marginTop: '9px',
                    paddingTop: '0px',
                    overflowY: 'scroll',
                    overflowX: 'hidden',
                  }}
                >
                  {isMobileView && chats.length === 0 && (isServerConnected && isNetworkOnline) ? (
                    <div className="h-full flex items-center justify-center">
                      <ChatPlaceholder />
                    </div>
                  ) : (
                    <div className="flex flex-col w-full">
                      {(!isServerConnected || !isNetworkOnline) && (
                        <div
                          role="button"
                          tabIndex={-1}
                          onClick={handleBannerReconnect}
                          aria-label={!isNetworkOnline ? t('common.network_offline_title') : t('common.network_connecting_title')}
                          className="group relative cursor-pointer select-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
                          style={{
                            borderRadius: 0,
                            width: '100%',
                            height: '64px',
                            minHeight: '64px',
                            maxHeight: '64px',
                            backgroundColor: '#F5C518',
                            color: '#000000',
                            border: 'none',
                            outline: 'none',
                            boxShadow: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            padding: '6px 14px',
                            boxSizing: 'border-box',
                            userSelect: 'none',
                            flexShrink: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'background-color 0.12s ease',
                          }}
                        >
                          <div className="flex items-center min-w-0 w-full h-full">
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                marginRight: 10,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {!isNetworkOnline ? (
                                <WifiOff size={19} color="#000000" strokeWidth={2.2} />
                              ) : (
                                <svg
                                  className="animate-spin"
                                  viewBox="0 0 24 24"
                                  width="19"
                                  height="19"
                                  fill="none"
                                  stroke="#000000"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  color: '#000000',
                                  fontFamily: 'inherit',
                                  lineHeight: '15px',
                                  marginBottom: '2px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {!isNetworkOnline ? t('common.network_offline_title') : t('common.network_connecting_title')}
                              </span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 400,
                                  color: '#1a1a1a',
                                  lineHeight: '13px',
                                  whiteSpace: 'normal',
                                  wordBreak: 'break-word',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {!isNetworkOnline ? t('common.network_offline_desc') : t('common.network_connecting_desc')}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      {isSearchingChannel && (
                        <div className="flex items-center justify-center py-4">
                          <div
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              border: '2px solid rgba(255,255,255,0.2)',
                              borderTopColor: 'var(--accent-color, #7C3AED)',
                              animation: 'spin 0.8s linear infinite',
                            }}
                          />
                        </div>
                      )}
                      {searchChannelResult && (
                        <div className="px-2 py-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)] px-3 py-1">
                            {t('createModal.found_community', 'Найдено сообщество')}
                          </div>
                          <div
                            onClick={() => handleSelectFoundChannel(searchChannelResult)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] transition-colors cursor-pointer"
                          >
                            <Avatar
                              src={searchChannelResult.avatarUrl}
                              alt={searchChannelResult.name}
                              className="w-11 h-11 rounded-full flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-[var(--text-main)] truncate">
                                  {searchChannelResult.name}
                                </span>
                                {searchChannelResult.isOfficial && (
                                  <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
                                    Orbita
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">
                                {searchChannelResult.description || `${searchChannelResult.subscribersCount || 1} ${t('createModal.subscribers', 'подписчиков')}`}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFoundChannel(searchChannelResult);
                              }}
                              aria-label={chats.some(c => c.id === searchChannelResult.id) ? t('common.open', 'Открыть') : t('common.join', 'Вступить')}
                              className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
                            >
                              {chats.some(c => c.id === searchChannelResult.id)
                                ? t('common.open', 'Открыть')
                                : t('common.join', 'Вступить')}
                            </button>
                          </div>
                        </div>
                      )}
                      {isSupportFound && (
                        <div className="px-2 py-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)] px-3 py-1">
                            {t('createModal.found_support', 'Служба поддержки')}
                          </div>
                          <div
                            onClick={handleSelectFoundSupport}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] transition-colors cursor-pointer"
                          >
                            <BotAvatar className="w-11 h-11" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-[var(--text-main)] truncate">
                                  {t('support.name', 'Техническая поддержка')}
                                </span>
                                <VerifiedBadge size={15} className="flex-shrink-0" />
                                <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
                                  Support
                                </span>
                              </div>
                              <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">
                                {t('support.description', 'Официальная служба технической поддержки мессенджера Orbita')}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFoundSupport();
                              }}
                              aria-label={t('common.open', 'Открыть')}
                              className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
                            >
                              {t('common.open', 'Открыть')}
                            </button>
                          </div>
                        </div>
                      )}
                      {isBotFound && (
                        <div className="px-2 py-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)] px-3 py-1">
                            {t('createModal.found_bot', 'Официальный бот')}
                          </div>
                          <div
                            onClick={handleSelectFoundBot}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-container-strong)] transition-colors cursor-pointer"
                          >
                            <BotAvatar className="w-11 h-11" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm text-[var(--text-main)] truncate">
                                  {t('orbitos.name', 'ORBITA')}
                                </span>
                                <VerifiedBadge size={15} className="flex-shrink-0" />
                                <span className="px-1.5 py-0.5 rounded bg-[var(--accent-color)]/20 text-[var(--accent-color)] text-[10px] font-bold">
                                  AI
                                </span>
                              </div>
                              <div className="text-xs text-[var(--text-dim)] truncate mt-0.5">
                                {t('orbitos.description', 'Официальный системный помощник мессенджера Orbita')}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFoundBot();
                              }}
                              aria-label={t('common.open', 'Открыть')}
                              className="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-semibold hover:opacity-90 transition-opacity border-none outline-none cursor-pointer flex-shrink-0"
                            >
                              {t('common.open', 'Открыть')}
                            </button>
                          </div>
                        </div>
                      )}
                      {visibleChats.map((chat) => renderChat(chat))}
                    </div>
                  )}
                </div>

                <div
                  ref={chatTrackRef}
                  className="overlay-scroll-track"
                  onMouseDown={(e) => handleScrollbarTrackMouseDown(e, chatListScrollRef.current)}
                  style={{
                    top: '15px',
                    bottom: '6px',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'auto',
                  }}
                />

                <div
                  ref={chatThumbRef}
                  className="overlay-scroll-thumb"
                  onMouseDown={(e) => handleScrollbarThumbMouseDown(e, chatListScrollRef.current)}
                  style={{
                    top: '15px',
                    opacity: 0,
                    transition: 'opacity 0.2s ease',
                    willChange: 'transform',
                    pointerEvents: 'auto',
                  }}
                />
              </div>
            </div>
          )}
        </ResizableSidebar>
      )}

      <div className="flex flex-1 min-w-0 relative flex-col">
        {!(isMobileView && !activeChatId) && (isCallMinimized ? <CallMiniPlayer /> : <GlobalAudioPlayer />)}

        {(!isMobileView || activeChatId) && (
          <main
            className="flex-1 flex flex-col rounded-none overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-primary)',
              minWidth: isMobileView ? 0 : CHAT_MIN_WIDTH,
            }}
          >
            <div className="flex flex-col h-full relative">
              <div className="relative flex flex-col flex-1 min-h-0">
                {activeChatId && chats.some(c => c.id === activeChatId) ? (
                  <ChatWindow
                    isMobileView={isMobileView}
                    onBack={() => {
                      if (useChatStore.getState().isRecordingVoice) {
                        setPendingSwitchChatId('__CLOSE__');
                        setShowVoiceDiscardModal(true);
                        return;
                      }
                      setActiveChat(null);
                    }}
                  />
                ) : (
                  <ChatPlaceholder />
                )}
              </div>
            </div>
          </main>
        )}
      </div>

        <AnimatePresence>
          {currentView === 'settings' && (
            <SettingsScreen />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeProfileChatId && (
            <ProfileScreen
              chatId={activeProfileChatId}
              onClose={() => setActiveProfileChatId(null)}
              isMobileView={isMobileView}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMobileView && inChatSearch?.isOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-x-0 bottom-0 top-[30px] z-[100] flex flex-col"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <InChatSidebarSearch
                onClose={closeInChatSearch}
                activeChatId={activeChatId}
                isMobileView={true}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {connectModalConfig.isOpen && (
          <ConnectModal
            type={connectModalConfig.type}
            onClose={() => setConnectModalConfig(prev => ({ ...prev, isOpen: false }))}
            onConnectRequest={handleConnectRequest}
          />
        )}

        <MainMenuDrawer
          isOpen={isMainMenuOpen}
          onClose={() => setIsMainMenuOpen(false)}
          onOpenProfile={() => {
            setIsMainMenuOpen(false);
            setIsMyProfileOpen(true);
          }}
          onOpenCreateGroup={() => {
            setIsMainMenuOpen(false);
            setConnectModalConfig({ isOpen: true, type: 'group' });
          }}
          onOpenCreateChannel={() => {
            setIsMainMenuOpen(false);
            setConnectModalConfig({ isOpen: true, type: 'channel' });
          }}
          onOpenCreateChat={() => {
            setIsMainMenuOpen(false);
            setConnectModalConfig({ isOpen: true, type: 'friend' });
          }}
          onOpenCalls={() => {
            setIsMainMenuOpen(false);
            setShowCallsModal(true);
          }}
          onOpenSavedMessages={() => {
            setIsMainMenuOpen(false);
            setActiveChat('notes');
          }}
          onOpenSettings={() => {
            setIsMainMenuOpen(false);
            handleOpenSettings();
          }}
        />

        <MyProfileModal
          isOpen={isMyProfileOpen}
          onClose={() => setIsMyProfileOpen(false)}
          isMobileView={isMobileView}
        />

        <CallsModal
          isOpen={showCallsModal}
          onClose={() => setShowCallsModal(false)}
        />

        <FriendRequestsModal
          isOpen={showFriendRequestsModal}
          onClose={() => setShowFriendRequestsModal(false)}
          onAccept={handleAcceptFriendRequest}
          onReject={handleRejectFriendRequest}
        />

        <AnimatePresence>
          {showDeleteModal && (
            <DeleteAccountModal
              isOpen={showDeleteModal}
              onClose={() => setShowDeleteModal(false)}
              onConfirm={handleDeleteAccount}
            />
          )}
        </AnimatePresence>

        <ActionConfirmModal
          isOpen={confirmModal.isOpen}
          type={confirmModal.type}
          chatName={confirmModal.chatName}
          avatarUrl={confirmModal.avatarUrl}
          isNotes={confirmModal.isNotes}
          onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false, type: null }))}
          onConfirm={() => {
            if (confirmModal.type === 'clear_history') {
              handleClearHistory(confirmModal.chatId);
            } else if (confirmModal.type === 'delete_chat' || confirmModal.type === 'leave_channel') {
              handleDeleteChat(confirmModal.chatId);
            }
            setConfirmModal(prev => ({ ...prev, isOpen: false, type: null }));
          }}
        />

        <ActionConfirmModal
          isOpen={showVoiceDiscardModal}
          type="discard_voice"
          onClose={() => {
            setShowVoiceDiscardModal(false);
            setPendingSwitchChatId(null);
          }}
          onConfirm={() => {
            window.dispatchEvent(new CustomEvent('orbita:cancel-voice-recording'));
            useChatStore.getState().setIsRecordingVoice(false);
            setShowVoiceDiscardModal(false);
            if (pendingSwitchChatId) {
              if (pendingSwitchChatId === '__CLOSE__') {
                setActiveChat(null);
              } else {
                setActiveChat(pendingSwitchChatId);
              }
              setPendingSwitchChatId(null);
            }
          }}
        />

        {showCallModalsInWindow && <IncomingCallModal />}
        {showCallModalsInWindow && <CallWindow />}
        <DevicePermissionModal />

      <GlobalAudioEngine />

      <AnimatePresence>
        {chatContextMenu.visible && (
          <motion.div
            ref={chatMenuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="fixed z-[300] min-w-[190px] backdrop-blur-xl select-none overflow-hidden py-1 shadow-2xl"
            style={{
              left: Math.min(chatContextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 200),
              top: Math.min(chatContextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 170),
              transformOrigin: 'top left',
              backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const iconColor = 'var(--text-main)';
              const baseBtnClass =
                "w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] font-normal normal-case transition-colors hover:bg-[var(--surface-container-strong)] rounded-none text-left select-none";
              const isNotes = chatContextMenu.chatId === 'notes';
              const targetChat = chats.find(c => c.id === chatContextMenu.chatId);
              const isChannel = targetChat?.type === 'channel';
              const isPinned = pinnedChatsSet.has(chatContextMenu.chatId);
              const isMuted = targetChat?.muted;

              return (
                <div className="flex flex-col">
                  {!isNotes && (
                    <button
                      onClick={() => handlePinChat(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        {isPinned ? (
                          <CustomUnpinIcon size={16} style={{ color: iconColor }} />
                        ) : (
                          <CustomPinIcon size={16} style={{ color: iconColor }} />
                        )}
                      </span>
                      <span className="whitespace-nowrap">{isPinned ? t('common.unpin') : t('common.pin')}</span>
                    </button>
                  )}

                  {!isNotes && (
                    <button
                      onClick={() => handleMuteChat(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        {isMuted ? (
                          <CustomUnmuteIcon size={16} style={{ color: iconColor }} />
                        ) : (
                          <CustomMuteIcon size={16} style={{ color: iconColor }} />
                        )}
                      </span>
                      <span className="whitespace-nowrap">
                        {isMuted ? t('common.unmute_notifications') : t('common.mute_notifications')}
                      </span>
                    </button>
                  )}

                  {!isNotes && !isChannel && (
                    <button
                      onClick={() => requestClearHistory(chatContextMenu.chatId)}
                      className={baseBtnClass}
                      style={{ color: 'var(--text-main)' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                        <CustomClearHistoryIcon size={16} style={{ color: iconColor }} />
                      </span>
                      <span className="whitespace-nowrap">{t('common.clear_history')}</span>
                    </button>
                  )}

                  <button
                    onClick={() => requestDeleteChat(chatContextMenu.chatId)}
                    className={baseBtnClass}
                    style={{ color: '#ef4444' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
                      {isChannel ? (
                        <LogOut size={16} style={{ color: '#ef4444' }} />
                      ) : (
                        <Trash size={16} style={{ color: '#ef4444' }} />
                      )}
                    </span>
                    <span className="whitespace-nowrap">
                      {isChannel ? t('channel.leave_channel', 'Покинуть канал') : t('common.delete_chat')}
                    </span>
                  </button>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-color, rgba(255,255,255,0.05)); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--accent-color, #7C3AED) 20%, transparent); }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};