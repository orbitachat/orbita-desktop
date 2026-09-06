import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { ThemeId, DEFAULT_CHAT_COLOR, applyThemeToRoot } from '../theme';
import { RatchetState } from '../lib/double-ratchet';
import { generateChatId as genChatId } from '../lib/crypto';
import { mediaManager } from '../services/mediaManager';
import { supabaseService } from '../services/supabaseService';

export type RotationSpeed = 600 | 3600 | 10800 | 18000 | 36000 | 0;

export type FontFamily =
  | 'system'
  | 'Segoe UI'
  | 'Segoe UI Black'
  | 'Inter'
  | 'Roboto'
  | 'Open Sans'
  | 'Lato'
  | 'Montserrat'
  | 'Poppins'
  | 'Nunito'
  | 'Rubik'
  | 'Fira Sans'
  | 'Ubuntu'
  | 'Manrope'
  | 'Arial'
  | 'Arial Black'
  | 'Trebuchet MS'
  | 'Verdana'
  | 'Tahoma'
  | 'Georgia'
  | 'Times New Roman'
  | 'Merriweather'
  | 'Playfair Display'
  | 'Fira Code'
  | 'JetBrains Mono'
  | 'Consolas'
  | 'Courier New'
  | 'Comic Sans MS'
  | 'Caveat'
  | 'Pacifico';

export const FONT_MAP: Record<FontFamily, string> = {
  'system': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Roboto, sans-serif",
  'Segoe UI': "'Segoe UI', 'Segoe', system-ui, sans-serif",
  'Segoe UI Black': "'Segoe UI Black', 'Segoe UI', system-ui, sans-serif",
  'Inter': "'Inter', system-ui, sans-serif",
  'Roboto': "'Roboto', sans-serif",
  'Open Sans': "'Open Sans', sans-serif",
  'Lato': "'Lato', sans-serif",
  'Montserrat': "'Montserrat', sans-serif",
  'Poppins': "'Poppins', sans-serif",
  'Nunito': "'Nunito', sans-serif",
  'Rubik': "'Rubik', sans-serif",
  'Fira Sans': "'Fira Sans', sans-serif",
  'Ubuntu': "'Ubuntu', sans-serif",
  'Manrope': "'Manrope', sans-serif",
  'Arial': "Arial, Helvetica, sans-serif",
  'Arial Black': "'Arial Black', 'Arial Bold', sans-serif",
  'Trebuchet MS': "'Trebuchet MS', sans-serif",
  'Verdana': "Verdana, Geneva, sans-serif",
  'Tahoma': "Tahoma, Geneva, sans-serif",
  'Georgia': "Georgia, serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Merriweather': "'Merriweather', Georgia, serif",
  'Playfair Display': "'Playfair Display', Georgia, serif",
  'Fira Code': "'Fira Code', monospace",
  'JetBrains Mono': "'JetBrains Mono', monospace",
  'Consolas': "Consolas, 'Courier New', monospace",
  'Courier New': "'Courier New', Courier, monospace",
  'Comic Sans MS': "'Comic Sans MS', 'Comic Sans', cursive",
  'Caveat': "'Caveat', cursive",
  'Pacifico': "'Pacifico', cursive",
};
export type Language =
  | 'ru' | 'en' | 'zh' | 'zh-Hant'
  | 'de' | 'fr' | 'es' | 'it'
  | 'ja' | 'ko' | 'pt' | 'tr'
  | 'uk' | 'be' | 'kk' | 'hi'
  | 'nl' | 'pl'
  | null;
export type HeaderTitleOption = 'orbita' | 'nickname' | 'all_chats';
export type NotificationPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right';
export type NotificationPreviewTheme = 'dark' | 'light';
export type IconOption = 'orbita1' | 'orbita4';

export interface MediaItem {
  type: 'photo' | 'video' | 'audio' | 'file' | 'gif';
  url: string;
  key?: string;
  name?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  audioMetadata?: AudioMetadata;
}

interface AudioMetadata {
  title: string;
  artist: string;
  duration: number;
  size: number;
  cover?: string | null;
}

export interface LinkPreviewData {
  url: string;
  siteName?: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface Message {
  id?: string;
  senderId?: string;
  sender: string;
  isOutgoing?: boolean;
  text: string;
  encryptedText?: string;
  index?: number;
  time: number;
  ttlSeconds?: number;
  expiresAt?: number;
  read?: boolean;
  status?: 'sent' | 'delivered' | 'read';
  mediaType?: 'photo' | 'video' | 'audio' | 'voice' | 'file' | 'call' | 'emoji' | 'gif' | 'sticker' | null;
  mediaUrl?: string;
  mediaName?: string;
  mediaKey?: string;
  mime?: string;
  mediaItems?: MediaItem[];
  audioMetadata?: AudioMetadata;
  width?: number;
  height?: number;
  duration?: number;
  waveform?: number[];
  reactions?: Record<string, string[]>;
  linkPreview?: LinkPreviewData;
}

export function isMessageOutgoing(
  msg: Message | null | undefined,
  myCode?: string | null,
  myNickname?: string | null,
  chat?: Chat | null
): boolean {
  if (!msg) return false;
  if (typeof msg.isOutgoing === 'boolean') {
    return msg.isOutgoing;
  }
  if (myCode && msg.senderId) {
    return msg.senderId === myCode;
  }
  if (msg.status !== undefined) {
    return true;
  }
  if (chat && chat.peerCode && msg.senderId) {
    return msg.senderId !== chat.peerCode;
  }
  if (chat && chat.type === 'private' && myNickname && chat.name === myNickname) {
    return msg.status !== undefined;
  }
  return myNickname ? msg.sender === myNickname : false;
}

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'channel';
  name: string;
  lastMsg: string;
  online: boolean;
  sharedSecret?: string;
  ratchetState?: RatchetState;
  pinnedMessage?: { id?: string; messageId?: string; sender: string; text: string; time: number } | null;
  role?: 'owner' | 'admin' | 'member';
  lastSeen?: number;
  members?: Array<{ nickname: string; role: 'owner' | 'admin' | 'member'; lastSeen: number }>;
  inviteCode?: string;
  inviteCodeTTL?: number;
  createdAt?: number;
  unreadCount?: number;
  lastReadTimestamp?: number;
  isChatInitiator?: boolean;
  avatarUrl?: string;
  muted?: boolean;
  notificationsEnabled?: boolean;
  description?: string;
  creatorNickname?: string;
  subscribersCount?: number;
  isOwner?: boolean;
  isOfficial?: boolean;
  channelKey?: string;
  peerCode?: string;
  isBlocked?: boolean;
}

