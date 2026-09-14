// electron/main.ts
import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  nativeImage,
  Tray,
  dialog,
  screen,
  safeStorage,
  clipboard,
  session,
  protocol,
  net as electronNet,
  desktopCapturer,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { URL } from 'url';
import * as os from 'os';
import * as crypto from 'crypto';
import * as sqlite3 from 'sqlite3';
import { autoUpdater } from 'electron-updater';
import { spawn } from 'child_process';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'orbita-media',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const dotenv = require('dotenv');
const jsmediatags = require('jsmediatags');

// Load environment variables
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const WORKER_URL = process.env.VITE_WORKER_URL || 'https://orbita.ypgreg78.workers.dev';
const {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
  SYNC_SERVER_PORT = '49832',
} = process.env;

if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUDINARY_CLOUD_NAME) {
  console.log('[App] Cloudinary credentials not in local .env, using Worker signing gateway');
}

if (process.platform === 'win32') {
  app.setName('Orbita Desktop');
  app.setAppUserModelId('com.saizzi.orbita');
  console.log('[App] App name set to: Orbita Desktop');
  console.log('[App] AppUserModelId set to: com.saizzi.orbita');
}

app.commandLine.appendSwitch('disk-cache-size', '536870912');
app.commandLine.appendSwitch('media-cache-size', '536870912');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048 --expose-gc');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

// Load optional native module
let nativeModule: any = null;
const isPackaged = app.isPackaged;
function loadNativeAddon(filePath: string): any {
  if (filePath.endsWith('.node')) {
    return require(filePath);
  }
  const mod = { exports: {} };
  process.dlopen(mod, filePath);
  return mod.exports;
}

const candidatePaths = [
  path.join(__dirname, '..', 'native', 'target', 'release', 'orbita_native.dll'),
  path.join(__dirname, '..', 'native', 'target', 'release', 'orbita_native.node'),
  path.join(process.resourcesPath, 'index.node'),
  path.join(process.resourcesPath, 'index.win32-x64-msvc.node'),
  path.join(__dirname, '..', 'native', 'index.node'),
  path.join(__dirname, '..', 'native', 'index.win32-x64-msvc.node'),
  path.join(__dirname, '..', 'index.node'),
  path.join(__dirname, '..', 'index.win32-x64-msvc.node'),
];

for (const candidate of candidatePaths) {
  if (fs.existsSync(candidate)) {
    try {
      nativeModule = loadNativeAddon(candidate);
      console.log('Native module loaded successfully from:', candidate);
      break;
    } catch (e) {
      console.error('Native module failed to load from ' + candidate + ':', e);
    }
  }
}

// -----------------------------------------------------------------------------
// 1. Notification Manager
// -----------------------------------------------------------------------------
const NOTIF_WIDTH = 356;
const NOTIF_HEIGHT = 82;
const NOTIF_GAP = 7;
const NOTIF_MARGIN = 10;

let notifWindow: BrowserWindow | null = null;
let mainWindowRef: BrowserWindow | null = null;

function calcNotificationBounds(position: string, maxCount: number) {
  const display = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  const { x: workX, y: workY } = display.workArea;

  const count = Math.max(1, maxCount);
  const totalHeight = count * NOTIF_HEIGHT + (count - 1) * NOTIF_GAP;

  let x: number;
  let y: number;

  switch (position) {
    case 'top-left':
      x = workX + NOTIF_MARGIN;
      y = workY + NOTIF_MARGIN;
      break;
    case 'top-center':
      x = workX + Math.round((screenWidth - NOTIF_WIDTH) / 2);
      y = workY + NOTIF_MARGIN;
      break;
    case 'top-right':
      x = workX + screenWidth - NOTIF_WIDTH - NOTIF_MARGIN;
      y = workY + NOTIF_MARGIN;
      break;
    case 'bottom-left':
      x = workX + NOTIF_MARGIN;
      y = workY + screenHeight - totalHeight - NOTIF_MARGIN;
      break;
    default: // bottom-right
      x = workX + screenWidth - NOTIF_WIDTH - NOTIF_MARGIN;
      y = workY + screenHeight - totalHeight - NOTIF_MARGIN;
      break;
  }

  return { x, y, width: NOTIF_WIDTH, height: totalHeight };
}

function getOrCreateNotificationWindow(settings: { position: string; maxCount: number }) {
  const bounds = calcNotificationBounds(settings.position, settings.maxCount);

  if (notifWindow && !notifWindow.isDestroyed()) {
    notifWindow.setBounds(bounds);
    return notifWindow;
  }

  notifWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    roundedCorners: false,
    type: 'notification',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  let notifHtml = path.join(__dirname, '../public/notification-window.html');
  if (!fs.existsSync(notifHtml)) notifHtml = path.join(__dirname, '../dist/notification-window.html');
  if (!fs.existsSync(notifHtml)) notifHtml = path.join(app.getAppPath(), 'public/notification-window.html');
  if (!fs.existsSync(notifHtml)) notifHtml = path.join(app.getAppPath(), 'dist/notification-window.html');

  console.log('[NotifManager] Loading notification window from:', notifHtml);
  notifWindow.loadFile(notifHtml);

  notifWindow.on('closed', () => {
    notifWindow = null;
  });

  notifWindow.webContents.on('ipc-message', (event, channel, ...args) => {
    const data = args[0];
    if (channel === 'notif-window:clicked') {
      ipcMain.emit('notif-window:clicked', event, data);
    }
    if (channel === 'notif-window:all-closed') {
      if (notifWindow && !notifWindow.isDestroyed()) {
        notifWindow.hide();
      }
    }
  });

  return notifWindow;
}

function showCustomNotification(payload: {
  title: string;
  body: string;
  chatId?: string;
  settings: any;
  colors?: any;
  fontFamily?: string;
  iconData?: string | null;
  avatarUrl?: string;
}) {
  const { title, body, chatId, settings, colors, fontFamily, iconData, avatarUrl } = payload;
  console.log('[NotifManager] showCustomNotification called:', { title, body, position: settings.position });

  if (mainWindowRef && !mainWindowRef.isDestroyed() && !mainWindowRef.isFocused() && settings.flashTaskbar) {
    mainWindowRef.flashFrame(true);
  }

  const win = getOrCreateNotificationWindow(settings);
  const send = () => {
    win.showInactive();
    win.webContents.send('notif:icon-data', iconData || '');
    win.webContents.send('notif:show', {
      title,
      body,
      chatId,
      position: settings.position,
      theme: settings.theme,
      hideContent: settings.hideContent,
      maxCount: settings.maxCount,
      colors,
      fontFamily,
      soundEnabled: settings.soundEnabled,
      volume: settings.volume ?? 100,
      avatarUrl: avatarUrl || null,
    });
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function initNotifManager(win: BrowserWindow) {
  mainWindowRef = win;
  mainWindowRef.on('focus', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.flashFrame(false);
    }
  });

  ipcMain.on('orbita:clear-notifications', () => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.webContents.send('notif:clear-all');
    }
  });

  win.on('closed', () => {
    if (notifWindow && !notifWindow.isDestroyed()) {
      notifWindow.close();
    }
  });

  console.log('[NotifManager] Initialized');
}

// -----------------------------------------------------------------------------
// 2. Master Key Storage Encryption
// -----------------------------------------------------------------------------
const KEY_FILE_NAME = 'local_key.enc';
let masterKeyCache: Buffer | null = null;

function getMasterKey(): Buffer {
  if (masterKeyCache) return masterKeyCache;

  const userDataDir = app.getPath('userData');
  const keyFilePath = path.join(userDataDir, KEY_FILE_NAME);

  if (fs.existsSync(keyFilePath)) {
    const encKey = fs.readFileSync(keyFilePath);
    const hex = safeStorage.decryptString(encKey);
    masterKeyCache = Buffer.from(hex, 'hex');
    return masterKeyCache;
  }

  const rawKey = crypto.randomBytes(32);
  const encKey = safeStorage.encryptString(rawKey.toString('hex'));
  fs.writeFileSync(keyFilePath, encKey);
  masterKeyCache = rawKey;
  return masterKeyCache;
}

function encryptData(data: Buffer): Buffer {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]);
}

