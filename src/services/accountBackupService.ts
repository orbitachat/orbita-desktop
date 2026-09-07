import { BIP39_WORDLIST } from '../lib/bip39-words';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';

const MAGIC_HEADER = 'ORBITA_BACKUP_V1';
const PBKDF2_ITERATIONS = 100000;

export const generateMnemonic = async (): Promise<string> => {
  const entropy = new Uint8Array(16);
  globalThis.crypto.getRandomValues(entropy);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', entropy);
  const hashBytes = new Uint8Array(hashBuffer);
  const checksum = hashBytes[0] >> 4;

  let bits = '';
  for (let i = 0; i < entropy.length; i++) {
    bits += entropy[i].toString(2).padStart(8, '0');
  }
  bits += checksum.toString(2).padStart(4, '0');

  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const index = parseInt(bits.slice(i * 11, (i + 1) * 11), 2);
    words.push(BIP39_WORDLIST[index]);
  }
  return words.join(' ');
};

export const validateMnemonic = async (phrase: string): Promise<boolean> => {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length !== 12) return false;

  let bits = '';
  for (const word of words) {
    const index = BIP39_WORDLIST.indexOf(word);
    if (index === -1) return false;
    bits += index.toString(2).padStart(11, '0');
  }

  const entropyBits = bits.slice(0, 128);
  const checksumBits = bits.slice(128, 132);

  const entropy = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2);
  }

  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', entropy);
  const hashBytes = new Uint8Array(hashBuffer);
  const expectedChecksum = hashBytes[0] >> 4;

  return expectedChecksum === parseInt(checksumBits, 2);
};

export const createAccountBackup = async (mnemonic: string): Promise<Uint8Array> => {
  const authState = useAuthStore.getState();
  const chatState = useChatStore.getState();

  const payload = {
    version: 1,
    createdAt: Date.now(),
    auth: {
      nickname: authState.nickname,
      avatarUrl: authState.avatarUrl,
    },
    chatStore: {
      myCode: chatState.myCode,
      chats: (chatState.chats || []).map((chat) => ({
        id: chat.id,
        type: chat.type,
        name: chat.name,
        lastMsg: chat.lastMsg,
        online: false,
        sharedSecret: chat.sharedSecret,
        ratchetState: chat.ratchetState,
        pinnedMessage: chat.pinnedMessage,
        role: chat.role,
        members: chat.members,
        inviteCode: chat.inviteCode,
        avatarUrl: chat.avatarUrl,
        peerCode: chat.peerCode,
        isBlocked: chat.isBlocked,
        muted: chat.muted,
        notificationsEnabled: chat.notificationsEnabled,
        isOfficial: chat.isOfficial,
      })),
      passcode: chatState.passcode,
      currentTheme: chatState.currentTheme,
      dotOverlay: chatState.dotOverlay,
      blurProtection: chatState.blurProtection,
      hideOnBackground: chatState.hideOnBackground,
      hideFromScreenCapture: chatState.hideFromScreenCapture,
      proxyActive: chatState.proxyActive,
      activeProxyInfo: chatState.activeProxyInfo,
      codeRotationSpeed: chatState.codeRotationSpeed,
      messageTTLSeconds: chatState.messageTTLSeconds,
      eyeCareEnabled: chatState.eyeCareEnabled,
      eyeCareOpacity: chatState.eyeCareOpacity,
      eyeCareDensity: chatState.eyeCareDensity,
      screenCaptureProtection: chatState.screenCaptureProtection,
      minimizeToTray: chatState.minimizeToTray,
      fontFamily: chatState.fontFamily,
      textScale: chatState.textScale,
      dotColor: chatState.dotColor,
      language: chatState.language,
      headerEnabled: chatState.headerEnabled,
      headerTitle: chatState.headerTitle,
      ringEnabled: chatState.ringEnabled,
      notificationCount: chatState.notificationCount,
      notificationPosition: chatState.notificationPosition,
      notificationHideContent: chatState.notificationHideContent,
      notificationPreviewTheme: chatState.notificationPreviewTheme,
      bubbleRadius: chatState.bubbleRadius,
      notificationSoundEnabled: chatState.notificationSoundEnabled,
      notificationsEnabled: chatState.notificationsEnabled,
      notificationFlashTaskbar: chatState.notificationFlashTaskbar,
      notificationVolume: chatState.notificationVolume,
      notificationShowName: chatState.notificationShowName,
      notificationShowText: chatState.notificationShowText,
      notificationNativeWindows: chatState.notificationNativeWindows,
      notificationRespectFocus: chatState.notificationRespectFocus,
      appIcon: chatState.appIcon,
      notificationIcon: chatState.notificationIcon,
      voiceCallsEnabled: chatState.voiceCallsEnabled,
      readReceiptsEnabled: chatState.readReceiptsEnabled,
      typingIndicatorsEnabled: chatState.typingIndicatorsEnabled,
      linkPreviewsEnabled: chatState.linkPreviewsEnabled,
      autoUpdate: chatState.autoUpdate,
      showInSystemTray: chatState.showInSystemTray,
      autoLaunch: chatState.autoLaunch,
      sendOnEnter: chatState.sendOnEnter,
      useImprovedPlayer: chatState.useImprovedPlayer,
      noiseSuppression: chatState.noiseSuppression,
      noiseSuppressionMode: chatState.noiseSuppressionMode,
      cacheSizeLimit: chatState.cacheSizeLimit,
      mediaCacheLimit: chatState.mediaCacheLimit,
      cacheCleanupAge: chatState.cacheCleanupAge,
      autoLoadMedia: chatState.autoLoadMedia,
      callSoundsEnabled: chatState.callSoundsEnabled,
      alwaysRelayCalls: chatState.alwaysRelayCalls,
      selectedCameraId: chatState.selectedCameraId,
      selectedMicrophoneId: chatState.selectedMicrophoneId,
      selectedSpeakerId: chatState.selectedSpeakerId,
      screenProtectionEnabled: chatState.screenProtectionEnabled,
      hideMenuBar: chatState.hideMenuBar,
    },
  };

  const normalizedMnemonic = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));

  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);

  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);

  const passKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizedMnemonic),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const aad = encoder.encode(MAGIC_HEADER);
  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
    },
    derivedKey,
    plaintext
  );

  const headerBytes = encoder.encode(MAGIC_HEADER);
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  const totalLength = headerBytes.length + salt.length + iv.length + ciphertextBytes.length;
  const result = new Uint8Array(totalLength);

  result.set(headerBytes, 0);
  result.set(salt, headerBytes.length);
  result.set(iv, headerBytes.length + salt.length);
  result.set(ciphertextBytes, headerBytes.length + salt.length + iv.length);

  return result;
};