export interface IncomingFriendRequest {
  id: string;
  chatId: string;
  senderNickname: string;
  senderCode: string;
  senderPublicKey: string;
  avatarUrl?: string | null;
  createdAt: number;
}

export interface ActiveProxyInfo {
  protocol: string;
  address: string;
  port: number;
}

export interface InChatSearchState {
  isOpen: boolean;
  scope: 'this_chat' | 'all_chats';
  query: string;
  jumpTarget: {
    chatId: string;
    messageIndex: number;
    messageId?: string;
    timestamp: number;
  } | null;
}

const TEXT_SCALE_MIN = 75;
const TEXT_SCALE_MAX = 200;
const MAX_MESSAGES_PER_CHAT = 1000;

export function clampTextScale(value: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : 100;
  return Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, n));
}

// Кастомный storage через IPC с безопасным фоллбэком на localStorage
const ipcStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    if ((window as any).orbita?.storageGet) {
      return await (window as any).orbita.storageGet(name);
    }
    return localStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if ((window as any).orbita?.storageSet) {
      await (window as any).orbita.storageSet(name, value);
    } else {
      localStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    if ((window as any).orbita?.storageRemove) {
      await (window as any).orbita.storageRemove(name);
    } else {
      localStorage.removeItem(name);
    }
  },
};

