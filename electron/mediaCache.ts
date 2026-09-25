// electron/mediaCache.ts
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { getLocalKey } from './localKey';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const CACHE_DIR = 'media';
const DB_FILE = 'media_cache.db';
const MAX_CACHE_SIZE = 1024 * 1024 * 1024;

let db: Database | null = null;

function getCachePath(): string {
  return path.join(app.getPath('userData'), CACHE_DIR);
}

async function initDB(): Promise<Database> {
  if (db) return db;
  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }
  const dbPath = path.join(cachePath, DB_FILE);
  db = new Database(dbPath);

  return new Promise<Database>((resolve, reject) => {
    db!.serialize(() => {
      db!.run('PRAGMA journal_mode = WAL');
      db!.run('PRAGMA synchronous = NORMAL');
      db!.run(`
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
      `, (err) => {
        if (err) reject(err);
        else {
          db!.run(`
            CREATE INDEX IF NOT EXISTS idx_last_accessed ON media_cache(last_accessed);
            CREATE INDEX IF NOT EXISTS idx_cache_key ON media_cache(cache_key);
            CREATE INDEX IF NOT EXISTS idx_mime_type ON media_cache(mime_type);
            CREATE INDEX IF NOT EXISTS idx_chat_id ON media_cache(chat_id);
          `, (err2) => {
            if (err2) reject(err2);
            else {
              db!.all("PRAGMA table_info(media_cache)", (err, rows: any[]) => {
              if (err) reject(err);
              else {
                const columnNames = rows.map(r => r.name);
                const alterStatements: string[] = [];
                if (!columnNames.includes('chat_id')) {
                  alterStatements.push('ALTER TABLE media_cache ADD COLUMN chat_id TEXT');
                }
                if (!columnNames.includes('message_id')) {
                  alterStatements.push('ALTER TABLE media_cache ADD COLUMN message_id TEXT');
                }
                let idx = 0;
                const runNext = () => {
                  if (idx >= alterStatements.length) {
                    resolve(db!);
                    return;
                  }
                  db!.run(alterStatements[idx++], (err3) => {
                    if (err3) reject(err3);
                    else runNext();
                  });
                };
                runNext();
              }
            });
          });
        }
      });
    });
  });
}

async function getTotalCacheSize(): Promise<number> {
  const db = await initDB();
  return new Promise<number>((resolve, reject) => {
    db.get('SELECT SUM(file_size) as total FROM media_cache WHERE download_status = "downloaded"', (err, row: any) => {
      if (err) reject(err);
      else resolve(row?.total || 0);
    });
  });
}

