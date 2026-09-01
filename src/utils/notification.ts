import { useChatStore, FONT_MAP, FontFamily } from '../store/useChatStore';
import { themePalettes } from '../theme';
import i18n from '../i18n';

/**
 * Запрашивает разрешение на показ уведомлений (нужно только для веб-версии).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // В Electron разрешения не нужны — используем кастомное окно
  if (typeof window !== 'undefined' && (window as any).orbita?.showCustomNotification) {
    return true;
  }

  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Возвращает полное CSS-значение для шрифта по его имени с поддержкой Apple Color Emoji.
 */
function getFontFamilyCSS(fontName: string): string {
  const base = FONT_MAP[fontName as FontFamily] || FONT_MAP['system'];
  return `${base}, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
}

/**
 * Показать уведомление.
 *
 * @param title     — Имя отправителя / заголовок
 * @param body      — Текст сообщения
 * @param chatId    — ID чата (для перехода при клике)
 * @param avatarUrl — Аватарка отправителя / чата
 */
export function showNotification(
  title: string,
  body: string,
  chatId?: string,
  avatarUrl?: string | null,
): void {
  const state = useChatStore.getState();

  // ===== ПРОВЕРКА: уведомления включены? =====
  if (!state.notificationsEnabled) {
    console.log('[Notification] Уведомления отключены в настройках, пропускаем.');
    return;
  }

  if (chatId) {
    const targetChat = state.chats.find(c => c.id === chatId);
    if (targetChat && (targetChat.muted || targetChat.notificationsEnabled === false)) {
      return;
    }
  }

  const {
    notificationHideContent,
    notificationShowName,
    notificationShowText,
    notificationPosition,
    notificationPreviewTheme,
    notificationCount,
    fontFamily,
    notificationSoundEnabled,
    notificationVolume,
    notificationFlashTaskbar,
    notificationNativeWindows,
  } = state;

  // Формируем заголовок, тело сообщения и аватарку согласно настройкам и текущему языку
  let finalTitle = title;
  let finalBody = body;
  let finalAvatarUrl: string | undefined = avatarUrl || undefined;

  const isNameHidden = Boolean(notificationHideContent || !notificationShowName);
  const isTextHidden = Boolean(notificationHideContent || !notificationShowText);

  if (isNameHidden) {
    finalTitle = i18n.t('settings.hidden_name') || 'Orbita Desktop';
    finalAvatarUrl = undefined; // Скрываем аватарку собеседника, если скрыто имя
  }
  if (isTextHidden) {
    finalBody = i18n.t('settings.new_message') || 'Новое сообщение';
  }

  const fontFamilyCSS = getFontFamilyCSS(fontFamily);

  // ── Electron & Нативные уведомления Windows ──
  if (notificationNativeWindows && ('Notification' in window)) {
    if (Notification.permission === 'granted') {
      try {
        const n = new Notification(finalTitle, {
          body: finalBody,
          icon: finalAvatarUrl || '/orbita1.png',
          tag: chatId || 'orbita-message',
        });
        n.addEventListener('click', () => {
          window.focus();
          if (chatId) {
            useChatStore.getState().setActiveChat(chatId);
          }
        });
        if (notificationSoundEnabled) {
          playNotificationSound();
        }
        return;
      } catch (err) {
        console.warn('[Notification] Windows notification failed, fallback to custom:', err);
      }
    }
  }

  if (typeof window !== 'undefined' && (window as any).orbita?.showCustomNotification) {
    const themeDef = themePalettes[state.currentTheme] || themePalettes.dark;
    const colors = {
      accent:      themeDef.vars['--accent-color'] || themeDef.preview.accent || '#2c6bed',
      accentLight: themeDef.vars['--accent-light'] || themeDef.preview.accentSecondary || '#548bf5',
      bg:          themeDef.vars['--bg-secondary'] || themeDef.vars['--surface-container'] || '#1b1b1b',
      text:        themeDef.vars['--text-main'] || themeDef.preview.text || '#ffffff',
      textDim:     themeDef.vars['--text-dim'] || '#848484',
    };

    (window as any).orbita.showCustomNotification({
      title:        finalTitle,
      body:         finalBody,
      chatId,
      position:     notificationPosition    ?? 'bottom-right',
      theme:        notificationPreviewTheme ?? 'dark',
      hideContent:  notificationHideContent  ?? false,
      maxCount:     notificationCount        ?? 3,
      fontFamily:   fontFamilyCSS,
      soundEnabled: notificationSoundEnabled ?? true,
      volume:       notificationVolume       ?? 100,
      flashTaskbar: notificationFlashTaskbar ?? true,
      avatarUrl:    finalAvatarUrl,
      colors,
    });
    return;
  }

  // ── Веб-версия: стандартный Browser Notification API ──
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const n = new Notification(finalTitle, {
      body: finalBody,
      icon: '/orbita1.png',
      tag:  chatId || 'orbita-message',
    });
    n.addEventListener('click', () => {
      window.focus();
      if (chatId) {
        useChatStore.getState().setActiveChat(chatId);
      }
    });
    if (notificationSoundEnabled) {
      playNotificationSound();
    }
  } catch (err) {
    console.error('[Notification] Browser API error:', err);
  }
}

let notificationAudioContext: AudioContext | null = null;
let notificationAudioBuffer: AudioBuffer | null = null;

/**
 * Воспроизводит звук уведомления через Web Audio API.
 * Использует AudioContext вместо HTMLAudioElement, чтобы звук уведомления
 * не перехватывался системным медиаплеером Windows (SMTC).
 */
export async function playNotificationSound() {
  const state = useChatStore.getState();
  if (!state.notificationSoundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!notificationAudioContext || notificationAudioContext.state === 'closed') {
      notificationAudioContext = new AudioCtx();
    }
    if (notificationAudioContext.state === 'suspended') {
      await notificationAudioContext.resume();
    }

    if (!notificationAudioBuffer) {
      const response = await fetch('./sounds/incoming_notification.mp3');
      const arrayBuffer = await response.arrayBuffer();
      notificationAudioBuffer = await notificationAudioContext.decodeAudioData(arrayBuffer);
    }

    const vol = typeof state.notificationVolume === 'number' ? Math.max(0, Math.min(1, state.notificationVolume / 100)) : 1.0;
    const gainNode = notificationAudioContext.createGain();
    gainNode.gain.value = vol;
    gainNode.connect(notificationAudioContext.destination);

    const source = notificationAudioContext.createBufferSource();
    source.buffer = notificationAudioBuffer;
    source.connect(gainNode);
    source.start(0);
  } catch (err) {
    console.warn('[Notification] Failed to play sound via Web Audio API:', err);
  }
}