// Инициализация миграции при загрузке стора
if (typeof window !== 'undefined' && (window as any).orbita?.storageMigrate) {
  (window as any).orbita.storageMigrate().catch((err: any) => {
    console.error('[Migration] Failed to migrate from localStorage:', err);
  });
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  activeProfileChatId: string | null;
  messagesByChatId: Record<string, Message[]>;
  passcode: string | null;
  currentTheme: ThemeId;
  chatColor: string;
  currentView: 'chats' | 'settings';
  dotOverlay: boolean;
  blurProtection: boolean;
  hideOnBackground: boolean;
  hideFromScreenCapture: boolean;
  proxyActive: boolean;
  activeProxyInfo: ActiveProxyInfo | null;
  myCode: string;
  codeRotationSpeed: RotationSpeed;
  nextCodeRotationTime: number;
  messageTTLSeconds: number;
  incomingFriendRequests: IncomingFriendRequest[];
  eyeCareEnabled: boolean;
  eyeCareOpacity: number;
  eyeCareDensity: number;
  screenCaptureProtection: boolean;
  minimizeToTray: boolean;
  isHandshaking: boolean;
  fontFamily: FontFamily;
  textScale: number;
  dotColor: string;
  language: Language;
  headerEnabled: boolean;
  headerTitle: HeaderTitleOption;
  ringEnabled: boolean;
  notificationCount: number;
  notificationPosition: NotificationPosition;
  notificationHideContent: boolean;
  notificationPreviewTheme: NotificationPreviewTheme;
  bubbleRadius: number;
  notificationSoundEnabled: boolean;
  notificationsEnabled: boolean;
  notificationFlashTaskbar: boolean;
  notificationVolume: number;
  notificationShowName: boolean;
  notificationShowText: boolean;
  notificationNativeWindows: boolean;
  notificationRespectFocus: boolean;
  appIcon: IconOption;
  notificationIcon: IconOption;

  voiceCallsEnabled: boolean;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  linkPreviewsEnabled: boolean;

  recentEmojis: string[];

  isEmojiPanelOpen: boolean;
  toggleEmojiPanel: () => void;
  setEmojiPanelOpen: (open: boolean) => void;

  isMediaViewerOpen: boolean;
  setMediaViewerOpen: (open: boolean) => void;

  isRecordingVoice: boolean;
  setIsRecordingVoice: (recording: boolean) => void;

  autoUpdate: boolean;
  showInSystemTray: boolean;
  autoLaunch: boolean;
  sendOnEnter: boolean;
  useImprovedPlayer: boolean;
  noiseSuppressionVoice: boolean;
  noiseSuppressionCalls: boolean;
  setNoiseSuppressionVoice: (enabled: boolean) => void;
  setNoiseSuppressionCalls: (enabled: boolean) => void;

  callSoundsEnabled: boolean;
  setCallSoundsEnabled: (enabled: boolean) => void;
  alwaysRelayCalls: boolean;
  setAlwaysRelayCalls: (enabled: boolean) => void;
  selectedCameraId: string;
  setSelectedCameraId: (id: string) => void;
  selectedMicrophoneId: string;
  setSelectedMicrophoneId: (id: string) => void;
  selectedSpeakerId: string;
  setSelectedSpeakerId: (id: string) => void;
  screenProtectionEnabled: boolean;
  setScreenProtectionEnabled: (enabled: boolean) => void;
  hideMenuBar: boolean;
  setHideMenuBar: (hide: boolean) => void;

  cacheSizeLimit: number;
  mediaCacheLimit: number;
  cacheCleanupAge: number;

  autoLoadMedia: boolean;

  draftsByChatId: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;

  inChatSearch: InChatSearchState;
  openInChatSearch: (scope?: 'this_chat' | 'all_chats') => void;
  closeInChatSearch: () => void;
  setInChatSearchScope: (scope: 'this_chat' | 'all_chats') => void;
  setInChatSearchQuery: (query: string) => void;
  jumpToChatMessage: (chatId: string, messageIndex: number, messageId?: string) => void;

  setMyCode: (code: string) => void;
  setCodeRotationSpeed: (speed: RotationSpeed) => void;
  setNextCodeRotationTime: (time: number) => void;
  setActiveChat: (id: string | null) => void;
  setActiveProfileChatId: (id: string | null) => void;
  addChat: (chat: Partial<Chat> & { ratchetState?: RatchetState; id?: string }) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  updateLastMsg: (chatId: string, msg: string) => void;
  addMessage: (chatId: string, message: Message, encryptedText?: string, index?: number) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, newText: string, encryptedText?: string, index?: number) => void;
  toggleReaction: (chatId: string, messageIndexOrId: number | string, emoji: string, user: string) => void;
  setReaction: (chatId: string, messageIndexOrId: number | string, emoji: string, user: string, action?: 'add' | 'remove' | 'toggle') => 'add' | 'remove';
  syncReactionsFromSupabase: (chatId: string) => Promise<void>;
  getMessages: (chatId: string) => Message[];
  setPasscode: (code: string | null) => void;
  setTheme: (theme: ThemeId) => void;
  setChatColor: (color: string) => void;
  resetChatColor: () => void;
  toggleDots: () => void;
  setCurrentView: (view: 'chats' | 'settings') => void;
  initialSettingsTab?: string;
  openSettings: (tab?: string) => void;
  setBlurProtection: (type: 'hideOnBackground' | 'hideFromScreenCapture' | 'main', val: boolean) => void;
  setProxyActive: (active: boolean, info?: ActiveProxyInfo | null) => void;
  setMessageTTL: (seconds: number) => void;
  setEyeCareEnabled: (enabled: boolean) => void;
  setEyeCareOpacity: (opacity: number) => void;
  setEyeCareDensity: (density: number) => void;
  setScreenCaptureProtection: (enabled: boolean) => void;
  setMinimizeToTray: (enabled: boolean) => void;
  resetChats: () => void;
  createGroupChat: (name: string, ttl: number) => void;
  joinGroupByCode: (inviteCode: string, callback: (success: boolean, error?: string) => void) => void;
  setIsHandshaking: (val: boolean) => void;
  markChatAsRead: (chatId: string) => void;
  getUnreadChatsCount: () => number;
  closeChat: () => void;
  setFontFamily: (font: FontFamily) => void;
  setTextScale: (scale: number) => void;
  setDotColor: (color: string) => void;
  setLanguage: (lang: Language) => void;
  setHeaderEnabled: (enabled: boolean) => void;
  setHeaderTitle: (title: HeaderTitleOption) => void;
  setRingEnabled: (enabled: boolean) => void;
  setNotificationCount: (count: number) => void;
  setNotificationPosition: (position: NotificationPosition) => void;
  setNotificationHideContent: (hide: boolean) => void;
  setNotificationPreviewTheme: (theme: NotificationPreviewTheme) => void;
  setBubbleRadius: (radius: number) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationFlashTaskbar: (enabled: boolean) => void;
  setNotificationVolume: (volume: number) => void;
  setNotificationShowName: (show: boolean) => void;
  setNotificationShowText: (show: boolean) => void;
  setNotificationNativeWindows: (enabled: boolean) => void;
  setNotificationRespectFocus: (enabled: boolean) => void;
  setAppIcon: (icon: IconOption) => void;
  setNotificationIcon: (icon: IconOption) => void;
  toggleChatMuted: (chatId: string) => void;
  toggleChatNotifications: (chatId: string) => void;
  toggleChatBlocked: (chatId: string) => void;

  setVoiceCallsEnabled: (enabled: boolean) => void;
  setReadReceiptsEnabled: (enabled: boolean) => void;
  setTypingIndicatorsEnabled: (enabled: boolean) => void;
  setLinkPreviewsEnabled: (enabled: boolean) => void;

  addRecentEmoji: (emoji: string) => void;
  getRecentEmojis: () => string[];

  setAutoUpdate: (enabled: boolean) => void;
  setShowInSystemTray: (enabled: boolean) => void;
  setAutoLaunch: (enabled: boolean) => void;
  setSendOnEnter: (enabled: boolean) => void;
  setUseImprovedPlayer: (enabled: boolean) => void;

  setCacheSizeLimit: (limit: number) => void;
  setMediaCacheLimit: (limit: number) => void;
  setCacheCleanupAge: (age: number) => void;

  setAutoLoadMedia: (enabled: boolean) => void;

  deleteChat: (chatId: string) => void;
  addIncomingFriendRequest: (req: IncomingFriendRequest) => void;
  removeIncomingFriendRequest: (id: string) => void;
  clearIncomingFriendRequests: () => void;
  addChannelChat: (channel: {
    id: string;
    name: string;
    description?: string;
    avatarUrl?: string | null;
    creatorNickname?: string;
    isOwner?: boolean;
    isOfficial?: boolean;
    subscribersCount?: number;
  }) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      activeProfileChatId: null,
      messagesByChatId: {},
      passcode: null,
      currentTheme: 'system',
      chatColor: DEFAULT_CHAT_COLOR,
      currentView: 'chats',
      dotOverlay: true,
      blurProtection: false,
      hideOnBackground: false,
      hideFromScreenCapture: false,
      proxyActive: false,
      activeProxyInfo: null,
      myCode: '',
      codeRotationSpeed: 0,
      nextCodeRotationTime: Infinity,
      messageTTLSeconds: 0,
      incomingFriendRequests: [],
      addIncomingFriendRequest: (req) =>
        set((state) => {
          if (state.incomingFriendRequests.some((r) => r.id === req.id || r.chatId === req.chatId)) {
            return state;
          }
          return { incomingFriendRequests: [req, ...state.incomingFriendRequests] };
        }),
      removeIncomingFriendRequest: (id) =>
        set((state) => ({
          incomingFriendRequests: state.incomingFriendRequests.filter((r) => r.id !== id && r.chatId !== id),
        })),
      clearIncomingFriendRequests: () => set({ incomingFriendRequests: [] }),
      eyeCareEnabled: false,
      eyeCareOpacity: 0.22,
      eyeCareDensity: 5,
      screenCaptureProtection: false,
      minimizeToTray: false,
      isHandshaking: false,
      fontFamily: 'system',
      textScale: 100,
      dotColor: '#22c55e',
      language: null,
      headerEnabled: true,
      headerTitle: 'orbita',
      ringEnabled: true,
      notificationCount: 3,
      notificationPosition: 'bottom-right',
      notificationHideContent: false,
      notificationPreviewTheme: 'dark',
      bubbleRadius: 16,
      notificationSoundEnabled: true,
      notificationsEnabled: true,
      notificationFlashTaskbar: true,
      notificationVolume: 100,
      notificationShowName: true,
      notificationShowText: true,
      notificationNativeWindows: false,
      notificationRespectFocus: false,
      appIcon: 'orbita1',
      notificationIcon: 'orbita1',

      voiceCallsEnabled: true,
      readReceiptsEnabled: true,
      typingIndicatorsEnabled: true,
      linkPreviewsEnabled: true,

      recentEmojis: [],

      isEmojiPanelOpen: false,
      toggleEmojiPanel: () => set((state) => ({ isEmojiPanelOpen: !state.isEmojiPanelOpen })),
      setEmojiPanelOpen: (open) => set({ isEmojiPanelOpen: open }),

      isMediaViewerOpen: false,
      setMediaViewerOpen: (open) => set({ isMediaViewerOpen: open }),

      isRecordingVoice: false,
      setIsRecordingVoice: (recording) => set({ isRecordingVoice: recording }),

      autoUpdate: true,
      showInSystemTray: true,
      autoLaunch: false,
      sendOnEnter: true,
      useImprovedPlayer: false,
      noiseSuppressionVoice: true,
      noiseSuppressionCalls: true,

      callSoundsEnabled: true,
      alwaysRelayCalls: true,
      selectedCameraId: '',
      selectedMicrophoneId: '',
      selectedSpeakerId: '',
      screenProtectionEnabled: false,
      hideMenuBar: false,

      cacheSizeLimit: 5 * 1024 * 1024 * 1024,
      mediaCacheLimit: 2.5 * 1024 * 1024 * 1024,
      cacheCleanupAge: 7 * 24 * 60 * 60 * 1000,

      autoLoadMedia: false,

      draftsByChatId: {},
      setDraft: (chatId, text) =>
        set((state) => ({
          draftsByChatId: {
            ...state.draftsByChatId,
            [chatId]: text,
          },
        })),
      clearDraft: (chatId) =>
        set((state) => {
          const next = { ...state.draftsByChatId };
          delete next[chatId];
          return { draftsByChatId: next };
        }),

      inChatSearch: {
        isOpen: false,
        scope: 'this_chat',
        query: '',
        jumpTarget: null,
      },
      openInChatSearch: (scope = 'this_chat') =>
        set((state) => ({
          inChatSearch: {
            ...state.inChatSearch,
            isOpen: true,
            scope,
          },
        })),
      closeInChatSearch: () =>
        set((state) => ({
          inChatSearch: {
            ...state.inChatSearch,
            isOpen: false,
            query: '',
          },
        })),
      setInChatSearchScope: (scope) =>
        set((state) => ({
          inChatSearch: {
            ...state.inChatSearch,
            scope,
          },
        })),
      setInChatSearchQuery: (query) =>
        set((state) => ({
          inChatSearch: {
            ...state.inChatSearch,
            query,
          },
        })),
      jumpToChatMessage: (chatId, messageIndex, messageId) => {
        const currentActive = get().activeChatId;
        if (currentActive !== chatId) {
          get().setActiveChat(chatId);
        }
        set((state) => ({
          inChatSearch: {
            ...state.inChatSearch,
            jumpTarget: {
              chatId,
              messageIndex,
              messageId,
              timestamp: Date.now(),
            },
          },
        }));
      },

      setMyCode: (code) => set({ myCode: code }),
      setCodeRotationSpeed: (speed) => set({ codeRotationSpeed: speed }),
      setNextCodeRotationTime: (time) => set({ nextCodeRotationTime: time }),
      setActiveChat: (id) => {
        set({ activeChatId: id });
        if (id) {
          const chat = get().chats.find(c => c.id === id);
          if (chat) {
            set({
              chats: get().chats.map(c =>
                c.id === id ? { ...c, unreadCount: 0, lastReadTimestamp: Date.now() } : c
              ),
            });
          }
        }
      },
      setActiveProfileChatId: (id) => set({ activeProfileChatId: id }),
      addChat: (newChat) => {
        console.log('[ChatStore] addChat called with:', newChat.id, newChat.name);
        const chatEntry: Chat = {
          id: newChat.id || genChatId(),
          type: newChat.type || 'private',
          name: newChat.name || 'Unknown',
          lastMsg: newChat.lastMsg || 'E2EE_SECURE_CHANNEL_READY',
          online: newChat.online ?? false,
          sharedSecret: newChat.sharedSecret,
          ratchetState: newChat.ratchetState,
          pinnedMessage: newChat.pinnedMessage || null,
          role: newChat.role || 'member',
          lastSeen: newChat.lastSeen,
          members: newChat.members || [],
          inviteCode: newChat.inviteCode,
          inviteCodeTTL: newChat.inviteCodeTTL,
          createdAt: newChat.createdAt || Date.now(),
          unreadCount: newChat.unreadCount || 0,
          lastReadTimestamp: newChat.lastReadTimestamp || Date.now(),
          isChatInitiator: newChat.isChatInitiator ?? false,
          avatarUrl: newChat.avatarUrl,
          muted: newChat.muted ?? false,
          notificationsEnabled: newChat.notificationsEnabled ?? true,
          peerCode: newChat.peerCode,
        };
        set((state) => {
          const exists = state.chats.find(c => c.id === chatEntry.id);
          if (exists) {
            console.log('[ChatStore] Updating existing chat:', chatEntry.id);
            return {
              chats: state.chats.map(c => c.id === chatEntry.id ? { ...c, ...chatEntry } : c)
            };
          }
          console.log('[ChatStore] Adding new chat:', chatEntry.id);
          return { chats: [...state.chats, chatEntry] };
        });
      },
      addChannelChat: (channel) => {
        const chatEntry: Chat = {
          id: channel.id,
          type: 'channel',
          name: channel.name,
          lastMsg: channel.description || 'Канал создан',
          online: false,
          description: channel.description,
          creatorNickname: channel.creatorNickname,
          avatarUrl: channel.avatarUrl || undefined,
          isOwner: channel.isOwner ?? false,
          isOfficial: channel.isOfficial ?? false,
          subscribersCount: channel.subscribersCount || 1,
          createdAt: Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        };
        set((state) => {
          const exists = state.chats.find((c) => c.id === chatEntry.id);
          if (exists) {
            return {
              chats: state.chats.map((c) => (c.id === chatEntry.id ? { ...c, ...chatEntry } : c)),
            };
          }
          return { chats: [...state.chats, chatEntry] };
        });
      },
      updateChat: (chatId, updates) =>
        set((state) => ({
          chats: state.chats.map(c => c.id === chatId ? { ...c, ...updates } : c)
        })),
      updateLastMsg: (chatId, msg) =>
        set((state) => ({
          chats: state.chats.map(c => c.id === chatId ? { ...c, lastMsg: msg } : c)
        })),
      addMessage: (chatId, message, encryptedText?, index?) => {
        const state = get();
        const chat = state.chats.find(c => c.id === chatId);
        if (!chat) return;

        if (message.id && state.messagesByChatId[chatId]?.some(m => m.id === message.id)) {
          console.warn('[ChatStore] Duplicate message id ignored:', message.id);
          return;
        }

        const ttl = state.messageTTLSeconds || undefined;
        const enrichedMessage: Message = {
          ...message,
          ttlSeconds: ttl,
          expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
          status: message.status || 'sent',
          id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          encryptedText: encryptedText || message.text,
          index: index ?? message.index,
          mediaType: message.mediaType,
          mediaUrl: message.mediaUrl,
          mediaName: message.mediaName,
          mime: message.mime,
          mediaItems: message.mediaItems,
          audioMetadata: message.audioMetadata,
          width: message.width,
          height: message.height,
          duration: message.duration,
          reactions: message.reactions,
        };

        const currentMessages = state.messagesByChatId[chatId] || [];
        const updatedMessages = [...currentMessages, enrichedMessage];

        let trimmedMessages = updatedMessages;
        if (updatedMessages.length > MAX_MESSAGES_PER_CHAT) {
          trimmedMessages = updatedMessages.slice(-MAX_MESSAGES_PER_CHAT);
        }

        const isActive = state.activeChatId === chatId;
        const newUnreadCount = isActive ? 0 : (chat.unreadCount ?? 0) + 1;

        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: trimmedMessages,
          },
          chats: state.chats.map(c =>
            c.id === chatId
              ? {
                  ...c,
                  lastMsg: message.text || (message.mediaItems && message.mediaItems.length > 0 ? '[MediaGroup]' : (message.mediaType ? `[${message.mediaType}]` : '')),
                  unreadCount: newUnreadCount,
                }
              : c
          ),
        });
      },
      deleteMessage: (chatId, messageId) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const updated = messages.filter(m => m.id !== messageId);
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
          chats: state.chats.map(c =>
            c.id === chatId
              ? {
                  ...c,
                  lastMsg: updated.length > 0 ? updated[updated.length - 1].text : 'История очищена',
                }
              : c
          ),
        });
      },
      editMessage: (chatId, messageId, newText, encryptedText?, index?) => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const updated = messages.map(m =>
          m.id === messageId
            ? { ...m, text: newText, encryptedText: encryptedText || newText, index: index ?? m.index }
            : m
        );
        set({
          messagesByChatId: {
            ...state.messagesByChatId,
            [chatId]: updated,
          },
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, lastMsg: newText } : c
          ),
        });
      },
      toggleReaction: (chatId, messageIndexOrId, emoji, user) => {
        get().setReaction(chatId, messageIndexOrId, emoji, user, 'toggle');
      },
      setReaction: (chatId, messageIndexOrId, emoji, user, action = 'toggle') => {
        const state = get();
        const messages = state.messagesByChatId[chatId] || [];
        const targetStr = String(messageIndexOrId);

        let resultingAction: 'add' | 'remove' = 'add';
        let matchFound = false;

        const updated = messages.map((m, idx) => {
          const isMatch =
            (m.id && m.id === targetStr) ||
            (typeof messageIndexOrId === 'number' && idx === messageIndexOrId);
          if (!isMatch) return m;
          matchFound = true;

          const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };
          const usersForEmoji = Array.from(currentReactions[emoji] || []);
          const alreadyPresent = usersForEmoji.includes(user);

          let newUsers: string[];
          if (action === 'add') {
            newUsers = alreadyPresent ? usersForEmoji : [...usersForEmoji, user];
            resultingAction = 'add';
          } else if (action === 'remove') {
            newUsers = usersForEmoji.filter((u) => u !== user);
            resultingAction = 'remove';
          } else {
            if (alreadyPresent) {
              newUsers = usersForEmoji.filter((u) => u !== user);
              resultingAction = 'remove';
            } else {
              newUsers = [...usersForEmoji, user];
              resultingAction = 'add';
            }
          }

          if (newUsers.length > 0) {
            currentReactions[emoji] = newUsers;
          } else {
            delete currentReactions[emoji];
          }

          return {
            ...m,
            reactions: Object.keys(currentReactions).length > 0 ? currentReactions : undefined,
          };
        });

        if (matchFound) {
          set({
            messagesByChatId: {
              ...state.messagesByChatId,
              [chatId]: updated,
            },
          });
        }

        return resultingAction;
      },
      syncReactionsFromSupabase: async (chatId) => {
        try {
          const rawReactions = await supabaseService.getReactionsForChat(chatId);
          if (!rawReactions || rawReactions.length === 0) return;

          const idReactionsMap = new Map<string, Record<string, string[]>>();

          for (const r of rawReactions) {
            if (r.message_id) {
              if (!idReactionsMap.has(r.message_id)) idReactionsMap.set(r.message_id, {});
              const map = idReactionsMap.get(r.message_id)!;
              if (!map[r.emoji]) map[r.emoji] = [];
              if (!map[r.emoji].includes(r.user_id)) map[r.emoji].push(r.user_id);
            }
          }

          if (idReactionsMap.size === 0) return;

          const state = get();
          const messages = state.messagesByChatId[chatId] || [];

          let hasChanges = false;
          const updatedMessages = messages.map((m) => {
            if (!m.id || !idReactionsMap.has(m.id)) return m;

            const fetchedReactions = idReactionsMap.get(m.id)!;
            const currentReactions: Record<string, string[]> = { ...(m.reactions || {}) };

            let changed = false;
            for (const [emoji, users] of Object.entries(fetchedReactions)) {
              const existingUsers = currentReactions[emoji] || [];
              const mergedUsers = Array.from(new Set([...existingUsers, ...users]));
              if (mergedUsers.length !== existingUsers.length) {
                currentReactions[emoji] = mergedUsers;
                changed = true;
              }
            }

            if (changed) {
              hasChanges = true;
              return {
                ...m,
                reactions: currentReactions,
              };
            }
            return m;
          });

          if (hasChanges) {
            set({
              messagesByChatId: {
                ...state.messagesByChatId,
                [chatId]: updatedMessages,
              },
            });
          }
        } catch (err) {
          console.error('Failed to sync reactions from Supabase:', err);
        }
      },
      getMessages: (chatId) => {
        return get().messagesByChatId[chatId] || [];
      },
      setPasscode: (code) => set({ passcode: code }),
      setTheme: (theme) => {
        set({ currentTheme: theme });
        applyThemeToRoot(theme, get().chatColor);
      },
      setChatColor: (color) => {
        set({ chatColor: color });
        applyThemeToRoot(get().currentTheme, color);
      },
      resetChatColor: () => {
        set({ chatColor: DEFAULT_CHAT_COLOR });
        applyThemeToRoot(get().currentTheme, DEFAULT_CHAT_COLOR);
      },
      toggleDots: () => set((state) => ({ dotOverlay: !state.dotOverlay })),
      setCurrentView: (view) => set({ currentView: view }),
      initialSettingsTab: 'main',
      openSettings: (tab) => set({ currentView: 'settings', initialSettingsTab: tab || 'main' }),
      setBlurProtection: (type, val) =>
        set((state) => {
          if (type === 'hideOnBackground') return { hideOnBackground: val };
          if (type === 'hideFromScreenCapture') return { hideFromScreenCapture: val };
          if (type === 'main') return { blurProtection: val };
          return state;
        }),
      setProxyActive: (active, info) =>
        set((state) => ({
          proxyActive: active,
          activeProxyInfo: active ? (info ?? state.activeProxyInfo) : null,
        })),
      setMessageTTL: (seconds) => set({ messageTTLSeconds: seconds }),
      setEyeCareEnabled: (enabled) => set({ eyeCareEnabled: enabled }),
      setEyeCareOpacity: (opacity) => set({ eyeCareOpacity: opacity }),
      setEyeCareDensity: (density) => set({ eyeCareDensity: density }),
      setScreenCaptureProtection: (enabled) => set({ screenCaptureProtection: enabled }),
      setMinimizeToTray: (enabled) => set({ minimizeToTray: enabled }),
      createGroupChat: (name, ttl) => {
        const chatId = `grp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const inviteCode = `orbit-${Math.random().toString(36).substr(2, 5)}-${Math.floor(Math.random() * 90 + 10)}`;
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const sharedSecret = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
        const nickname = (() => {
          try {
            return JSON.parse(localStorage.getItem('orbita-auth-storage') || '{}')?.state?.nickname || 'Unknown';
          } catch { return 'Unknown'; }
        })();
        const newChat: Chat = {
          id: chatId,
          type: 'group',
          name,
          lastMsg: 'E2EE_SECURE_CHANNEL_READY',
          online: false,
          sharedSecret,
          role: 'owner',
          inviteCode,
          inviteCodeTTL: Date.now() + ttl * 1000,
          members: [{ nickname, role: 'owner', lastSeen: Date.now() }],
          createdAt: Date.now(),
          unreadCount: 0,
          lastReadTimestamp: Date.now(),
          muted: false,
          notificationsEnabled: true,
        };
        set((state) => ({ chats: [...state.chats, newChat] }));
        try {
          const groupRegistry = JSON.parse(localStorage.getItem('orbita-group-registry') || '{}');
          groupRegistry[inviteCode] = {
            chatId,
            name,
            sharedSecret,
            inviteCodeTTL: Date.now() + ttl * 1000,
            ownerNickname: nickname,
          };
          localStorage.setItem('orbita-group-registry', JSON.stringify(groupRegistry));
        } catch {}
      },
      joinGroupByCode: (inviteCode, callback) => {
        const normalized = inviteCode.trim().toLowerCase();
        if (!normalized) { callback(false, 'Введите код группы'); return; }
        const nickname = (() => {
          try {
            return JSON.parse(localStorage.getItem('orbita-auth-storage') || '{}')?.state?.nickname || 'Unknown';
          } catch { return 'Unknown'; }
        })();
        const existing = get().chats.find(c => c.type === 'group' && c.inviteCode === normalized);
        if (existing) { callback(false, 'Вы уже в этой группе'); return; }
        try {
          const groupRegistry = JSON.parse(localStorage.getItem('orbita-group-registry') || '{}');
          const groupData = groupRegistry[normalized];
          if (groupData) {
            if (groupData.inviteCodeTTL && Date.now() > groupData.inviteCodeTTL) {
              callback(false, 'Срок действия кода истёк');
              return;
            }
            const newChat: Chat = {
              id: groupData.chatId,
              type: 'group',
              name: groupData.name,
              lastMsg: 'E2EE_SECURE_CHANNEL_READY',
              online: false,
              sharedSecret: groupData.sharedSecret,
              role: 'member',
              inviteCode: normalized,
              members: [
                { nickname: groupData.ownerNickname, role: 'owner', lastSeen: Date.now() },
                { nickname, role: 'member', lastSeen: Date.now() },
              ],
              createdAt: Date.now(),
              unreadCount: 0,
              lastReadTimestamp: Date.now(),
              muted: false,
              notificationsEnabled: true,
            };
            set((state) => {
              const exists = state.chats.find(c => c.id === groupData.chatId);
              if (exists) return {};
              return { chats: [...state.chats, newChat] };
            });
            callback(true);
            return;
          }
        } catch {}
        const pusher = (window as any).__orbitaPusher;
        if (!pusher) {
          callback(false, 'Нет соединения. Попробуйте позже');
          return;
        }
        const inviteChannel = pusher.subscribe(`private-group-invite-${normalized}`);
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          pusher.unsubscribe(`private-group-invite-${normalized}`);
        };
        const timeoutId = setTimeout(() => {
          if (!settled) {
            cleanup();
            callback(false, 'Группа не найдена или код недействителен');
          }
        }, 10000);
        const handleInviteResponse = (data: any) => {
          if (settled) return;
          clearTimeout(timeoutId);
          cleanup();
          if (data.error) { callback(false, data.error); return; }
          if (data.inviteCodeTTL && Date.now() > data.inviteCodeTTL) { callback(false, 'Срок действия кода истёк'); return; }
          const newChat: Chat = {
            id: data.chatId,
            type: 'group',
            name: data.name,
            lastMsg: 'E2EE_SECURE_CHANNEL_READY',
            online: false,
            sharedSecret: data.sharedSecret,
            role: 'member',
            inviteCode: normalized,
            members: [...(data.members || []), { nickname, role: 'member', lastSeen: Date.now() }],
            createdAt: Date.now(),
            unreadCount: 0,
            lastReadTimestamp: Date.now(),
            muted: false,
            notificationsEnabled: true,
          };
          set((state) => {
            const exists = state.chats.find(c => c.id === data.chatId);
            if (exists) return {};
            return { chats: [...state.chats, newChat] };
          });
          callback(true);
        };
        const sendJoinRequest = () => {
          inviteChannel.trigger('client-join-request', { nickname, inviteCode: normalized });
        };
        inviteChannel.bind('client-invite-response', handleInviteResponse);
        if (inviteChannel.subscribed) sendJoinRequest();
        else inviteChannel.bind('pusher:subscription_succeeded', sendJoinRequest);
        inviteChannel.bind('pusher:subscription_error', () => {
          clearTimeout(timeoutId);
          cleanup();
          callback(false, 'Ошибка подключения');
        });
      },
      resetChats: () => {
        const defaultTheme: ThemeId = 'system';
        applyThemeToRoot(defaultTheme, DEFAULT_CHAT_COLOR);
        mediaManager.clearMemoryCache();
        set({
          chats: [],
          activeChatId: null,
          activeProfileChatId: null,
          messagesByChatId: {},
          passcode: null,
          currentTheme: defaultTheme,
          chatColor: DEFAULT_CHAT_COLOR,
          currentView: 'chats',
          dotOverlay: true,
          blurProtection: false,
          hideOnBackground: false,
          hideFromScreenCapture: false,
          proxyActive: false,
          activeProxyInfo: null,
          myCode: '',
          codeRotationSpeed: 600,
          messageTTLSeconds: 0,
          eyeCareEnabled: false,
          eyeCareOpacity: 0.22,
          eyeCareDensity: 5,
          screenCaptureProtection: false,
          minimizeToTray: false,
          isHandshaking: false,
          fontFamily: 'system',
          textScale: 100,
          dotColor: '#22c55e',
          language: null,
          headerEnabled: true,
          headerTitle: 'orbita',
          ringEnabled: true,
          notificationCount: 2,
          notificationPosition: 'bottom-right',
          notificationHideContent: false,
          notificationPreviewTheme: 'dark',
          bubbleRadius: 16,
          notificationSoundEnabled: true,
          notificationsEnabled: true,
          appIcon: 'orbita1',
          notificationIcon: 'orbita1',
          voiceCallsEnabled: true,
          readReceiptsEnabled: true,
          typingIndicatorsEnabled: true,
          recentEmojis: [],
          isEmojiPanelOpen: false,
          autoUpdate: true,
          showInSystemTray: true,
          autoLaunch: false,
          sendOnEnter: true,
          useImprovedPlayer: false,
          cacheSizeLimit: 5 * 1024 * 1024 * 1024,
          mediaCacheLimit: 2.5 * 1024 * 1024 * 1024,
          cacheCleanupAge: 7 * 24 * 60 * 60 * 1000,
          autoLoadMedia: false,
        });
      },
      setIsHandshaking: (val) => set({ isHandshaking: val }),
      markChatAsRead: (chatId) =>
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, unreadCount: 0, lastReadTimestamp: Date.now() } : c
          ),
        })),
      getUnreadChatsCount: () => {
        const state = get();
        return state.chats.filter(c => (c.unreadCount ?? 0) > 0).length;
      },
      closeChat: () => set({ activeChatId: null }),
      setFontFamily: (font) => set({ fontFamily: font }),
      setTextScale: (scale) => set({ textScale: clampTextScale(scale) }),
      setDotColor: (color) => set({ dotColor: color }),
      setLanguage: (lang) => set({ language: lang }),
      setHeaderEnabled: (enabled) => set({ headerEnabled: enabled }),
      setHeaderTitle: (title) => set({ headerTitle: title }),
      setRingEnabled: (enabled) => set({ ringEnabled: enabled }),
      setNotificationCount: (count) => set({ notificationCount: Math.max(1, Math.min(5, count)) }),
      setNotificationPosition: (position) => set({ notificationPosition: position }),
      setNotificationHideContent: (hide) => set({ notificationHideContent: hide }),
      setNotificationPreviewTheme: (theme) => set({ notificationPreviewTheme: theme }),
      setBubbleRadius: (radius) => set({ bubbleRadius: radius }),
      setNotificationSoundEnabled: (enabled) => set({ notificationSoundEnabled: enabled }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setNotificationFlashTaskbar: (enabled) => set({ notificationFlashTaskbar: enabled }),
      setNotificationVolume: (volume) => set({ notificationVolume: Math.max(0, Math.min(100, volume)) }),
      setNotificationShowName: (show) => set({ notificationShowName: show }),
      setNotificationShowText: (show) => set({ notificationShowText: show }),
      setNotificationNativeWindows: (enabled) => set({ notificationNativeWindows: enabled }),
      setNotificationRespectFocus: (enabled) => set({ notificationRespectFocus: enabled }),
      setAppIcon: (icon) => set({ appIcon: icon }),
      setNotificationIcon: (icon) => set({ notificationIcon: icon }),

      toggleChatMuted: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, muted: !c.muted } : c
          ),
        }));
      },
      toggleChatNotifications: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, notificationsEnabled: !c.notificationsEnabled } : c
          ),
        }));
      },
      toggleChatBlocked: (chatId) => {
        set((state) => ({
          chats: state.chats.map(c =>
            c.id === chatId ? { ...c, isBlocked: !c.isBlocked } : c
          ),
        }));
      },

      setVoiceCallsEnabled: (enabled) => set({ voiceCallsEnabled: enabled }),
      setReadReceiptsEnabled: (enabled) => set({ readReceiptsEnabled: enabled }),
      setTypingIndicatorsEnabled: (enabled) => set({ typingIndicatorsEnabled: enabled }),
      setLinkPreviewsEnabled: (enabled) => set({ linkPreviewsEnabled: enabled }),

      addRecentEmoji: (emoji: string) => {
        set((state) => {
          const current = state.recentEmojis || [];
          const filtered = current.filter(e => e !== emoji);
          const updated = [emoji, ...filtered].slice(0, 30);
          return { recentEmojis: updated };
        });
      },
      getRecentEmojis: () => {
        return get().recentEmojis || [];
      },

      setAutoUpdate: (enabled) => set({ autoUpdate: enabled }),
      setShowInSystemTray: (enabled) => set({ showInSystemTray: enabled }),
      setAutoLaunch: (enabled) => set({ autoLaunch: enabled }),
      setSendOnEnter: (enabled) => set({ sendOnEnter: enabled }),
      setUseImprovedPlayer: (enabled) => set({ useImprovedPlayer: enabled }),
      setNoiseSuppressionVoice: (enabled) => set({ noiseSuppressionVoice: enabled }),
      setNoiseSuppressionCalls: (enabled) => set({ noiseSuppressionCalls: enabled }),

      setCallSoundsEnabled: (enabled) => set({ callSoundsEnabled: enabled }),
      setAlwaysRelayCalls: (enabled) => set({ alwaysRelayCalls: enabled }),
      setSelectedCameraId: (id) => set({ selectedCameraId: id }),
      setSelectedMicrophoneId: (id) => set({ selectedMicrophoneId: id }),
      setSelectedSpeakerId: (id) => set({ selectedSpeakerId: id }),
      setScreenProtectionEnabled: (enabled) => set({ screenProtectionEnabled: enabled }),
      setHideMenuBar: (hide) => set({ hideMenuBar: hide }),

      setCacheSizeLimit: (limit) => set({ cacheSizeLimit: limit }),
      setMediaCacheLimit: (limit) => set({ mediaCacheLimit: limit }),
      setCacheCleanupAge: (age) => set({ cacheCleanupAge: age }),

      setAutoLoadMedia: (enabled) => set({ autoLoadMedia: enabled }),

      deleteChat: (chatId) => {
        const state = get();
        const chatExists = state.chats.some(c => c.id === chatId);
        if (!chatExists) return;

        set((state) => {
          const { [chatId]: _, ...restMessages } = state.messagesByChatId;
          return {
            chats: state.chats.filter(c => c.id !== chatId),
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
            messagesByChatId: restMessages,
          };
        });

        mediaManager.deleteByChatId(chatId).catch(err => {
          console.error('[ChatStore] Failed to delete media cache for chat:', chatId, err);
        });
      },
    }),
    {
      name: 'orbita-chat-storage',
      storage: createJSONStorage(() => ipcStorage),
      partialize: (state) => ({
        chats: state.chats,
        messagesByChatId: state.messagesByChatId,
        passcode: state.passcode,
        currentTheme: state.currentTheme,
        dotOverlay: state.dotOverlay,
        blurProtection: state.blurProtection,
        hideOnBackground: state.hideOnBackground,
        hideFromScreenCapture: state.hideFromScreenCapture,
        proxyActive: state.proxyActive,
        activeProxyInfo: state.activeProxyInfo,
        myCode: state.myCode,
        codeRotationSpeed: state.codeRotationSpeed,
        nextCodeRotationTime: state.nextCodeRotationTime,
        messageTTLSeconds: state.messageTTLSeconds,
        incomingFriendRequests: state.incomingFriendRequests,
        eyeCareEnabled: state.eyeCareEnabled,
        eyeCareOpacity: state.eyeCareOpacity,
        eyeCareDensity: state.eyeCareDensity,
        screenCaptureProtection: state.screenCaptureProtection,
        minimizeToTray: state.minimizeToTray,
        fontFamily: state.fontFamily,
        textScale: state.textScale,
        dotColor: state.dotColor,
        language: state.language,
        headerEnabled: state.headerEnabled,
        headerTitle: state.headerTitle,
        ringEnabled: state.ringEnabled,
        notificationCount: state.notificationCount,
        notificationPosition: state.notificationPosition,
        notificationHideContent: state.notificationHideContent,
        notificationPreviewTheme: state.notificationPreviewTheme,
        bubbleRadius: state.bubbleRadius,
        notificationSoundEnabled: state.notificationSoundEnabled,
        notificationsEnabled: state.notificationsEnabled,
        notificationFlashTaskbar: state.notificationFlashTaskbar,
        notificationVolume: state.notificationVolume,
        notificationShowName: state.notificationShowName,
        notificationShowText: state.notificationShowText,
        notificationNativeWindows: state.notificationNativeWindows,
        notificationRespectFocus: state.notificationRespectFocus,
        appIcon: state.appIcon,
        notificationIcon: state.notificationIcon,
        voiceCallsEnabled: state.voiceCallsEnabled,
        readReceiptsEnabled: state.readReceiptsEnabled,
        typingIndicatorsEnabled: state.typingIndicatorsEnabled,
        linkPreviewsEnabled: state.linkPreviewsEnabled,
        recentEmojis: state.recentEmojis,
        isEmojiPanelOpen: state.isEmojiPanelOpen,
        autoUpdate: state.autoUpdate,
        showInSystemTray: state.showInSystemTray,
        autoLaunch: state.autoLaunch,
        sendOnEnter: state.sendOnEnter,
        useImprovedPlayer: state.useImprovedPlayer,
        noiseSuppressionVoice: state.noiseSuppressionVoice,
        noiseSuppressionCalls: state.noiseSuppressionCalls,
        cacheSizeLimit: state.cacheSizeLimit,
        mediaCacheLimit: state.mediaCacheLimit,
        cacheCleanupAge: state.cacheCleanupAge,
        autoLoadMedia: state.autoLoadMedia,
        draftsByChatId: state.draftsByChatId,
        callSoundsEnabled: state.callSoundsEnabled,
        alwaysRelayCalls: state.alwaysRelayCalls,
        selectedCameraId: state.selectedCameraId,
        selectedMicrophoneId: state.selectedMicrophoneId,
        selectedSpeakerId: state.selectedSpeakerId,
        screenProtectionEnabled: state.screenProtectionEnabled,
        hideMenuBar: state.hideMenuBar,
      }),
      version: 34,
      migrate: (persistedState: any, version: number) => {
        if (version < 33) {
          const state = persistedState;
          if (state.chats) {
            const messagesByChatId: Record<string, Message[]> = {};
            for (const chat of state.chats) {
              if (chat.messages && Array.isArray(chat.messages)) {
                messagesByChatId[chat.id] = chat.messages.slice(-MAX_MESSAGES_PER_CHAT);
                delete chat.messages;
              }
            }
            state.messagesByChatId = messagesByChatId;
          }
          return state;
        }
        if (version < 34) {
          persistedState.autoLoadMedia = false;
          return persistedState;
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.chats)) {
          state.chats = state.chats.map((c) => ({
            ...c,
            online: false,
          }));
        }
      },
    }
  )
);