function decryptData(data: Buffer): Buffer | null {
  const key = getMasterKey();
  if (data.length < 28) return null; // 12 iv + 16 tag min
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(12, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// 3. SQLite Media Cache
// -----------------------------------------------------------------------------
const MEDIA_DIR_NAME = 'media';
const MEDIA_DB_NAME = 'media_cache.db';
const MAX_CACHE_SIZE = 1024 * 1024 * 1024; // 1 GB
let mediaDbInstance: sqlite3.Database | null = null;

function getMediaDir(): string {
  return path.join(app.getPath('userData'), MEDIA_DIR_NAME);
}

async function initMediaDb(): Promise<sqlite3.Database> {
  if (mediaDbInstance) return mediaDbInstance;
  const dir = getMediaDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const dbPath = path.join(dir, MEDIA_DB_NAME);
  mediaDbInstance = new sqlite3.Database(dbPath);

  return new Promise((resolve, reject) => {
    mediaDbInstance!.run(
      `
      CREATE TABLE IF NOT EXISTS media_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT UNIQUE NOT NULL,
        local_path TEXT NOT NULL,
        original_url TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        download_status TEXT DEFAULT 'downloaded',
        chat_id TEXT,
        message_id TEXT
      )
    `,
      (err) => {
        if (err) return reject(err);
        mediaDbInstance!.run(
          `
          CREATE INDEX IF NOT EXISTS idx_last_accessed ON media_cache(last_accessed);
          CREATE INDEX IF NOT EXISTS idx_cache_key ON media_cache(cache_key);
          CREATE INDEX IF NOT EXISTS idx_mime_type ON media_cache(mime_type);
          CREATE INDEX IF NOT EXISTS idx_chat_id ON media_cache(chat_id);
        `,
          (err2) => {
            if (err2) return reject(err2);
            mediaDbInstance!.all('PRAGMA table_info(media_cache)', (err3, cols: any[]) => {
              if (err3) return reject(err3);
              const names = cols.map((c) => c.name);
              const migrations: string[] = [];
              if (!names.includes('chat_id')) migrations.push('ALTER TABLE media_cache ADD COLUMN chat_id TEXT');
              if (!names.includes('message_id')) migrations.push('ALTER TABLE media_cache ADD COLUMN message_id TEXT');

              let idx = 0;
              const runNext = () => {
                if (idx >= migrations.length) {
                  resolve(mediaDbInstance!);
                  return;
                }
                mediaDbInstance!.run(migrations[idx++], (err4) => {
                  if (err4) reject(err4);
                  else runNext();
                });
              };
              runNext();
            });
          }
        );
      }
    );
  });
}

async function getTotalDownloadedSize(): Promise<number> {
  const db = await initMediaDb();
  return new Promise((resolve, reject) => {
    db.get('SELECT SUM(file_size) as total FROM media_cache WHERE download_status = "downloaded"', (err, row: any) => {
      if (err) reject(err);
      else resolve(row?.total || 0);
    });
  });
}

async function evictOldMediaIfNeeded(neededBytes: number): Promise<void> {
  const db = await initMediaDb();
  let currentTotal = (await getTotalDownloadedSize()) + neededBytes;

  while (currentTotal > MAX_CACHE_SIZE) {
    const oldest: any = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, local_path, file_size FROM media_cache WHERE download_status = "downloaded" ORDER BY last_accessed ASC LIMIT 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    if (!oldest) break;
    try {
      fs.unlinkSync(oldest.local_path);
    } catch { }
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE id = ?', oldest.id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    currentTotal -= oldest.file_size;
  }
}

function generateRandomDataFilename(): string {
  return crypto.randomBytes(8).toString('hex') + '.dat';
}

async function saveMediaToCache(
  cacheKey: string,
  data: Buffer,
  mimeType: string,
  chatId?: string,
  messageId?: string
): Promise<string> {
  const dir = getMediaDir();
  const dbPath = path.join(dir, MEDIA_DB_NAME);
  const masterKey = getMasterKey();

  if (nativeModule && nativeModule.rustMediaSave) {
    try {
      const savedPath = nativeModule.rustMediaSave(
        dbPath,
        dir,
        cacheKey,
        data,
        mimeType,
        chatId || null,
        messageId || null,
        masterKey.toString('hex')
      );
      if (savedPath) return savedPath;
    } catch { }
  }

  const filename = generateRandomDataFilename();
  const localPath = path.join(dir, filename);
  const encrypted = encryptData(data);

  fs.writeFileSync(localPath, encrypted);
  const fileSize = encrypted.length;
  const db = await initMediaDb();

  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO media_cache
      (cache_key, local_path, original_url, mime_type, file_size, created_at, last_accessed, download_status, chat_id, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'downloaded', ?, ?)`,
      [cacheKey, localPath, cacheKey, mimeType, fileSize, Date.now(), Date.now(), chatId, messageId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await evictOldMediaIfNeeded(fileSize);
  return localPath;
}

async function getMediaFromCache(cacheKey: string): Promise<{ data: Buffer | null; mime: string | null }> {
  const dir = getMediaDir();
  const dbPath = path.join(dir, MEDIA_DB_NAME);
  const masterKey = getMasterKey();

  if (nativeModule && nativeModule.rustMediaGet) {
    try {
      const res = nativeModule.rustMediaGet(dbPath, cacheKey, masterKey.toString('hex'));
      if (res && res.data) {
        return { data: Buffer.from(res.data), mime: res.mime };
      }
    } catch { }
  }

  const db = await initMediaDb();
  const record: any = await new Promise((resolve, reject) => {
    db.get(
      'SELECT local_path, mime_type FROM media_cache WHERE cache_key = ? AND download_status = "downloaded"',
      cacheKey,
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });

  if (!record) return { data: null, mime: null };
  const localPath = record.local_path;
  if (!fs.existsSync(localPath)) {
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE cache_key = ?', cacheKey, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return { data: null, mime: null };
  }

  const raw = fs.readFileSync(localPath);
  const decrypted = decryptData(raw);
  if (!decrypted) return { data: null, mime: null };

  await new Promise<void>((resolve, reject) => {
    db.run('UPDATE media_cache SET last_accessed = ? WHERE cache_key = ?', [Date.now(), cacheKey], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return { data: decrypted, mime: record.mime_type };
}

async function deleteMediaByChat(chatId: string): Promise<number> {
  const db = await initMediaDb();
  const rows: any[] = await new Promise((resolve, reject) => {
    db.all('SELECT local_path FROM media_cache WHERE chat_id = ?', chatId, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  for (const row of rows) {
    try {
      fs.unlinkSync(row.local_path);
    } catch { }
  }

  return await new Promise((resolve, reject) => {
    db.run('DELETE FROM media_cache WHERE chat_id = ?', chatId, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

async function clearAllMediaCache(categories?: string[]): Promise<number> {
  const db = await initMediaDb();
  let whereClause = '';
  if (categories && categories.length > 0 && categories.length < 5) {
    const conditions: string[] = [];
    if (categories.includes('photos')) {
      conditions.push("(mime_type LIKE 'image/%' AND mime_type NOT LIKE '%gif%')");
    }
    if (categories.includes('videos')) {
      conditions.push("mime_type LIKE 'video/%'");
    }
    if (categories.includes('voice') || categories.includes('audio')) {
      conditions.push("mime_type LIKE 'audio/%'");
    }
    if (categories.includes('gifs')) {
      conditions.push("mime_type LIKE '%gif%'");
    }
    if (categories.includes('other')) {
      conditions.push("(mime_type NOT LIKE 'image/%' AND mime_type NOT LIKE 'video/%' AND mime_type NOT LIKE 'audio/%')");
    }
    if (conditions.length > 0) {
      whereClause = ' WHERE ' + conditions.join(' OR ');
    }
  }

  const rows: any[] = await new Promise((resolve, reject) => {
    db.all('SELECT local_path FROM media_cache' + whereClause, (err, res) => {
      if (err) reject(err);
      else resolve(res || []);
    });
  });

  for (const row of rows) {
    try {
      if (row.local_path && fs.existsSync(row.local_path)) {
        fs.unlinkSync(row.local_path);
      }
    } catch { }
  }

  return await new Promise((resolve, reject) => {
    db.run('DELETE FROM media_cache' + whereClause, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

async function getMediaStats(): Promise<{ count: number; totalSize: number }> {
  const db = await initMediaDb();
  const countRow: any = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM media_cache', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  const sizeRow: any = await new Promise((resolve, reject) => {
    db.get('SELECT SUM(file_size) as total FROM media_cache', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  return { count: countRow?.count || 0, totalSize: sizeRow?.total || 0 };
}

async function evictMediaByAge(maxAgeMs: number): Promise<number> {
  const db = await initMediaDb();
  const threshold = Date.now() - maxAgeMs;
  const rows: any[] = await new Promise((resolve, reject) => {
    db.all('SELECT id, local_path FROM media_cache WHERE download_status = "downloaded" AND last_accessed < ?', threshold, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  let deleted = 0;
  for (const row of rows) {
    try {
      fs.unlinkSync(row.local_path);
    } catch { }
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE id = ?', row.id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    deleted++;
  }
  return deleted;
}

async function evictMediaToSizeLimit(limitBytes: number): Promise<number> {
  const db = await initMediaDb();
  let currentTotal = await getTotalDownloadedSize();
  let evicted = 0;

  while (currentTotal > limitBytes) {
    const oldest: any = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, local_path, file_size FROM media_cache WHERE download_status = "downloaded" ORDER BY last_accessed ASC LIMIT 1',
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    if (!oldest) break;
    try {
      fs.unlinkSync(oldest.local_path);
    } catch { }
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE id = ?', oldest.id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    currentTotal -= oldest.file_size;
    evicted++;
  }
  return evicted;
}

function registerMediaIpcHandlers() {
  initMediaDb();

  try { ipcMain.removeHandler('media:exists'); } catch { }
  try { ipcMain.removeHandler('media:get'); } catch { }
  try { ipcMain.removeHandler('media:save'); } catch { }
  try { ipcMain.removeHandler('media:clear'); } catch { }
  try { ipcMain.removeHandler('media:stats'); } catch { }
  try { ipcMain.removeHandler('media:evict'); } catch { }
  try { ipcMain.removeHandler('media:evict-by-age'); } catch { }
  try { ipcMain.removeHandler('media:evict-by-size'); } catch { }
  try { ipcMain.removeHandler('media:detailed-stats'); } catch { }
  try { ipcMain.removeHandler('media:set-limit'); } catch { }
  try { ipcMain.removeHandler('media:get-batch'); } catch { }
  try { ipcMain.removeHandler('media:delete-by-chat'); } catch { }
  try { ipcMain.removeHandler('media:chat-stats'); } catch { }
  try { ipcMain.removeHandler('system:disk-space'); } catch { }

  ipcMain.handle('media:exists', async (_event, cacheKey: string) => {
    const db = await initMediaDb();
    return new Promise((resolve, reject) => {
      db.get('SELECT 1 FROM media_cache WHERE cache_key = ? AND download_status = "downloaded"', cacheKey, (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  });

  ipcMain.handle('media:get', async (_event, cacheKey: string) => {
    const res = await getMediaFromCache(cacheKey);
    return res.data ? { data: res.data.toString('base64'), mime: res.mime } : null;
  });

  ipcMain.handle('media:get-batch', async (_event, items: Array<{ url: string }>) => {
    const result: Array<{ url: string; data: string | null; mime: string | null }> = [];
    for (const item of items) {
      const res = await getMediaFromCache(item.url);
      result.push({ url: item.url, data: res.data ? res.data.toString('base64') : null, mime: res.mime });
    }
    return result;
  });

  ipcMain.handle('media:save', async (_event, cacheKey: string, base64Data: string, mimeType: string, chatId?: string, messageId?: string) => {
    const buf = Buffer.from(base64Data, 'base64');
    const pathSaved = await saveMediaToCache(cacheKey, buf, mimeType, chatId, messageId);
    return !!pathSaved;
  });

  ipcMain.handle('media:clear', async (_event, categories?: string[]) => ({ deleted: await clearAllMediaCache(categories) }));
  ipcMain.handle('media:stats', async () => await getMediaStats());
  ipcMain.handle('media:evict', async (_event, maxBytes?: number) => ({ deleted: await evictMediaToSizeLimit(maxBytes || MAX_CACHE_SIZE) }));
  ipcMain.handle('media:evict-by-age', async (_event, maxAgeMs: number) => ({ deleted: await evictMediaByAge(maxAgeMs) }));
  ipcMain.handle('media:evict-by-size', async (_event, targetBytes: number) => ({ deleted: await evictMediaToSizeLimit(targetBytes) }));

  ipcMain.handle('media:detailed-stats', async () => {
    const db = await initMediaDb();
    const rows: any[] = await new Promise((resolve, reject) => {
      db.all(
        'SELECT mime_type, COUNT(*) as count, SUM(file_size) as size FROM media_cache WHERE download_status = "downloaded" GROUP BY mime_type',
        (err, res) => {
          if (err) reject(err);
          else resolve(res || []);
        }
      );
    });
    const totalCount = rows.reduce((acc, r) => acc + (r.count || 0), 0);
    const totalSize = rows.reduce((acc, r) => acc + (r.size || 0), 0);
    const byType: Record<string, { count: number; size: number }> = {};
    for (const row of rows) {
      byType[row.mime_type || 'application/octet-stream'] = {
        count: row.count || 0,
        size: row.size || 0,
      };
    }
    return { rows, totalCount, totalSize, byType };
  });

  ipcMain.handle('media:chat-stats', async () => {
    const db = await initMediaDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT chat_id, COUNT(*) as count, SUM(file_size) as size
         FROM media_cache
         WHERE download_status = 'downloaded' AND chat_id IS NOT NULL AND chat_id != ''
         GROUP BY chat_id
         ORDER BY size DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  });

  ipcMain.handle('system:disk-space', async () => {
    try {
      const mediaDir = getMediaDir();
      const root = path.parse(mediaDir).root || 'C:\\';
      const stats = fs.statfsSync(root);
      const total = stats.blocks * stats.bsize;
      const free = stats.bfree * stats.bsize;
      return { total, free, used: total - free };
    } catch {
      return { total: 0, free: 0, used: 0 };
    }
  });

  ipcMain.handle('media:set-limit', async (_event, { size }: { type?: string; size: number }) => {
    const current = await getTotalDownloadedSize();
    if (current > size) {
      return { deleted: await evictMediaToSizeLimit(size) };
    }
    return { deleted: 0 };
  });

  ipcMain.handle('media:delete-by-chat', async (_event, chatId: string) => ({ deleted: await deleteMediaByChat(chatId) }));
}

function detectMimeFromBuffer(buf: Buffer, fallbackUrl: string, hintFileName?: string, hintMime?: string): string {
  if (hintMime && hintMime !== 'application/octet-stream' && !hintMime.includes('undefined')) {
    if (buf.length >= 2 && buf[0] === 0x1a && buf[1] === 0x45) {
      return hintMime.startsWith('audio/') ? 'audio/webm' : 'video/webm';
    }
    return hintMime;
  }
  if (buf.length >= 4) {
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
    if (buf.subarray(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
    if (buf.length >= 8 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
      const isAudio = fallbackUrl.toLowerCase().endsWith('.m4a') || hintFileName?.toLowerCase().endsWith('.m4a');
      return isAudio ? 'audio/mp4' : 'video/mp4';
    }
    if (buf.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
    if (buf.subarray(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
    if (buf[0] === 0x1a && buf[1] === 0x45) {
      const isAudio = fallbackUrl.toLowerCase().includes('voice_') ||
        (hintFileName && hintFileName.toLowerCase().includes('voice')) ||
        fallbackUrl.toLowerCase().endsWith('.weba') ||
        (hintFileName && hintFileName.toLowerCase().endsWith('.weba')) ||
        (hintMime && hintMime.startsWith('audio/'));
      return isAudio ? 'audio/webm' : 'video/webm';
    }
    if (buf.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  }
  const checkUrl = hintFileName || fallbackUrl;
  const ext = path.extname(checkUrl.split('?')[0]).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.weba') return 'audio/webm';
  if (ext === '.ogg' || ext === '.opus') return 'audio/ogg';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.m4a' || ext === '.aac') return 'audio/mp4';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function decryptMediaBuffer(rawBuf: Buffer, secretHex: string): Buffer {
  if (!secretHex || !secretHex.trim()) return rawBuf;

  if (nativeModule && nativeModule.decryptFile) {
    try {
      const dec = nativeModule.decryptFile(rawBuf, secretHex);
      if (dec && dec.length > 0) return Buffer.from(dec);
    } catch { }
  }

  if (rawBuf.length < 28) return rawBuf;
  const iv = rawBuf.subarray(0, 12);
  const authTag = rawBuf.subarray(rawBuf.length - 16);
  const ciphertext = rawBuf.subarray(12, rawBuf.length - 16);

  try {
    const rawKey = Buffer.from(secretHex, 'hex');
    if (rawKey.length === 32) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', rawKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }
  } catch { }

  try {
    const rawKey = Buffer.from(secretHex, 'hex');
    const derivedKey = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        rawKey,
        Buffer.from('orbita-file-key', 'utf-8'),
        Buffer.from('file-encryption', 'utf-8'),
        32
      )
    );
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    return rawBuf;
  }
}

function registerOrbitaMediaProtocol() {
  protocol.handle('orbita-media', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      const mediaUrl = parsedUrl.searchParams.get('url');
      const secret = parsedUrl.searchParams.get('secret') || '';
      const chatId = parsedUrl.searchParams.get('chatId') || undefined;
      const messageId = parsedUrl.searchParams.get('messageId') || undefined;
      const hintFileName = parsedUrl.searchParams.get('filename') || undefined;
      const hintMime = parsedUrl.searchParams.get('mime') || undefined;

      if (!mediaUrl) {
        return new Response('Missing URL', { status: 400 });
      }

      let item = await getMediaFromCache(mediaUrl);

      if (!item.data) {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          return new Response('Not found', { status: 404 });
        }
        const arrayBuf = await response.arrayBuffer();
        let rawBuf = Buffer.from(arrayBuf) as Buffer;

        if (secret) {
          rawBuf = decryptMediaBuffer(rawBuf, secret);
        }

        const mime = detectMimeFromBuffer(rawBuf, mediaUrl, hintFileName, hintMime);
        await saveMediaToCache(mediaUrl, rawBuf, mime, chatId, messageId);
        item = { data: rawBuf, mime };
      } else {
        if (secret && item.data && (item.mime === 'application/octet-stream' || item.mime === null)) {
          const dec = decryptMediaBuffer(item.data, secret);
          if (dec !== item.data) {
            const mime = detectMimeFromBuffer(dec, mediaUrl, hintFileName, hintMime);
            await saveMediaToCache(mediaUrl, dec, mime, chatId, messageId);
            item = { data: dec, mime };
          }
        }
        if (item.data && (item.mime === 'audio/ogg' || item.mime === 'application/octet-stream') && item.data.length >= 2 && item.data[0] === 0x1a && item.data[1] === 0x45) {
          const correctedMime = detectMimeFromBuffer(item.data, mediaUrl, hintFileName, hintMime || 'audio/webm');
          if (correctedMime !== item.mime) {
            await saveMediaToCache(mediaUrl, item.data, correctedMime, chatId, messageId);
            item.mime = correctedMime;
          }
        }
      }

      if (!item.data) {
        return new Response('Media not available', { status: 404 });
      }

      const data = item.data;
      const mimeType = item.mime || 'application/octet-stream';
      const totalSize = data.length;

      const rangeHeader = request.headers.get('range');
      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunk = data.subarray(start, end + 1);

        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            'Content-Type': mimeType,
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Content-Length': String(chunk.length),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      }

      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(totalSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (err) {
      console.error('[Protocol] orbita-media error:', err);
      return new Response('Internal error', { status: 500 });
    }
  });
}

// -----------------------------------------------------------------------------
// 4. Downloads Helpers
// -----------------------------------------------------------------------------
const DOWNLOADS_SUBDIR = 'Orbita';

function getDownloadsDir(): string {
  return path.join(app.getPath('downloads'), DOWNLOADS_SUBDIR);
}

function ensureDownloadsDir(): void {
  const dir = getDownloadsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveDownloadedFile(buffer: Buffer, fileName: string): string {
  const dir = getDownloadsDir();
  ensureDownloadsDir();
  let target = path.join(dir, fileName);
  let counter = 1;

  while (fs.existsSync(target)) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    target = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }

  fs.writeFileSync(target, buffer);
  return target;
}

function registerDownloadsIpcHandlers() {
  ensureDownloadsDir();
  ipcMain.handle('downloads:save', async (_event, base64Data: string, fileName: string) => {
    const buf = Buffer.from(base64Data, 'base64');
    const savedPath = saveDownloadedFile(buf, fileName);
    return { path: savedPath };
  });

  ipcMain.handle('downloads:save-as', async (_event, dataOrUrl: string | Uint8Array | ArrayBuffer, fileName: string, filters?: Array<{ name: string; extensions: string[] }>) => {
    try {
      const defaultPath = path.join(app.getPath('downloads'), fileName || 'file');
      const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
      const res = targetWindow
        ? await dialog.showSaveDialog(targetWindow, { defaultPath, filters })
        : await dialog.showSaveDialog({ defaultPath, filters });

      if (res.canceled || !res.filePath) {
        return { canceled: true };
      }
      let buf: Buffer;
      if (typeof dataOrUrl === 'string') {
        if (dataOrUrl.startsWith('http://') || dataOrUrl.startsWith('https://')) {
          const response = await fetch(dataOrUrl);
          const arrayBuf = await response.arrayBuffer();
          buf = Buffer.from(arrayBuf);
        } else {
          const cleanBase64 = dataOrUrl.replace(/^data:[^;]+;base64,/, '');
          buf = Buffer.from(cleanBase64, 'base64');
        }
      } else if (Buffer.isBuffer(dataOrUrl)) {
        buf = dataOrUrl;
      } else if (dataOrUrl instanceof ArrayBuffer) {
        buf = Buffer.from(dataOrUrl);
      } else {
        buf = Buffer.from(dataOrUrl.buffer, dataOrUrl.byteOffset, dataOrUrl.byteLength);
      }
      await fs.promises.writeFile(res.filePath, buf);
      return { success: true, path: res.filePath };
    } catch (err) {
      console.error('downloads:save-as error:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('orbita:copy-image', async (_event, base64Data: string) => {
    try {
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(cleanBase64, 'base64');
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) {
        return { success: false, error: 'Empty image' };
      }
      clipboard.writeImage(img);
      return { success: true };
    } catch (err) {
      console.error('orbita:copy-image error:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('orbita:open-file', async (_event, data: string | Uint8Array | ArrayBuffer, fileName: string) => {
    try {
      const sanitizedName = (fileName || 'file.dat').replace(/[<>:"/\\|?*]/g, '_');
      const tempDir = path.join(app.getPath('temp'), 'Orbita_Files');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const filePath = path.join(tempDir, sanitizedName);
      let buf: Buffer;
      if (typeof data === 'string') {
        const cleanBase64 = data.replace(/^data:[^;]+;base64,/, '');
        buf = Buffer.from(cleanBase64, 'base64');
      } else if (Buffer.isBuffer(data)) {
        buf = data;
      } else if (data instanceof ArrayBuffer) {
        buf = Buffer.from(data);
      } else {
        buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      }
      fs.writeFileSync(filePath, buf);
      const err = await shell.openPath(filePath);
      if (err) {
        return { success: false, error: err };
      }
      return { success: true, path: filePath };
    } catch (err) {
      console.error('orbita:open-file error:', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('downloads:open', async (_event, fileName?: string) => {
    const dir = getDownloadsDir();
    if (fileName) {
      const full = path.join(dir, fileName);
      if (fs.existsSync(full)) {
        await shell.openPath(full);
      }
    } else {
      await shell.openPath(dir);
    }
  });
}

// -----------------------------------------------------------------------------
// 5. Encrypted KV Store & Message History in SQLite
// -----------------------------------------------------------------------------
const APP_DB_NAME = 'orbita.db';
const KV_TABLE = 'kv_store';
const MSG_TABLE = 'messages';
let appDbInstance: sqlite3.Database | null = null;

function getAppDbPath(): string {
  return path.join(app.getPath('userData'), APP_DB_NAME);
}

function initStorageDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const dbPath = getAppDbPath();
    appDbInstance = new sqlite3.Database(dbPath);
    appDbInstance.serialize(() => {
      appDbInstance!.run(
        `
        CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `
      );
      appDbInstance!.run(
        `
        CREATE TABLE IF NOT EXISTS ${MSG_TABLE} (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          message_data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `
      );
      appDbInstance!.run(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON ${MSG_TABLE}(chat_id)
      `);
      appDbInstance!.run(
        `
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON ${MSG_TABLE}(created_at)
      `,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });
}

function closeStorageDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (appDbInstance) {
      appDbInstance.close((err) => {
        appDbInstance = null;
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

function getDb(): sqlite3.Database {
  if (!appDbInstance) throw new Error('Storage not initialized');
  return appDbInstance;
}

function getKvValue(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    getDb().get(`SELECT value FROM ${KV_TABLE} WHERE key = ?`, [key], (err, row: any) => {
      if (err) return reject(err);
      if (row) {
        const raw = Buffer.from(row.value, 'base64');
        const decrypted = decryptData(raw);
        resolve(decrypted ? decrypted.toString('utf8') : null);
      } else {
        resolve(null);
      }
    });
  });
}

function setKvValue(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const encrypted = encryptData(Buffer.from(value, 'utf8')).toString('base64');
    getDb().run(`INSERT OR REPLACE INTO ${KV_TABLE} (key, value) VALUES (?, ?)`, [key, encrypted], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteKvValue(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${KV_TABLE} WHERE key = ?`, [key], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getMessages(chatId: string, limit?: number, offset?: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let sql = `SELECT id, message_data FROM ${MSG_TABLE} WHERE chat_id = ? ORDER BY created_at ASC`;
    const params: any[] = [chatId];
    if (limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    if (offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
    getDb().all(sql, params, (err, rows: any[]) => {
      if (err) return reject(err);
      const items = rows
        .map((r) => {
          const dec = decryptData(Buffer.from(r.message_data, 'base64'));
          if (!dec) return null;
          try {
            return JSON.parse(dec.toString('utf8'));
          } catch {
            return null;
          }
        })
        .filter((m) => m !== null);
      resolve(items);
    });
  });
}

function addMessage(chatId: string, messageId: string, messageData: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(messageData);
    const enc = encryptData(Buffer.from(json, 'utf8')).toString('base64');
    const createdAt = Date.now();
    getDb().run(
      `INSERT OR REPLACE INTO ${MSG_TABLE} (id, chat_id, message_data, created_at) VALUES (?, ?, ?, ?)`,
      [messageId, chatId, enc, createdAt],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function deleteMessagesByChat(chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${MSG_TABLE} WHERE chat_id = ?`, [chatId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteMessageById(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${MSG_TABLE} WHERE id = ?`, [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function migrateFromLocalStorage(): Promise<void> {
  // LocalStorage is in renderer context; no-op in Node main process
}

function registerStorageIpcHandlers() {
  ipcMain.handle('storage:get', async (_event, key: string) => await getKvValue(key));
  ipcMain.handle('storage:set', async (_event, key: string, value: string) => {
    await setKvValue(key, value);
  });
  ipcMain.handle('storage:remove', async (_event, key: string) => {
    await deleteKvValue(key);
  });
  ipcMain.handle('storage:migrate', async () => {
    await migrateFromLocalStorage();
    return { success: true };
  });
  ipcMain.handle('storage:get-messages', async (_event, chatId: string, limit?: number, offset?: number) =>
    await getMessages(chatId, limit, offset)
  );
  ipcMain.handle('storage:add-message', async (_event, chatId: string, messageId: string, messageData: any) => {
    await addMessage(chatId, messageId, messageData);
  });
  ipcMain.handle('storage:delete-messages', async (_event, chatId: string) => {
    await deleteMessagesByChat(chatId);
  });
  ipcMain.handle('storage:delete-message', async (_event, messageId: string) => {
    await deleteMessageById(messageId);
  });
}

// -----------------------------------------------------------------------------
// 6. Streaming HTTP Multipart Upload to Cloudinary / Worker Gateway
// -----------------------------------------------------------------------------
function uploadToCloudinaryWithProgress(
  filePath: string,
  uploadUrl: string,
  fields: Record<string, string>,
  fieldName: string,
  onProgress: (sent: number, total: number) => void
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const fileLength = fileBuffer.length;
    const boundary = `----OrbitaBoundary${Date.now().toString(16)}`;
    const fieldChunks: Buffer[] = [];

    for (const [k, v] of Object.entries(fields)) {
      fieldChunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
        )
      );
    }

    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    let mimeType = 'application/octet-stream';
    const imageMimes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const videoMimes: Record<string, string> = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
    };

    if (imageMimes[ext]) mimeType = imageMimes[ext];
    else if (videoMimes[ext]) mimeType = videoMimes[ext];

    const fileHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody = Buffer.concat([...fieldChunks, fileHeader, fileBuffer, fileFooter]);
    const totalLength = fullBody.length;

    const parsedUrl = new URL(uploadUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpLib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalLength,
      },
    };

    const req = httpLib.request(reqOptions, (res) => {
      let respBody = '';
      res.on('data', (chunk) => {
        respBody += chunk.toString();
      });
      res.on('end', () => resolve({ statusCode: res.statusCode || 200, body: respBody }));
    });

    req.on('error', reject);

    const CHUNK_SIZE = 64 * 1024;
    let offset = 0;

    const sendNextChunk = () => {
      while (offset < totalLength) {
        const next = Math.min(offset + CHUNK_SIZE, totalLength);
        const chunk = fullBody.slice(offset, next);
        offset = next;

        const headerLen = totalLength - fileLength - fileFooter.length;
        const uploadedFileBytes = Math.max(0, Math.min(fileLength, offset - headerLen));
        onProgress(uploadedFileBytes, fileLength);

        if (!req.write(chunk)) {
          req.once('drain', sendNextChunk);
          return;
        }
      }
      req.end();
    };

    sendNextChunk();
  });
}

async function cloudinaryUploadWithProgress(event: Electron.IpcMainInvokeEvent, filePath: string, publicId: string) {
  let fields: Record<string, string>;
  let uploadUrl: string;

  if (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET && CLOUDINARY_CLOUD_NAME) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const strToSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(strToSign).digest('hex');

    fields = {
      public_id: publicId,
      timestamp,
      api_key: CLOUDINARY_API_KEY,
      signature,
    };
    uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  } else {
    try {
      const resp = await fetch(`${WORKER_URL}/cloudinary/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });

      if (!resp.ok) throw new Error(`Worker signing failed: ${resp.statusText}`);
      const signed = await resp.json();

      fields = {
        public_id: publicId,
        timestamp: signed.timestamp,
        api_key: signed.apiKey,
        signature: signed.signature,
      };
      uploadUrl = signed.uploadUrl;
    } catch (e: any) {
      console.error('[Cloudinary] Failed to get signature from worker:', e);
      return { success: false, error: `Failed to sign upload: ${e?.message || e}` };
    }
  }

  try {
    const { statusCode, body } = await uploadToCloudinaryWithProgress(
      filePath,
      uploadUrl,
      fields,
      'file',
      (uploadedBytes, totalBytes) => {
        event.sender.send('orbita:uploadProgress', {
          publicId,
          uploadedBytes,
          totalBytes,
        });
      }
    );

    const parsed = JSON.parse(body);
    if (statusCode === 200 && parsed.secure_url) {
      return { success: true, secure_url: parsed.secure_url, bytes: parsed.bytes };
    } else {
      return { success: false, error: parsed.error?.message || `HTTP ${statusCode}` };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// -----------------------------------------------------------------------------
// 7. General Utility Handlers
// -----------------------------------------------------------------------------
ipcMain.handle('orbita:pickFile', async (_event, extensions?: string[]) => {
  try {
    const filters =
      extensions && extensions.length > 0
        ? [{ name: 'Files', extensions: extensions.map((e) => e.replace(/^\./, '')) }]
        : [{ name: 'All Files', extensions: ['*'] }];
    const res = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters,
    });
    return res.canceled || !res.filePaths || res.filePaths.length === 0 ? null : res.filePaths;
  } catch (err) {
    console.error('orbita:pickFile error:', err);
    if (nativeModule) {
      try {
        const file = await nativeModule.pickFile(extensions);
        return file ? [file] : null;
      } catch { }
    }
    return null;
  }
});

ipcMain.handle('orbita:selectDirectory', async () => {
  try {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled || !res.filePaths || res.filePaths.length === 0 ? null : res.filePaths[0];
  } catch (err) {
    return null;
  }
});

ipcMain.handle('orbita:openFolder', async (_event, folderPath: string) => {
  try {
    if (folderPath && typeof folderPath === 'string') {
      await shell.openPath(folderPath);
      return true;
    }
  } catch (err) {}
  return false;
});

ipcMain.handle('orbita:saveBackupFile', async (_event, folderPath: string, fileName: string, data: Uint8Array | ArrayBuffer) => {
  try {
    const fullPath = path.join(folderPath, fileName);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
    await fs.promises.writeFile(fullPath, buf);
    return { success: true, fullPath };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed' };
  }
});

// -----------------------------------------------------------------------------
// 7.1 Native Rust Cryptography Handlers (Hardware-Accelerated)
// -----------------------------------------------------------------------------
ipcMain.handle('orbita:rustEncryptFile', async (_event, dataBuffer: Uint8Array | ArrayBuffer, sharedSecretHex: string) => {
  if (nativeModule && nativeModule.encryptFile) {
    try {
      const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer as any);
      return nativeModule.encryptFile(buf, sharedSecretHex);
    } catch (e) {
      console.error('[RustCrypto] encryptFile failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustDecryptFile', async (_event, dataBuffer: Uint8Array | ArrayBuffer, sharedSecretHex: string) => {
  if (nativeModule && nativeModule.decryptFile) {
    try {
      const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer as any);
      return nativeModule.decryptFile(buf, sharedSecretHex);
    } catch (e) {
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustDeriveSharedSecret', async (_event, myPrivateKeyHex: string, otherPublicKeyHex: string) => {
  if (nativeModule && nativeModule.deriveSharedSecret) {
    try {
      return nativeModule.deriveSharedSecret(myPrivateKeyHex, otherPublicKeyHex);
    } catch (e) {
      console.error('[RustCrypto] deriveSharedSecret failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustDeriveRootKey', async (_event, sharedSecretHex: string) => {
  if (nativeModule && nativeModule.deriveRootKey) {
    try {
      return nativeModule.deriveRootKey(sharedSecretHex);
    } catch (e) {
      console.error('[RustCrypto] deriveRootKey failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustGenerateKeyPair', async () => {
  if (nativeModule && nativeModule.generateKeyPair) {
    try {
      return nativeModule.generateKeyPair();
    } catch (e) {
      console.error('[RustCrypto] generateKeyPair failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustDerivePublicKey', async (_event, privateKeyHex: string) => {
  if (nativeModule && nativeModule.derivePublicKey) {
    try {
      return nativeModule.derivePublicKey(privateKeyHex);
    } catch (e) {
      console.error('[RustCrypto] derivePublicKey failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustEncryptMessage', async (_event, key: Uint8Array, plaintext: Uint8Array, nonce?: Uint8Array, associatedData?: Uint8Array) => {
  if (nativeModule && nativeModule.encryptMessageAesGcm) {
    try {
      return nativeModule.encryptMessageAesGcm(
        Buffer.from(key),
        Buffer.from(plaintext),
        nonce ? Buffer.from(nonce) : null,
        associatedData ? Buffer.from(associatedData) : null
      );
    } catch (e) {
      console.error('[RustCrypto] encryptMessage failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustDecryptMessage', async (_event, key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array, associatedData?: Uint8Array) => {
  if (nativeModule && nativeModule.decryptMessageAesGcm) {
    try {
      return nativeModule.decryptMessageAesGcm(
        Buffer.from(key),
        Buffer.from(ciphertext),
        Buffer.from(nonce),
        Buffer.from(tag),
        associatedData ? Buffer.from(associatedData) : null
      );
    } catch (e) {
      console.error('[RustCrypto] decryptMessage failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustProcessAudioWaveform', async (_event, dataBuffer: Uint8Array | ArrayBuffer, numBars: number) => {
  if (nativeModule && nativeModule.processAudioWaveform) {
    try {
      const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer as any);
      return nativeModule.processAudioWaveform(buf, numBars);
    } catch (e) {
      console.error('[RustEngine] processAudioWaveform failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustResizeImage', async (_event, dataBuffer: Uint8Array | ArrayBuffer, maxWidth: number, maxHeight: number, quality?: number) => {
  if (nativeModule && nativeModule.resizeImage) {
    try {
      const buf = Buffer.isBuffer(dataBuffer) ? dataBuffer : Buffer.from(dataBuffer as any);
      return nativeModule.resizeImage(buf, maxWidth, maxHeight, quality);
    } catch (e) {
      console.error('[RustEngine] resizeImage failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustFastTextSearch', async (_event, haystack: string[], query: string) => {
  if (nativeModule && nativeModule.fastTextSearch) {
    try {
      return nativeModule.fastTextSearch(haystack, query);
    } catch (e) {
      console.error('[RustEngine] fastTextSearch failed:', e);
      return null;
    }
  }
  return null;
});

ipcMain.handle('orbita:rustReadFileFast', async (_event, filePath: string) => {
  if (nativeModule && nativeModule.readFileFast) {
    try {
      const res = nativeModule.readFileFast(filePath);
      if (res) return res;
    } catch (e) {
      console.error('[RustEngine] readFileFast failed, falling back to fs:', e);
    }
  }
  try {
    if (filePath && fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch (err) {
    console.error('[Electron] Fallback fs.readFileSync failed:', err);
  }
  return null;
});

ipcMain.handle('orbita:writeTempFile', async (_event, base64Data: string, extension?: string) => {
  try {
    const ext = extension ? `.${extension}` : '';
    const tempPath = path.join(os.tmpdir(), `orbita_enc_${Date.now()}${ext}`);
    const buf = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tempPath, buf);
    return tempPath;
  } catch (err) {
    console.error('Failed to write temp file:', err);
    return null;
  }
});

ipcMain.handle('orbita:readClipboardImage', async () => {
  try {
    const img = clipboard.readImage();
    if (img && !img.isEmpty()) {
      return img.toDataURL();
    }
  } catch (err) {
    console.error('Failed to read clipboard image:', err);
  }
  return null;
});

ipcMain.handle('orbita:deleteTempFile', async (_event, filePath: string) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch { }
});

ipcMain.handle('orbita:upload', async (event, { filePath, publicId }: { filePath: string; publicId: string }) => {
  return await cloudinaryUploadWithProgress(event, filePath, publicId);
});

ipcMain.handle('orbita:destroyCloudinaryMedia', async (_event, publicId: string, resourceType: string = 'image') => {
  if (!publicId) return { success: false };
  try {
    if (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET && CLOUDINARY_CLOUD_NAME) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const strToSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
      const signature = crypto.createHash('sha1').update(strToSign).digest('hex');

      const formData = new URLSearchParams();
      formData.append('public_id', publicId);
      formData.append('api_key', CLOUDINARY_API_KEY);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);

      const rTypes = ['image', 'video', 'raw'];
      for (const rt of rTypes) {
        fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${rt}/destroy`, {
          method: 'POST',
          body: formData,
        }).catch(() => { });
      }
      return { success: true };
    } else {
      fetch(`${WORKER_URL}/cloudinary/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: publicId, resourceType }),
      }).catch(() => { });
      return { success: true };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('orbita:readFileAsDataURL', async (_event, filePath: string) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    let mime = 'application/octet-stream';
    if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v'].includes(ext)) {
      mime = `video/${ext === 'mov' ? 'quicktime' : ext}`;
    } else if (['jpg', 'jpeg'].includes(ext)) mime = 'image/jpeg';
    else if (ext === 'png') mime = 'image/png';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'webp') mime = 'image/webp';
    else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma'].includes(ext)) {
      mime = ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`;
    } else if (ext === 'pdf') mime = 'application/pdf';

    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    console.error('Failed to read file for preview:', err);
    return null;
  }
});

ipcMain.handle('orbita:getFileSize', async (_event, filePath: string) => {
  try {
    return (await fs.promises.stat(filePath)).size;
  } catch (err) {
    console.error('Failed to get file size:', err);
    return 0;
  }
});

ipcMain.handle('orbita:getAudioMetadata', async (_event, filePath: string) => {
  const defaultTitle = path.basename(filePath, path.extname(filePath));
  let fileSize = 0;
  try {
    if (fs.existsSync(filePath)) {
      fileSize = fs.statSync(filePath).size;
    }
  } catch {}

  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath);
    const title = metadata.common.title || defaultTitle;
    const artist = metadata.common.artist || null;
    const duration = Math.round(metadata.format.duration || 0);
    let cover: string | null = null;
    const pic = metadata.common.picture && metadata.common.picture[0];
    if (pic && pic.data && pic.format) {
      const base64 = Buffer.from(pic.data).toString('base64');
      cover = `data:${pic.format};base64,${base64}`;
    }
    return { success: true, title, artist, duration, size: fileSize, cover };
  } catch {}

  return new Promise((resolve) => {
    jsmediatags.read(filePath, {
      onSuccess: (tag: any) => {
        const { tags } = tag;
        const title = tags.title || defaultTitle;
        const artist = tags.artist || null;
        const duration = tags.duration || 0;
        let cover: string | null = null;
        const picture = tags.picture;
        if (picture && picture.data && picture.format) {
          const base64 = Buffer.from(picture.data).toString('base64');
          cover = `data:${picture.format};base64,${base64}`;
        }
        resolve({ success: true, title, artist, duration, size: fileSize, cover });
      },
      onError: () => {
        resolve({
          success: false,
          title: defaultTitle,
          artist: null,
          duration: 0,
          size: fileSize,
          cover: null,
        });
      },
    });
  });
});

ipcMain.handle('orbita:openExternal', async (_event, url: string) => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    shell.openExternal(url);
  } else {
    console.warn('Attempted to open unsafe link:', url);
  }
});

async function fetchWithRedirects(targetUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await electronNet.fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 (compatible; Googlebot/2.1; Twitterbot/1.0; TelegramBot)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

ipcMain.handle('orbita:fetchUrl', async (_event, url: string) => await fetchWithRedirects(url));

// -----------------------------------------------------------------------------
// 8. Theme, Icons, and System Tray
// -----------------------------------------------------------------------------
let currentThemeId = 'orbita';
let currentThemeVars: Record<string, string> = {};
let mainWindow: BrowserWindow | null = null;
let mediaWindow: BrowserWindow | null = null;
let trayInstance: Tray | null = null;
let showInTraySetting = true;
let isQuitting = false;

ipcMain.handle('orbita:get-current-theme', () => ({
  themeId: currentThemeId,
  themeVars: currentThemeVars,
}));

ipcMain.on('orbita:set-current-theme', (_event, { themeId, themeVars }) => {
  currentThemeId = themeId;
  currentThemeVars = themeVars || {};
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('orbita:theme-changed', { themeId, themeVars });
  }
  if (mediaWindow && !mediaWindow.isDestroyed()) {
    mediaWindow.webContents.send('orbita:theme-changed', { themeId, themeVars });
  }
});

let currentFontFamily = 'system';
ipcMain.on('orbita:set-current-font', (_event, fontFamily: string) => {
  currentFontFamily = fontFamily || 'system';
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('orbita:font-changed', currentFontFamily);
  }
  if (mediaWindow && !mediaWindow.isDestroyed()) {
    mediaWindow.webContents.send('orbita:font-changed', currentFontFamily);
  }
});

ipcMain.handle('orbita:get-current-font', () => {
  return currentFontFamily;
});

let currentAppIconName = 'orbita1';
let currentNotifIconName = 'orbita1';

function resolveIconPath(iconName: string, ext: string): string | undefined {
  const name = iconName || currentAppIconName || 'orbita1';
  const candidates = isPackaged
    ? [
      path.join(app.getAppPath(), 'dist', `${name}.${ext}`),
      path.join(process.resourcesPath, 'dist', `${name}.${ext}`),
      path.join(process.resourcesPath, `${name}.${ext}`),
    ]
    : [
      path.join(__dirname, `../public/${name}.${ext}`),
      path.join(__dirname, `../dist/${name}.${ext}`),
    ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log('[Icon] Path found:', c);
      return c;
    }
  }
}

function loadNativeAppIcon(iconName?: string): Electron.NativeImage | undefined {
  try {
    const name = iconName || currentAppIconName || 'orbita1';
    const ext = process.platform === 'win32' ? 'ico' : 'png';
    const resolved = resolveIconPath(name, ext) || resolveIconPath(name, 'png');
    if (resolved) {
      const img = nativeImage.createFromPath(resolved);
      if (img && !img.isEmpty()) {
        console.log('[Icon] Loaded from:', resolved);
        return img;
      }
    }
  } catch (err: any) {
    console.warn('[Icon] Error:', err.message);
  }
}

function getNotificationIconBase64(iconName?: string): string | null {
  try {
    const resolved = resolveIconPath(iconName || currentNotifIconName || 'orbita1', 'png');
    if (resolved) {
      const base64 = fs.readFileSync(resolved).toString('base64');
      return `data:image/png;base64,${base64}`;
    }
    return null;
  } catch (err) {
    console.warn('[Icon] Error generating base64 for notification:', err);
    return null;
  }
}

function loadTrayIcon(): Electron.NativeImage | undefined {
  try {
    const resolved = resolveIconPath('orbita4', 'png');
    if (resolved) {
      const img = nativeImage.createFromPath(resolved);
      if (img && !img.isEmpty()) return img;
    }
  } catch (err: any) {
    console.warn('[TrayIcon] Error loading static tray icon:', err.message);
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.show();
  mainWindow.focus();
}

function destroyTray() {
  if (trayInstance) {
    trayInstance.removeAllListeners();
    trayInstance.destroy();
    trayInstance = null;
  }
}

function parseColorToBgr(colorStr: string, defaultBgr: number): number {
  if (!colorStr) return defaultBgr;
  const s = colorStr.trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return (b << 16) | (g << 8) | r;
    }
  } else if (s.startsWith('rgb')) {
    const match = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return (b << 16) | (g << 8) | r;
    }
  }
  return defaultBgr;
}

function showTrayContextMenu() {
  if (!trayInstance) return;
  const bounds = trayInstance.getBounds();
  const items = ['Открыть Orbita', 'Закрыть Orbita'];

  const bgStr = currentThemeVars['--md-surface'] || currentThemeVars['--settings-surface'] || currentThemeVars['--surface-container'] || '#2a253b';
  const hoverStr = currentThemeVars['--md-surface-var'] || currentThemeVars['--settings-surface-var'] || currentThemeVars['--surface-container-strong'] || '#342e47';
  const textStr = currentThemeVars['--text-main'] || '#ffffff';

  const bgColor = parseColorToBgr(bgStr, 0x003b252a);
  const hoverColor = parseColorToBgr(hoverStr, 0x00472e34);
  const textColor = parseColorToBgr(textStr, 0x00ffffff);

  let fontName = currentFontFamily;
  if (fontName === 'system' || !fontName) {
    fontName = 'Segoe UI';
  }

  if (nativeModule && typeof nativeModule.showNativeTrayMenu === 'function') {
    try {
      const selectedIndex = nativeModule.showNativeTrayMenu(
        Math.round(bounds.x),
        Math.round(bounds.y),
        Math.round(bounds.width),
        Math.round(bounds.height),
        items,
        bgColor,
        textColor,
        hoverColor,
        0,
        fontName
      );
      if (selectedIndex === 0) {
        showMainWindow();
      } else if (selectedIndex === 1) {
        isQuitting = true;
        app.quit();
      }
      return;
    } catch (err) {
      console.warn('[TrayMenu] Native tray menu error, falling back:', err);
    }
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Открыть Orbita', click: () => showMainWindow() },
    { label: 'Закрыть Orbita', click: () => { isQuitting = true; app.quit(); } },
  ]);
  trayInstance.popUpContextMenu(menu);
}

function setupTray() {
  if (trayInstance || !showInTraySetting) return;
  const icon = loadTrayIcon();
  if (icon) {
    trayInstance = new Tray(icon);
    trayInstance.setToolTip('Orbita Desktop');
    trayInstance.setIgnoreDoubleClickEvents(true);
    trayInstance.on('click', () => {
      showMainWindow();
    });
    trayInstance.on('right-click', () => showTrayContextMenu());
  }
}

function updateTrayIcon() {
  if (!trayInstance) return;
  const icon = loadTrayIcon();
  if (icon && !icon.isEmpty()) {
    trayInstance.setImage(icon);
  }
}

let activeAppliedAppIcon = '';

ipcMain.on('orbita:set-app-icon', (_event, iconName: string) => {
  if (activeAppliedAppIcon === iconName) return;
  activeAppliedAppIcon = iconName;
  console.log('[Icon] Setting app icon to:', iconName);
  currentAppIconName = iconName;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const icon = loadNativeAppIcon(iconName);
    if (icon) {
      mainWindow.setIcon(icon);
      if (process.platform === 'win32') {
        const origTitle = mainWindow.getTitle();
        mainWindow.setSkipTaskbar(true);
        mainWindow.setTitle(origTitle + ' ');
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setIcon(icon);
            mainWindow.setTitle(origTitle);
            mainWindow.setSkipTaskbar(false);
            mainWindow.flashFrame(true);
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.flashFrame(false);
              }
            }, 300);
          }
        }, 250);
      }
    }
  }
  updateTrayIcon();
});

ipcMain.on('orbita:set-notification-icon', (_event, iconName: string) => {
  currentNotifIconName = iconName;
});

ipcMain.handle('orbita:get-current-icons', () => ({
  appIcon: currentAppIconName || 'orbita1',
  notificationIcon: currentNotifIconName || 'orbita1',
}));

ipcMain.handle('orbita:set-show-in-system-tray', (_event, show: boolean) => {
  showInTraySetting = !!show;
  saveWindowSettings();
  if (showInTraySetting) setupTray();
  else destroyTray();
  return showInTraySetting;
});

ipcMain.handle('orbita:get-show-in-system-tray', () => {
  loadWindowSettings();
  return showInTraySetting;
});

ipcMain.handle('orbita:set-auto-launch', (_event, enable: boolean) => {
  if (typeof app.setLoginItemSettings === 'function' && process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      path: app.getPath('exe'),
    });
  }
  return !!enable;
});

ipcMain.handle('orbita:get-auto-launch-state', () => {
  if (typeof app.getLoginItemSettings === 'function' && process.platform === 'win32') {
    return !!app.getLoginItemSettings().openAtLogin;
  }
  return false;
});

const WINDOW_SETTINGS_FILE = path.join(app.getPath('userData'), 'orbita_window_settings.json');

function loadWindowSettings() {
  try {
    if (fs.existsSync(WINDOW_SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WINDOW_SETTINGS_FILE, 'utf8'));
      if (data && typeof data === 'object') {
        if (typeof data.screenProtection === 'boolean') screenProtectionSetting = data.screenProtection;
        if (typeof data.hideMenuBar === 'boolean') hideMenuBarSetting = data.hideMenuBar;
        if (typeof data.showInTray === 'boolean') showInTraySetting = data.showInTray;
      }
    }
  } catch {}
}

function saveWindowSettings() {
  try {
    const data = {
      screenProtection: screenProtectionSetting,
      hideMenuBar: hideMenuBarSetting,
      showInTray: showInTraySetting,
    };
    fs.writeFileSync(WINDOW_SETTINGS_FILE, JSON.stringify(data), 'utf8');
  } catch {}
}

let screenProtectionSetting = false;

ipcMain.handle('orbita:set-screen-protection', (_event, enabled: boolean) => {
  screenProtectionSetting = !!enabled;
  saveWindowSettings();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setContentProtection(screenProtectionSetting);
  }
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.setContentProtection(screenProtectionSetting);
  }
  if (mediaWindow && !mediaWindow.isDestroyed()) {
    mediaWindow.setContentProtection(screenProtectionSetting);
  }
  return screenProtectionSetting;
});

ipcMain.handle('orbita:get-screen-protection', () => {
  loadWindowSettings();
  return screenProtectionSetting;
});

let hideMenuBarSetting = false;

ipcMain.handle('orbita:set-hide-menu-bar', (_event, hide: boolean) => {
  hideMenuBarSetting = !!hide;
  saveWindowSettings();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAutoHideMenuBar(hideMenuBarSetting);
    mainWindow.setMenuBarVisibility(!hideMenuBarSetting);
  }
  return hideMenuBarSetting;
});

ipcMain.handle('orbita:get-hide-menu-bar', () => {
  loadWindowSettings();
  return hideMenuBarSetting;
});

ipcMain.on('orbita:tray-menu-action', (_event, action: string) => {
  if (action === 'open') {
    showMainWindow();
  } else if (action === 'quit') {
    isQuitting = true;
    app.quit();
  }
});

ipcMain.handle('orbita:is-window-visible', () => !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()));

ipcMain.handle('orbita:show-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
  }
});

ipcMain.handle('orbita:hide-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

let callWindow: BrowserWindow | null = null;
let currentCallStateCache: any = null;
const CALL_BOUNDS_FILE = path.join(app.getPath('userData'), 'call_window_bounds.json');

function getSavedCallWindowBounds(): { width: number; height: number; x?: number; y?: number } {
  try {
    if (fs.existsSync(CALL_BOUNDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CALL_BOUNDS_FILE, 'utf8'));
      if (data && typeof data.width === 'number' && typeof data.height === 'number') {
        const display = screen.getPrimaryDisplay();
        const { width: screenW, height: screenH } = display.workAreaSize;
        const width = Math.max(340, Math.min(data.width, screenW));
        const height = Math.max(480, Math.min(data.height, screenH));
        const x = typeof data.x === 'number' ? data.x : undefined;
        const y = typeof data.y === 'number' ? data.y : undefined;
        return { width, height, x, y };
      }
    }
  } catch { }
  return { width: 440, height: 640 };
}

function saveCallWindowBounds(win: BrowserWindow) {
  try {
    if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const bounds = win.getBounds();
    fs.writeFileSync(CALL_BOUNDS_FILE, JSON.stringify(bounds), 'utf8');
  } catch { }
}

function buildCallUrlQuery(payload?: any): string {
  if (nativeModule?.rustBuildCallQuery && payload) {
    try {
      const otherName = payload.activeCall?.otherName || payload.incomingCall?.otherName || payload.incomingCall?.from || payload.activeCall?.chatId || '';
      const otherAvatar = payload.activeCall?.otherAvatar || payload.incomingCall?.otherAvatar || undefined;
      const chatId = payload.activeCall?.chatId || payload.incomingCall?.chatId || '';
      const callState = payload.callState || 'preparing';
      const direction = payload.activeCall?.direction || 'outgoing';
      const callType = payload.activeCall?.callType || payload.incomingCall?.callType || 'audio';
      const verificationSecret = payload.activeCall?.verificationSecret || undefined;
      const verificationSalt = payload.activeCall?.verificationSalt || undefined;

      return nativeModule.rustBuildCallQuery({
        name: otherName,
        avatar: otherAvatar,
        chat_id: chatId,
        call_state: callState,
        direction: direction,
        call_type: callType,
        verification_secret: verificationSecret,
        verification_salt: verificationSalt,
      });
    } catch { }
  }

  const params = new URLSearchParams();
  params.set('view', 'call');
  if (payload) {
    const otherName = payload.activeCall?.otherName || payload.incomingCall?.otherName || payload.incomingCall?.from || payload.activeCall?.chatId;
    if (otherName) params.set('name', otherName);
    const otherAvatar = payload.activeCall?.otherAvatar || payload.incomingCall?.otherAvatar;
    if (otherAvatar) params.set('avatar', otherAvatar);
    if (payload.callState) params.set('state', payload.callState);
    if (payload.activeCall?.direction) params.set('direction', payload.activeCall.direction);
    if (payload.activeCall?.callType) params.set('type', payload.activeCall.callType);
    if (payload.activeCall?.chatId) params.set('chatId', payload.activeCall.chatId);
    if (payload.myNickname) params.set('myNickname', payload.myNickname);
  }
  if (currentFontFamily) params.set('font', currentFontFamily);
  return params.toString();
}

function initOrGetCallWindow(initialPayload?: any): BrowserWindow {
  if (initialPayload) {
    currentCallStateCache = initialPayload;
  }

  if (callWindow && !callWindow.isDestroyed()) {
    return callWindow;
  }

  const icon = loadNativeAppIcon();
  const bounds = getSavedCallWindowBounds();

  callWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 340,
    minHeight: 480,
    resizable: true,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#14111d',
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
    title: 'Orbita Call',
    show: false,
    icon: icon && !icon.isEmpty() ? icon : undefined,
  });

  Menu.setApplicationMenu(null);
  if (screenProtectionSetting) {
    callWindow.setContentProtection(true);
  }

  callWindow.on('resize', () => {
    if (callWindow && !callWindow.isDestroyed()) {
      saveCallWindowBounds(callWindow);
      callWindow.webContents.send('window:state-changed', callWindow.isMaximized());
    }
  });

  callWindow.on('move', () => {
    if (callWindow && !callWindow.isDestroyed()) {
      saveCallWindowBounds(callWindow);
    }
  });

  callWindow.on('maximize', () => {
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.webContents.send('window:state-changed', true);
    }
  });

  callWindow.on('unmaximize', () => {
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.webContents.send('window:state-changed', false);
    }
  });

  callWindow.on('closed', () => {
    callWindow = null;
    if (!isQuitting) {
      initCallWindowPrewarm();
    }
  });

  const queryStr = buildCallUrlQuery(initialPayload || currentCallStateCache);

  if (isPackaged) {
    callWindow.loadFile(path.join(__dirname, '../dist/call.html'), { search: queryStr });
  } else {
    callWindow.loadURL(`http://127.0.0.1:5173/call.html?${queryStr}`);
  }

  return callWindow;
}

function createOrShowCallWindow(initialPayload?: any): BrowserWindow {
  if (initialPayload) {
    currentCallStateCache = initialPayload;
  }

  const win = initOrGetCallWindow(initialPayload);

  if (currentCallStateCache && !win.isDestroyed()) {
    win.webContents.send('orbita:call-state', currentCallStateCache);
  }

  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  if (currentCallStateCache && !win.isDestroyed() && win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (currentCallStateCache && !win.isDestroyed()) {
        win.webContents.send('orbita:call-state', currentCallStateCache);
      }
    });
  }

  return win;
}

function initCallWindowPrewarm() {
  setTimeout(() => {
    try {
      if (!isQuitting && (!callWindow || callWindow.isDestroyed())) {
        initOrGetCallWindow();
      }
    } catch { }
  }, 1200);
}

ipcMain.handle('orbita:open-call-window', (_event, payload?: any) => {
  createOrShowCallWindow(payload);
  return { success: true };
});

ipcMain.handle('orbita:close-call-window', () => {
  if (callWindow && !callWindow.isDestroyed()) {
    currentCallStateCache = null;
    callWindow.webContents.send('orbita:call-state', null);
    callWindow.hide();
  }
  return { success: true };
});

ipcMain.on('orbita:send-call-state', (_event, state: any) => {
  currentCallStateCache = state;
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('orbita:call-state', state);
  }
});

ipcMain.handle('orbita:get-call-state', () => {
  return currentCallStateCache;
});

ipcMain.on('orbita:send-call-action', (_event, action: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbita:call-action', action);
  }
});

let currentMediaPayloadCache: any = null;
const MEDIA_BOUNDS_FILE = path.join(app.getPath('userData'), 'media_window_bounds.json');

function getSavedMediaWindowBounds(): { width: number; height: number; x?: number; y?: number } {
  try {
    if (fs.existsSync(MEDIA_BOUNDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(MEDIA_BOUNDS_FILE, 'utf8'));
      if (data && typeof data.width === 'number' && typeof data.height === 'number') {
        const display = screen.getPrimaryDisplay();
        const { width: screenW, height: screenH } = display.workAreaSize;
        const width = Math.max(480, Math.min(data.width, screenW));
        const height = Math.max(360, Math.min(data.height, screenH));
        const x = typeof data.x === 'number' ? data.x : undefined;
        const y = typeof data.y === 'number' ? data.y : undefined;
        return { width, height, x, y };
      }
    }
  } catch { }
  return { width: 900, height: 700 };
}

function saveMediaWindowBounds(win: BrowserWindow) {
  try {
    if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
    const display = screen.getDisplayMatching(win.getBounds());
    const bounds = win.getBounds();
    if (bounds.width >= display.bounds.width && bounds.height >= display.bounds.height) return;
    fs.writeFileSync(MEDIA_BOUNDS_FILE, JSON.stringify(bounds), 'utf8');
  } catch { }
}

function initOrGetMediaWindow(initialPayload?: any): BrowserWindow {
  if (initialPayload) {
    currentMediaPayloadCache = initialPayload;
  }

  if (mediaWindow && !mediaWindow.isDestroyed()) {
    return mediaWindow;
  }

  const icon = loadNativeAppIcon();
  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  mediaWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 480,
    minHeight: 360,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    titleBarStyle: 'hidden',
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
    title: 'Orbita Media',
    show: false,
    icon: icon && !icon.isEmpty() ? icon : undefined,
  });

  Menu.setApplicationMenu(null);
  if (screenProtectionSetting) {
    mediaWindow.setContentProtection(true);
  }

  mediaWindow.on('resize', () => {
    if (mediaWindow && !mediaWindow.isDestroyed()) {
      saveMediaWindowBounds(mediaWindow);
      const display = screen.getDisplayMatching(mediaWindow.getBounds());
      const bounds = mediaWindow.getBounds();
      const isFull = bounds.width >= display.bounds.width && bounds.height >= display.bounds.height;
      mediaWindow.webContents.send('window:state-changed', isFull || mediaWindow.isMaximized());
    }
  });

  mediaWindow.on('move', () => {
    if (mediaWindow && !mediaWindow.isDestroyed()) {
      saveMediaWindowBounds(mediaWindow);
    }
  });

  mediaWindow.on('maximize', () => {
    if (mediaWindow && !mediaWindow.isDestroyed()) {
      mediaWindow.webContents.send('window:state-changed', true);
    }
  });

  mediaWindow.on('unmaximize', () => {
    if (mediaWindow && !mediaWindow.isDestroyed()) {
      mediaWindow.webContents.send('window:state-changed', false);
    }
  });

  mediaWindow.on('closed', () => {
    mediaWindow = null;
    if (!isQuitting) {
      initMediaWindowPrewarm();
    }
  });

  if (isPackaged) {
    mediaWindow.loadFile(path.join(__dirname, '../dist/media.html'));
  } else {
    mediaWindow.loadURL('http://127.0.0.1:5173/media.html');
  }

  return mediaWindow;
}

function initMediaWindowPrewarm() {
  setTimeout(() => {
    try {
      if (!isQuitting && (!mediaWindow || mediaWindow.isDestroyed())) {
        initOrGetMediaWindow();
      }
    } catch { }
  }, 100);
}

function createOrShowMediaWindow(initialPayload?: any): BrowserWindow {
  if (initialPayload) {
    currentMediaPayloadCache = initialPayload;
  }

  const win = initOrGetMediaWindow(initialPayload);

  const display = mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();

  if (win.isMinimized()) win.restore();
  const cur = win.getBounds();
  if (cur.x !== display.bounds.x || cur.y !== display.bounds.y || cur.width !== display.bounds.width || cur.height !== display.bounds.height) {
    win.setBounds(display.bounds);
  }

  if (currentMediaPayloadCache && !win.isDestroyed()) {
    win.webContents.send('orbita:media-payload', currentMediaPayloadCache);
  }

  if (!win.isVisible()) {
    win.show();
  }
  win.focus();

  if (currentMediaPayloadCache && !win.isDestroyed() && win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (currentMediaPayloadCache && !win.isDestroyed()) {
        win.webContents.send('orbita:media-payload', currentMediaPayloadCache);
      }
    });
  }

  return win;
}

function closeAndPrewarmMediaWindow() {
  if (mediaWindow && !mediaWindow.isDestroyed()) {
    currentMediaPayloadCache = null;
    const oldWin = mediaWindow;
    mediaWindow = null;
    try {
      oldWin.hide();
    } catch { }
    setTimeout(() => {
      try {
        if (!oldWin.isDestroyed()) {
          oldWin.destroy();
        }
      } catch { }
    }, 50);
  }
}

ipcMain.handle('orbita:open-media-window', (_event, payload?: any) => {
  createOrShowMediaWindow(payload);
  return { success: true };
});

ipcMain.handle('orbita:close-media-window', () => {
  closeAndPrewarmMediaWindow();
  return { success: true };
});

ipcMain.handle('orbita:get-media-payload', () => {
  return currentMediaPayloadCache;
});

ipcMain.on('orbita:send-media-action', (_event, action: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbita:media-action', action);
  }
});

ipcMain.handle('orbita:get-desktop-sources', async (_event, opts?: { types?: Array<'screen' | 'window'>; thumbnailWidth?: number; thumbnailHeight?: number; fetchWindowIcons?: boolean }) => {
  const sources = await desktopCapturer.getSources({
    types: opts?.types || ['screen', 'window'],
    thumbnailSize: {
      width: opts?.thumbnailWidth || 360,
      height: opts?.thumbnailHeight || 202,
    },
    fetchWindowIcons: opts?.fetchWindowIcons !== false,
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    display_id: s.display_id,
  }));
});

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (mediaWindow && win === mediaWindow) {
      const display = screen.getDisplayMatching(win.getBounds());
      const bounds = win.getBounds();
      const isFull = bounds.width >= display.bounds.width && bounds.height >= display.bounds.height;

      if (win.isMaximized() || isFull) {
        if (win.isMaximized()) win.unmaximize();
        const saved = getSavedMediaWindowBounds();
        const restoredW = Math.min(saved.width, display.workArea.width - 40);
        const restoredH = Math.min(saved.height, display.workArea.height - 40);
        const restoredX = display.workArea.x + Math.round((display.workArea.width - restoredW) / 2);
        const restoredY = display.workArea.y + Math.round((display.workArea.height - restoredH) / 2);
        win.setBounds({ x: restoredX, y: restoredY, width: restoredW, height: restoredH });
        win.webContents.send('window:state-changed', false);
      } else {
        win.setBounds(display.bounds);
        win.webContents.send('window:state-changed', true);
      }
    } else {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  }
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (callWindow && win === callWindow) {
      const state = currentCallStateCache?.callState;
      const isCallActive = state === 'ringing' || state === 'connecting' || state === 'connected' || !!currentCallStateCache?.incomingCall;
      if (isCallActive) {
        win.minimize();
      } else {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('orbita:call-action', { type: 'cancelCall' });
        }
        currentCallStateCache = null;
        callWindow.webContents.send('orbita:call-state', null);
        callWindow.hide();
      }
    } else if (mediaWindow && win === mediaWindow) {
      closeAndPrewarmMediaWindow();
    } else if (win === mainWindow) {
      if (showInTraySetting) {
        mainWindow.hide();
      } else {
        app.quit();
      }
    } else {
      win.close();
    }
  }
});

ipcMain.handle('window:isMaximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || win.isDestroyed()) return false;
  if (mediaWindow && win === mediaWindow) {
    const display = screen.getDisplayMatching(win.getBounds());
    const bounds = win.getBounds();
    return win.isMaximized() || (bounds.width >= display.bounds.width && bounds.height >= display.bounds.height);
  }
  return win.isMaximized();
});

ipcMain.handle('window:isFullScreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  return win && !win.isDestroyed() ? win.isFullScreen() : false;
});

ipcMain.handle('window:setFullScreen', (event, flag?: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (typeof flag === 'boolean') win.setFullScreen(flag);
    else win.setFullScreen(!win.isFullScreen());
  }
});

ipcMain.on('window:double-click', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

// -----------------------------------------------------------------------------
// 9. Sync Server
// -----------------------------------------------------------------------------
let syncServer: http.Server | null = null;
const syncPort = Number(SYNC_SERVER_PORT) || 49832;
let syncServerUrl = '';

function getLocalIp(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const list = nets[name];
    if (list) {
      for (const net of list) {
        if (net.family === 'IPv4' && !net.internal && net.address !== '127.0.0.1') {
          return net.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

function startSyncServer(): Promise<{ url: string; port: number }> {
  return new Promise((resolve, reject) => {
    if (syncServer) stopSyncServer();
    const localIp = getLocalIp();

    syncServer = http.createServer((req, res) => {
      if (req.url === '/sync' || req.url === '/') {
        const page = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ОРБИТА — Синхронизация</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0D0B14; color: #ffffff;
      font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 20px;
    }
    .card {
      background: #161224; border: 1px solid rgba(93,63,211,0.3);
      border-radius: 24px; padding: 48px 40px; max-width: 520px;
      width: 100%; text-align: center; box-shadow: 0 16px 64px rgba(0,0,0,0.6);
    }
    h1 {
      font-size: 28px; font-weight: 800; letter-spacing: 0.06em;
      background: linear-gradient(135deg, #5D3FD3, #7C5CF0);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    p { font-size: 16px; color: #b0a8c8; line-height: 1.6; margin-bottom: 8px; }
    .status-badge {
      display: inline-block; background: rgba(93,63,211,0.2); color: #a88cf0;
      font-size: 13px; font-weight: 600; padding: 6px 18px; border-radius: 999px;
      margin-top: 16px; border: 1px solid rgba(93,63,211,0.25);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Функция в разработке</h1>
    <p>Пожалуйста, ожидайте и следите за новостями!</p>
    <div class="status-badge">● Сервер синхронизации активен</div>
  </div>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(page);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    syncServer.listen(syncPort, '0.0.0.0', () => {
      syncServerUrl = `http://${localIp}:${syncPort}/sync`;
      console.log(`[Sync] Server started at ${syncServerUrl}`);
      resolve({ url: syncServerUrl, port: syncPort });
    });

    syncServer.on('error', (err) => {
      console.error('[Sync] Server error:', err);
      reject(err);
    });
  });
}

function stopSyncServer() {
  if (syncServer) {
    syncServer.close(() => console.log('[Sync] Server stopped'));
    syncServer = null;
    syncServerUrl = '';
  }
}

ipcMain.handle('sync:start-server', async () => await startSyncServer());
ipcMain.handle('sync:stop-server', () => {
  stopSyncServer();
  return { success: true };
});
ipcMain.handle('sync:get-url', () => syncServerUrl);
ipcMain.handle('sync:get-local-ip', () => getLocalIp());

ipcMain.handle('orbita:get-platform', () => process.platform);
ipcMain.handle('orbita:get-app-version', () => require('../package.json').version);
ipcMain.handle('orbita:get-os-info', () => {
  const platform = process.platform;
  const release = os.release();
  let prettyName: string = platform;

  if (platform === 'win32') {
    const parts = release.split('.');
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const build = parseInt(parts[2], 10);
    if (major === 10 && minor === 0) {
      prettyName = build >= 22000 ? 'Windows 11' : 'Windows 10';
    } else if (major === 6 && minor === 3) prettyName = 'Windows 8.1';
    else if (major === 6 && minor === 2) prettyName = 'Windows 8';
    else if (major === 6 && minor === 1) prettyName = 'Windows 7';
    else prettyName = `Windows ${major}.${minor}`;
  } else if (platform === 'darwin') prettyName = 'macOS';
  else if (platform === 'linux') prettyName = 'Linux';

  return { platform, release, prettyName };
});

// -----------------------------------------------------------------------------
// 11. Main Window
// -----------------------------------------------------------------------------
function createMainWindow() {
  loadWindowSettings();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: true,
      devTools: !app.isPackaged,
    },
    title: 'Orbita Desktop',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    icon: loadNativeAppIcon(),
  });

  const icon = loadNativeAppIcon();
  if (icon && !icon.isEmpty()) mainWindow.setIcon(icon);

  Menu.setApplicationMenu(null);
  if (screenProtectionSetting) {
    mainWindow.setContentProtection(true);
  }
  mainWindow.setAutoHideMenuBar(hideMenuBarSetting);
  mainWindow.setMenuBarVisibility(!hideMenuBarSetting);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.webContents.send('window:state-changed', mainWindow.isMaximized());
    initCallWindowPrewarm();
    initMediaWindowPrewarm();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        event.preventDefault();
        if (!app.isPackaged) {
          mainWindow?.webContents.toggleDevTools();
        }
      }
    }
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:state-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:state-changed', false));
  mainWindow.on('focus', () => console.log('[Window] Focused'));
  mainWindow.on('blur', () => console.log('[Window] Blurred'));

  initNotifManager(mainWindow);

  ipcMain.on('notif-window:clicked', (_event, data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      if (data?.chatId) {
        mainWindow.webContents.send('notification:open-chat', data.chatId);
      }
    }
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL() || '';
    if (url !== currentUrl && !url.startsWith('http://127.0.0.1:5173') && !url.startsWith('file://')) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting && showInTraySetting && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let autoDownloadEnabled = true;

function sendUpdaterStatus(payload: {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
  error?: string;
  releaseNotes?: string;
}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('orbita:updateStatus', payload);
  }
}

let latestGitHubRelease: {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
  fileName?: string;
} | null = null;
let downloadedInstallerPath: string | null = null;
let isDownloadingUpdate = false;

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const p2 = v2.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function fetchLatestGitHubRelease(): Promise<{
  hasUpdate: boolean;
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
  fileName?: string;
}> {
  const res = await electronNet.fetch('https://api.github.com/repos/orbitachat/orbita-desktop/releases/latest', {
    headers: {
      'User-Agent': `Orbita-Desktop/${app.getVersion()}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }
  const data: any = await res.json();
  const remoteTag = (data?.tag_name || '').replace(/^v/, '');
  if (!remoteTag) {
    throw new Error('No tag found in release');
  }
  const currentVersion = app.getVersion();
  const exeAsset = Array.isArray(data?.assets)
    ? data.assets.find((a: any) => typeof a?.name === 'string' && a.name.endsWith('.exe'))
    : null;

  latestGitHubRelease = {
    version: remoteTag,
    releaseNotes: typeof data?.body === 'string' ? data.body : undefined,
    downloadUrl: exeAsset?.browser_download_url,
    fileName: exeAsset?.name,
  };

  const hasUpdate = compareVersions(remoteTag, currentVersion) > 0;
  return {
    hasUpdate,
    version: remoteTag,
    releaseNotes: latestGitHubRelease.releaseNotes,
    downloadUrl: latestGitHubRelease.downloadUrl,
    fileName: latestGitHubRelease.fileName,
  };
}

async function downloadUpdateAsset(url: string, fileName: string): Promise<string> {
  const targetDir = app.getPath('temp');
  const targetPath = path.join(targetDir, fileName || 'orbita_update.exe');
  const response = await electronNet.fetch(url, {
    headers: {
      'User-Agent': `Orbita-Desktop/${app.getVersion()}`,
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`);
  }
  const contentLength = Number(response.headers.get('content-length') || '0');
  let receivedBytes = 0;
  let lastTime = Date.now();
  let lastBytes = 0;

  const fileStream = fs.createWriteStream(targetPath);
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      fileStream.write(Buffer.from(value));
      receivedBytes += value.length;
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.5 || receivedBytes === contentLength) {
        const bytesPerSec = elapsed > 0 ? Math.round((receivedBytes - lastBytes) / elapsed) : 0;
        const percent = contentLength > 0 ? Math.round((receivedBytes / contentLength) * 100) : 0;
        sendUpdaterStatus({
          status: 'downloading',
          percent,
          transferred: receivedBytes,
          total: contentLength,
          bytesPerSecond: bytesPerSec,
        });
        lastTime = now;
        lastBytes = receivedBytes;
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return targetPath;
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const startManualDownload = async () => {
    if (isDownloadingUpdate) return;
    if (!latestGitHubRelease?.downloadUrl) {
      sendUpdaterStatus({ status: 'error', error: 'No download URL' });
      return;
    }
    isDownloadingUpdate = true;
    try {
      sendUpdaterStatus({ status: 'downloading', percent: 0 });
      const savedPath = await downloadUpdateAsset(
        latestGitHubRelease.downloadUrl,
        latestGitHubRelease.fileName || `setup_${latestGitHubRelease.version}.exe`
      );
      downloadedInstallerPath = savedPath;
      sendUpdaterStatus({
        status: 'downloaded',
        version: latestGitHubRelease.version,
      });
    } catch (err: any) {
      sendUpdaterStatus({ status: 'error', error: err?.message || String(err) });
    } finally {
      isDownloadingUpdate = false;
    }
  };

  ipcMain.handle('orbita:checkForUpdates', async () => {
    try {
      sendUpdaterStatus({ status: 'checking' });
      const releaseInfo = await fetchLatestGitHubRelease();
      if (releaseInfo.hasUpdate) {
        sendUpdaterStatus({
          status: 'available',
          version: releaseInfo.version,
          releaseNotes: releaseInfo.releaseNotes,
        });
        if (autoDownloadEnabled && app.isPackaged && releaseInfo.downloadUrl) {
          void startManualDownload();
        }
        return { status: 'available', version: releaseInfo.version };
      } else {
        sendUpdaterStatus({
          status: 'not-available',
          version: app.getVersion(),
        });
        return { status: 'not-available', currentVersion: app.getVersion() };
      }
    } catch (err: any) {
      sendUpdaterStatus({ status: 'error', error: err?.message || String(err) });
      return { status: 'error', error: err?.message || String(err) };
    }
  });

  ipcMain.handle('orbita:downloadUpdate', async () => {
    if (!app.isPackaged) {
      sendUpdaterStatus({ status: 'dev-mode' });
      return { status: 'dev-mode' };
    }
    await startManualDownload();
    return { status: 'ok' };
  });

  ipcMain.handle('orbita:quitAndInstallUpdate', () => {
    if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
      spawn(downloadedInstallerPath, [], { detached: true, stdio: 'ignore' }).unref();
      app.quit();
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  ipcMain.handle('orbita:setAutoDownloadUpdates', (_event, enabled: boolean) => {
    autoDownloadEnabled = enabled;
    return true;
  });

  ipcMain.handle('orbita:getAppVersion', () => {
    return app.getVersion();
  });

  if (app.isPackaged) {
    setTimeout(() => {
      fetchLatestGitHubRelease()
        .then((info) => {
          if (info.hasUpdate) {
            sendUpdaterStatus({
              status: 'available',
              version: info.version,
              releaseNotes: info.releaseNotes,
            });
            if (autoDownloadEnabled && info.downloadUrl) {
              void startManualDownload();
            }
          }
        })
        .catch(() => {});
    }, 7000);
  }
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('orbita', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('orbita');
  }

  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();

      const deepLink = commandLine.find((arg) => arg.startsWith('orbita://'));
      if (deepLink) {
        mainWindow.webContents.send('deep-link', deepLink);
      }
    }
  });

  app.on('open-url', (_event, url) => {
    if (mainWindow && url.startsWith('orbita://')) {
      mainWindow.webContents.send('deep-link', url);
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, _permission) => {
    return true;
  });

  if (app.configureHostResolver) {
    app.configureHostResolver({
      enableBuiltInResolver: true,
      secureDnsMode: 'automatic',
      secureDnsServers: [
        'https://dns.google/dns-query',
        'https://dns.adguard-dns.com/dns-query',
        'https://dns.yandex.ru/dns-query',
        'https://dns.quad9.net/dns-query',
        'https://cloudflare-dns.com/dns-query',
      ],
    });
  }

  getMasterKey();
  registerOrbitaMediaProtocol();
  registerMediaIpcHandlers();
  registerDownloadsIpcHandlers();
  await initStorageDb();
  registerStorageIpcHandlers();

  try {
    const flag = await getKvValue('migrated_from_localstorage');
    if (!flag) console.log('[Storage] Migration flag not set, will be performed by renderer');
  } catch (e) {
    console.error('[Storage] Error checking migration flag:', e);
  }

  createMainWindow();
  setupTray();
  setupAutoUpdater();

  setInterval(() => {
    if (global.gc) {
      try {
        global.gc();
      } catch { }
    }
  }, 15000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.destroy();
    callWindow = null;
  }
  if (mediaWindow && !mediaWindow.isDestroyed()) {
    mediaWindow.destroy();
    mediaWindow = null;
  }
  destroyTray();
});

app.on('will-quit', () => {
  stopSyncServer();
  closeStorageDb().catch((e) => console.error('[Storage] Error closing DB:', e));
});

ipcMain.on('orbita:show-custom-notification', (_event, payload: any) => {
  console.log('[NotifManager] show:', payload.title);
  const colors = {
    accent: payload.colors?.accent || currentThemeVars['--accent-color'] || '#9b7dd4',
    accentLight: payload.colors?.accentLight || currentThemeVars['--accent-light'] || '#b89fee',
    bg: payload.colors?.bg || currentThemeVars['--bg-secondary'] || currentThemeVars['--surface-container'] || '#1b1727',
    text: payload.colors?.text || currentThemeVars['--text-main'] || '#ffffff',
    textDim: payload.colors?.textDim || currentThemeVars['--text-dim'] || '#9f96b3',
    border: currentThemeVars['--border-color'] || 'transparent',
  };
  const iconData = getNotificationIconBase64(currentNotifIconName);
  showCustomNotification({
    title: payload.title,
    body: payload.body,
    chatId: payload.chatId,
    settings: {
      position: payload.position || 'bottom-right',
      theme: payload.theme || 'dark',
      hideContent: payload.hideContent || false,
      maxCount: payload.maxCount || 3,
      soundEnabled: payload.soundEnabled ?? true,
      volume: payload.volume ?? 100,
      flashTaskbar: payload.flashTaskbar ?? true,
    },
    colors,
    fontFamily: payload.fontFamily,
    iconData,
    avatarUrl: payload.avatarUrl,
  });
});

// ==========================================
// Proxy & Connection Manager (SOCKS5 / Network)
// ==========================================
let activeProxyCredentials: { username?: string; password?: string } | null = null;

// Handle proxy authentication (SOCKS5 / HTTP credentials)
app.on('login', (event, _webContents, _request, authInfo, callback) => {
  if (authInfo.isProxy && activeProxyCredentials?.username) {
    event.preventDefault();
    callback(activeProxyCredentials.username, activeProxyCredentials.password || '');
  }
});

// Set active proxy in Electron session
ipcMain.handle('orbita:setProxy', async (_event, config: { host: string; port: number; username?: string; password?: string; type?: string; proxyCalls?: boolean }) => {
  try {
    activeProxyCredentials = {
      username: config.username?.trim() || undefined,
      password: config.password || undefined,
    };
    const proxyProtocol = (config.type || 'socks5').toLowerCase() === 'http' ? 'http' : 'socks5';
    const proxyRules = `${proxyProtocol}://${config.host.trim()}:${config.port}`;

    // When proxyCalls is false, bypass WebRTC signaling & media servers so calls connect directly
    const proxyBypassRules = config.proxyCalls === false
      ? '<local>;*.livekit.cloud;*.turn.livekit.cloud;orbita.ypgreg78.workers.dev'
      : '<local>';

    await session.defaultSession.setProxy({
      proxyRules,
      proxyBypassRules,
    });
    console.log(`[Proxy] Applied proxy rules: ${proxyRules}, bypass: ${proxyBypassRules}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Proxy] Failed to set proxy:', err);
    return { success: false, error: err?.message || 'Failed to set proxy' };
  }
});

// Clear proxy (restore direct connection)
ipcMain.handle('orbita:clearProxy', async () => {
  try {
    activeProxyCredentials = null;
    await session.defaultSession.setProxy({
      proxyRules: '',
      proxyBypassRules: '',
    });
    console.log('[Proxy] Restored direct connection');
    return { success: true };
  } catch (err: any) {
    console.error('[Proxy] Failed to clear proxy:', err);
    return { success: false, error: err?.message || 'Failed to clear proxy' };
  }
});

// Kill Switch Isolation (blocks all traffic when proxy drops)
ipcMain.handle('orbita:setKillSwitchIsolation', async (_event, isolate: boolean) => {
  try {
    if (isolate) {
      // Route all traffic into blackhole
      await session.defaultSession.setProxy({
        proxyRules: 'http://127.0.0.1:0',
        proxyBypassRules: '',
      });
      console.log('[Proxy] Kill switch active: network traffic isolated');
    }
    return { success: true };
  } catch (err: any) {
    console.error('[Proxy] Kill switch error:', err);
    return { success: false, error: err?.message };
  }
});

ipcMain.handle('orbita:checkProxyPing', async (_event, host: string, port: number, timeoutMs = 4500) => {
  return new Promise<{ success: boolean; ping?: number; error?: string }>((resolve) => {
    let resolved = false;
    const cleanHost = (host || '').trim();
    const startTime = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const finish = (result: { success: boolean; ping?: number; error?: string }) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.on('timeout', () => finish({ success: false, error: 'Таймаут' }));
    socket.on('error', (err) => finish({ success: false, error: err.message || 'Ошибка соединения' }));

    socket.connect(port, cleanHost, () => {
      let stage = 'socks5_greeting';
      socket.write(Buffer.from([0x05, 0x01, 0x00]));

      socket.on('data', (data) => {
        if (stage === 'socks5_greeting') {
          if (data.length >= 2 && data[0] === 0x05) {
            if (data[1] === 0x00) {
              stage = 'socks5_connect';
              socket.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 1, 1, 1, 1, 0x00, 0x50]));
              return;
            } else if (data[1] === 0x02) {
              const ping = Date.now() - startTime;
              finish({ success: true, ping: Math.max(15, ping) });
              return;
            }
          }
          stage = 'http_connect';
          socket.write(Buffer.from('CONNECT 1.1.1.1:80 HTTP/1.1\r\nHost: 1.1.1.1:80\r\nProxy-Connection: Keep-Alive\r\n\r\n'));
        } else if (stage === 'socks5_connect') {
          if (data.length >= 2 && data[0] === 0x05 && data[1] === 0x00) {
            const ping = Date.now() - startTime;
            finish({ success: true, ping: Math.max(10, ping) });
          } else {
            const isLocal = cleanHost === '127.0.0.1' || cleanHost === 'localhost';
            if (isLocal) {
              finish({ success: false, error: 'Локальный прокси не смог подключиться к интернету' });
            } else {
              finish({ success: true, ping: Math.max(15, Date.now() - startTime) });
            }
          }
        } else if (stage === 'http_connect') {
          const text = data.toString();
          if (text.includes('200')) {
            const ping = Date.now() - startTime;
            finish({ success: true, ping: Math.max(10, ping) });
          } else {
            const isLocal = cleanHost === '127.0.0.1' || cleanHost === 'localhost';
            if (isLocal) {
              finish({ success: false, error: 'HTTP прокси не ответил 200' });
            } else {
              finish({ success: true, ping: Math.max(15, Date.now() - startTime) });
            }
          }
        }
      });
    });
  });
});