async function evictIfNeeded(additionalSize: number): Promise<void> {
  const db = await initDB();
  let total = await getTotalCacheSize() + additionalSize;
  while (total > MAX_CACHE_SIZE) {
    const row = await new Promise<any>((resolve, reject) => {
      db.get('SELECT id, local_path, file_size FROM media_cache WHERE download_status = "downloaded" ORDER BY last_accessed ASC LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!row) break;
    try {
      fs.unlinkSync(row.local_path);
    } catch (_) {}
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE id = ?', row.id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    total -= row.file_size;
  }
}

function generateLocalFilename(): string {
  return randomBytes(8).toString('hex') + '.dat';
}

export function encryptLocal(data: Buffer): Buffer {
  const key = getLocalKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]);
}

export function decryptLocal(encryptedData: Buffer): Buffer | null {
  const key = getLocalKey();
  if (encryptedData.length < 12 + 16) return null;
  const iv = encryptedData.subarray(0, 12);
  const tag = encryptedData.subarray(encryptedData.length - 16);
  const ciphertext = encryptedData.subarray(12, encryptedData.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (_) {
    return null;
  }
}

export async function saveMediaToCache(originalUrl: string, data: Buffer, mimeType: string, chatId: string, messageId: string): Promise<string | null> {
  const cachePath = getCachePath();
  const localFilename = generateLocalFilename();
  const localPath = path.join(cachePath, localFilename);

  const encrypted = encryptLocal(data);
  fs.writeFileSync(localPath, encrypted);
  const size = encrypted.length;

  const db = await initDB();
  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO media_cache
      (cache_key, local_path, original_url, mime_type, file_size, created_at, last_accessed, download_status, chat_id, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'downloaded', ?, ?)`,
      [originalUrl, localPath, originalUrl, mimeType, size, Date.now(), Date.now(), chatId, messageId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  await evictIfNeeded(size);

  return localPath;
}

export async function getMediaFromCache(originalUrl: string): Promise<{ data: Buffer | null; mime: string | null }> {
  const db = await initDB();
  const row = await new Promise<any>((resolve, reject) => {
    db.get('SELECT local_path, mime_type FROM media_cache WHERE cache_key = ? AND download_status = "downloaded"', originalUrl, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  if (!row) return { data: null, mime: null };

  const filePath = row.local_path;
  if (!fs.existsSync(filePath)) {
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE cache_key = ?', originalUrl, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return { data: null, mime: null };
  }

  const encrypted = fs.readFileSync(filePath);
  const decrypted = decryptLocal(encrypted);
  if (!decrypted) return { data: null, mime: null };

  await new Promise<void>((resolve, reject) => {
    db.run('UPDATE media_cache SET last_accessed = ? WHERE cache_key = ?', [Date.now(), originalUrl], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return { data: decrypted, mime: row.mime_type };
}

export async function getMediaBatch(urls: string[]): Promise<Array<{ url: string; data: string | null; mime: string | null }>> {
  const results = [];
  for (const url of urls) {
    const res = await getMediaFromCache(url);
    results.push({
      url,
      data: res.data ? res.data.toString('base64') : null,
      mime: res.mime
    });
  }
  return results;
}

export async function deleteMediaByChatId(chatId: string): Promise<number> {
  const db = await initDB();
  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all('SELECT local_path FROM media_cache WHERE chat_id = ?', chatId, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  for (const row of rows) {
    try {
      fs.unlinkSync(row.local_path);
    } catch (_) {}
  }
  const deletedCount = await new Promise<number>((resolve, reject) => {
    db.run('DELETE FROM media_cache WHERE chat_id = ?', chatId, function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
  return deletedCount;
}

export async function clearMediaCache(): Promise<number> {
  const db = await initDB();
  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all('SELECT local_path FROM media_cache', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  for (const row of rows) {
    try {
      fs.unlinkSync(row.local_path);
    } catch (_) {}
  }
  const deletedCount = await new Promise<number>((resolve, reject) => {
    db.run('DELETE FROM media_cache', function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
  return deletedCount;
}

export async function getCacheStats(): Promise<{ count: number; totalSize: number }> {
  const db = await initDB();
  const countRow = await new Promise<any>((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM media_cache', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  const sizeRow = await new Promise<any>((resolve, reject) => {
    db.get('SELECT SUM(file_size) as total FROM media_cache', (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  return { count: countRow?.count || 0, totalSize: sizeRow?.total || 0 };
}

export async function evictByAge(ageMs: number): Promise<number> {
  const db = await initDB();
  const threshold = Date.now() - ageMs;
  const rows = await new Promise<any[]>((resolve, reject) => {
    db.all('SELECT id, local_path FROM media_cache WHERE download_status = "downloaded" AND last_accessed < ?', threshold, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
  let deleted = 0;
  for (const row of rows) {
    try {
      fs.unlinkSync(row.local_path);
    } catch (_) {}
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

export async function evictBySize(targetSize: number): Promise<number> {
  const db = await initDB();
  let total = await getTotalCacheSize();
  let deleted = 0;
  while (total > targetSize) {
    const row = await new Promise<any>((resolve, reject) => {
      db.get('SELECT id, local_path, file_size FROM media_cache WHERE download_status = "downloaded" ORDER BY last_accessed ASC LIMIT 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    if (!row) break;
    try {
      fs.unlinkSync(row.local_path);
    } catch (_) {}
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM media_cache WHERE id = ?', row.id, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    total -= row.file_size;
    deleted++;
  }
  return deleted;
}

export async function setupMediaCacheIPC(): Promise<void> {
  await initDB();

  try { ipcMain.removeHandler('media:exists'); } catch {}
  try { ipcMain.removeHandler('media:get'); } catch {}
  try { ipcMain.removeHandler('media:save'); } catch {}
  try { ipcMain.removeHandler('media:clear'); } catch {}
  try { ipcMain.removeHandler('media:stats'); } catch {}
  try { ipcMain.removeHandler('media:evict'); } catch {}
  try { ipcMain.removeHandler('media:evict-by-age'); } catch {}
  try { ipcMain.removeHandler('media:evict-by-size'); } catch {}
  try { ipcMain.removeHandler('media:detailed-stats'); } catch {}
  try { ipcMain.removeHandler('media:set-limit'); } catch {}
  try { ipcMain.removeHandler('media:get-batch'); } catch {}
  try { ipcMain.removeHandler('media:delete-by-chat'); } catch {}

  ipcMain.handle('media:exists', async (_, originalUrl: string) => {
    const db = await initDB();
    return new Promise<boolean>((resolve, reject) => {
      db.get('SELECT 1 FROM media_cache WHERE cache_key = ? AND download_status = "downloaded"', originalUrl, (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      });
    });
  });

  ipcMain.handle('media:get', async (_, originalUrl: string) => {
    const result = await getMediaFromCache(originalUrl);
    if (result.data) {
      return {
        data: result.data,
        mime: result.mime,
      };
    }
    return null;
  });

  ipcMain.handle('media:get-batch', async (_, requests: Array<{ url: string; sharedSecret: string; fileName?: string }>) => {
    const results = [];
    for (const req of requests) {
      const res = await getMediaFromCache(req.url);
      results.push({
        url: req.url,
        data: res.data ? res.data.toString('base64') : null,
        mime: res.mime
      });
    }
    return results;
  });

  ipcMain.handle('media:save', async (_, originalUrl: string, dataBase64: string, mimeType: string, chatId: string, messageId: string) => {
    const data = Buffer.from(dataBase64, 'base64');
    const localPath = await saveMediaToCache(originalUrl, data, mimeType, chatId, messageId);
    return !!localPath;
  });

  ipcMain.handle('media:clear', async () => {
    const deleted = await clearMediaCache();
    return { deleted };
  });

  ipcMain.handle('media:stats', async () => {
    return await getCacheStats();
  });

  ipcMain.handle('media:evict', async (_, sizeBytes?: number) => {
    const target = sizeBytes || MAX_CACHE_SIZE;
    const deleted = await evictBySize(target);
    return { deleted };
  });

  ipcMain.handle('media:evict-by-age', async (_, ageMs: number) => {
    const deleted = await evictByAge(ageMs);
    return { deleted };
  });

  ipcMain.handle('media:evict-by-size', async (_, targetSize: number) => {
    const deleted = await evictBySize(targetSize);
    return { deleted };
  });

  ipcMain.handle('media:detailed-stats', async () => {
    const db = await initDB();
    const rows = await new Promise<any[]>((resolve, reject) => {
      db.all(
        'SELECT mime_type, COUNT(*) as count, SUM(file_size) as size FROM media_cache WHERE download_status = "downloaded" GROUP BY mime_type',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
    const totalSize = rows.reduce((sum, r) => sum + r.size, 0);
    const byType: Record<string, { count: number; size: number }> = {};
    for (const row of rows) {
      byType[row.mime_type || 'application/octet-stream'] = {
        count: row.count,
        size: row.size,
      };
    }
    return { totalCount, totalSize, byType };
  });

  ipcMain.handle('media:set-limit', async (_, { type, size }: { type: 'total' | 'media'; size: number }) => {
    const currentSize = await getTotalCacheSize();
    if (currentSize > size) {
      const deleted = await evictBySize(size);
      return { deleted };
    }
    return { deleted: 0 };
  });

  ipcMain.handle('media:delete-by-chat', async (_, chatId: string) => {
    const deleted = await deleteMediaByChatId(chatId);
    return { deleted };
  });
}