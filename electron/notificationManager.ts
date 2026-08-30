/// <reference types="node" />

import { BrowserWindow, ipcMain, screen, app } from 'electron';
import path from 'path';
import fs from 'fs';

interface NotifSettings {
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right';
  theme: 'dark' | 'light';
  hideContent: boolean;
  maxCount: number;
  soundEnabled: boolean;
  volume?: number;
  flashTaskbar?: boolean;
}

interface ShowNotificationPayload {
  title: string;
  body: string;
  chatId?: string;
  settings: NotifSettings;
  colors?: { accent: string; bg: string; text: string; border: string };
  fontFamily?: string;
  iconData?: string | null;
  avatarUrl?: string | null;
}

const CARD_WIDTH     = 356;
const NOTIF_ITEM_H   = 82;
const NOTIF_GAP      = 7;
const SCREEN_MARGIN  = 10; // Exactly 10px from edge

let notifWindow: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;

function getWindowBounds(
  position: NotifSettings['position'],
  maxCount: number,
): { x: number; y: number; width: number; height: number } {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const { x: wx, y: wy } = display.workArea;

  const count = Math.max(1, maxCount);
  const totalH = count * NOTIF_ITEM_H + (count - 1) * NOTIF_GAP;

  let x: number;
  let y: number;

  switch (position) {
    case 'top-left':
      x = wx + SCREEN_MARGIN;
      y = wy + SCREEN_MARGIN;
      break;
    case 'top-center':
      x = wx + Math.round((sw - CARD_WIDTH) / 2);
      y = wy + SCREEN_MARGIN;
      break;
    case 'top-right':
      x = wx + sw - CARD_WIDTH - SCREEN_MARGIN;
      y = wy + SCREEN_MARGIN;
      break;
    case 'bottom-left':
      x = wx + SCREEN_MARGIN;
      y = wy + sh - totalH - SCREEN_MARGIN;
      break;
    case 'bottom-right':
    default:
      x = wx + sw - CARD_WIDTH - SCREEN_MARGIN;
      y = wy + sh - totalH - SCREEN_MARGIN;
      break;
  }

  return { x, y, width: CARD_WIDTH, height: totalH };
}

function getOrCreateNotifWindow(settings: NotifSettings): BrowserWindow {
  const bounds = getWindowBounds(settings.position, settings.maxCount);

  if (notifWindow && !notifWindow.isDestroyed()) {
    notifWindow.setBounds(bounds);
    return notifWindow;
  }

  notifWindow = new BrowserWindow({
    ...bounds,
    frame:          false,
    transparent:    true,
    resizable:      false,
    movable:        false,
    minimizable:    false,
    maximizable:    false,
    skipTaskbar:    true,
    alwaysOnTop:    true,
    focusable:      false,
    hasShadow:      false,
    roundedCorners: false,
    type:           'notification' as any,
    webPreferences: {
      nodeIntegration:      true,
      contextIsolation:     false,
      backgroundThrottling: false,
    },
    show: false,
  });

  let htmlPath = path.join(__dirname, '../public/notification-window.html');
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.join(__dirname, '../dist/notification-window.html');
  }
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.join(app.getAppPath(), 'public/notification-window.html');
  }
  if (!fs.existsSync(htmlPath)) {
    htmlPath = path.join(app.getAppPath(), 'dist/notification-window.html');
  }

  console.log('[NotifManager] Loading notification window from:', htmlPath);
  notifWindow.loadFile(htmlPath);

  notifWindow.on('closed', () => {
    notifWindow = null;
  });

  notifWindow.webContents.on('ipc-message', (_event: Electron.Event, channel: string, ...args: any[]) => {
    const payload = args[0];

    if (channel === 'notif-window:clicked') {
      ipcMain.emit('notif-window:clicked', _event, payload);
    }

    if (channel === 'notif-window:all-closed') {
      if (notifWindow && !notifWindow.isDestroyed()) {
        notifWindow.hide();
      }
    }
  });

  return notifWindow;
}

export function showCustomNotification(payload: ShowNotificationPayload): void {
  const { title, body, chatId, settings, colors, fontFamily, iconData, avatarUrl } = payload;
  console.log('[NotifManager] showCustomNotification called:', { title, body, position: settings.position });

  // Flashing taskbar icon if main window is in background
  if (mainWin && !mainWin.isDestroyed() && !mainWin.isFocused()) {
    if (settings.flashTaskbar) {
      mainWin.flashFrame(true);
    }
  }

  const win = getOrCreateNotifWindow(settings);

  const send = () => {
    win.showInactive();
    
    win.webContents.send('notif:icon-data', iconData || '');

    win.webContents.send('notif:show', {
      title,
      body,
      chatId,
      position:     settings.position,
      theme:        settings.theme,
      hideContent:  settings.hideContent,
      maxCount:     settings.maxCount,
      colors,
      fontFamily,
      soundEnabled: settings.soundEnabled,
      volume:       settings.volume ?? 100,
      avatarUrl:    avatarUrl || null,
    });
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

export function initNotificationManager(mainWindow: BrowserWindow): void {
  mainWin = mainWindow;

  mainWin.on('focus', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.flashFrame(false);
    }
  });

  ipcMain.on('orbita:clear-notifications', () => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.webContents.send('notif:clear-all');
    }
  });

  mainWindow.on('closed', () => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.close();
    }
  });

  console.log('[NotifManager] Initialized');
}