export const restoreAccountBackup = async (
  fileBytes: Uint8Array | ArrayBuffer,
  mnemonic: string
): Promise<{ success: boolean; nickname: string; chatsCount: number; myCode: string }> => {
  const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const headerBytes = encoder.encode(MAGIC_HEADER);

  if (bytes.length < headerBytes.length + 16 + 12 + 16) {
    throw new Error('CORRUPTED_FILE');
  }

  for (let i = 0; i < headerBytes.length; i++) {
    if (bytes[i] !== headerBytes[i]) {
      throw new Error('INVALID_MAGIC_HEADER');
    }
  }

  const saltOffset = headerBytes.length;
  const ivOffset = saltOffset + 16;
  const ciphertextOffset = ivOffset + 12;

  const salt = bytes.slice(saltOffset, ivOffset);
  const iv = bytes.slice(ivOffset, ciphertextOffset);
  const ciphertext = bytes.slice(ciphertextOffset);

  const normalizedMnemonic = mnemonic.trim().toLowerCase().split(/\s+/).join(' ');

  const passKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizedMnemonic),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const derivedKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const aad = encoder.encode(MAGIC_HEADER);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad,
      },
      derivedKey,
      ciphertext
    );
  } catch {
    throw new Error('INVALID_MNEMONIC');
  }

  const jsonStr = decoder.decode(decryptedBuffer);
  let payload: any;
  try {
    payload = JSON.parse(jsonStr);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!payload || payload.version !== 1 || !payload.auth || !payload.chatStore) {
    throw new Error('INVALID_STRUCTURE');
  }

  const restoredNickname = payload.auth.nickname || '';
  const restoredAvatarUrl = payload.auth.avatarUrl || null;
  const restoredChats = Array.isArray(payload.chatStore.chats)
    ? payload.chatStore.chats.map((c: any) => ({ ...c, online: false }))
    : [];

  useChatStore.setState({
    ...payload.chatStore,
    chats: restoredChats,
    messagesByChatId: {},
    activeChatId: null,
    activeCall: null,
    incomingFriendRequests: [],
  });

  useAuthStore.setState({
    nickname: restoredNickname,
    avatarUrl: restoredAvatarUrl,
    step: 'main',
  });

  if (typeof window !== 'undefined' && (window as any).orbita) {
    const orb = (window as any).orbita;
    if (typeof payload.chatStore.screenProtectionEnabled === 'boolean' && orb.setScreenProtection) {
      orb.setScreenProtection(payload.chatStore.screenProtectionEnabled).catch(() => {});
    }
    if (typeof payload.chatStore.hideMenuBar === 'boolean' && orb.setHideMenuBar) {
      orb.setHideMenuBar(payload.chatStore.hideMenuBar).catch(() => {});
    }
    if (typeof payload.chatStore.showInSystemTray === 'boolean' && orb.setShowInSystemTray) {
      orb.setShowInSystemTray(payload.chatStore.showInSystemTray).catch(() => {});
    }
    if (typeof payload.chatStore.autoLaunch === 'boolean' && orb.setAutoLaunch) {
      orb.setAutoLaunch(payload.chatStore.autoLaunch).catch(() => {});
    }
  }

  return {
    success: true,
    nickname: restoredNickname,
    chatsCount: restoredChats.length,
    myCode: payload.chatStore.myCode || '',
  };
};
