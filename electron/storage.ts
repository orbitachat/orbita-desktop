// electron/storage.ts
import { app, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Database } from 'sqlite3';
import { getLocalKey } from './localKey';
import { encryptLocal, decryptLocal } from './mediaCache';

const DB_FILE = 'orbita.db';
const KV_TABLE = 'kv_store';
const MESSAGES_TABLE = 'messages';

let db: Database | null = null;

function getDbPath(): string {
  return path.join(app.getPath('userData'), DB_FILE);
}

export function initStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const dbPath = getDbPath();
    db = new Database(dbPath);

    db.serialize(() => {
      db!.run(`
        CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      db!.run(`
        CREATE TABLE IF NOT EXISTS ${MESSAGES_TABLE} (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          message_data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);

      db!.run(`
        CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON ${MESSAGES_TABLE}(chat_id)
      `);

      db!.run(`
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON ${MESSAGES_TABLE}(created_at)
      `);

      resolve();
    });
  });
}

export function closeStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        db = null;
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }
  });
}

function getDb(): Database {
  if (!db) throw new Error('Storage not initialized');
  return db;
}

export function storageGet(key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    getDb().get(`SELECT value FROM ${KV_TABLE} WHERE key = ?`, [key], (err, row: any) => {
      if (err) reject(err);
      else {
        if (row) {
          const encrypted = row.value;
          const decrypted = decryptLocal(Buffer.from(encrypted, 'base64'));
          if (!decrypted) resolve(null);
          else resolve(decrypted.toString('utf8'));
        } else {
          resolve(null);
        }
      }
    });
  });
}

export function storageSet(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const encrypted = encryptLocal(Buffer.from(value, 'utf8'));
    const base64 = encrypted.toString('base64');
    getDb().run(
      `INSERT OR REPLACE INTO ${KV_TABLE} (key, value) VALUES (?, ?)`,
      [key, base64],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function storageRemove(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${KV_TABLE} WHERE key = ?`, [key], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function storageGetMessages(chatId: string, limit?: number, offset?: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    let sql = `SELECT id, message_data FROM ${MESSAGES_TABLE} WHERE chat_id = ? ORDER BY created_at ASC`;
    const params: any[] = [chatId];
    if (limit !== undefined) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }
    if (offset !== undefined) {
      sql += ` OFFSET ?`;
      params.push(offset);
    }
    getDb().all(sql, params, (err, rows: any[]) => {
      if (err) reject(err);
      else {
        const results = rows.map(row => {
          const decrypted = decryptLocal(Buffer.from(row.message_data, 'base64'));
          if (!decrypted) return null;
          try {
            return JSON.parse(decrypted.toString('utf8'));
          } catch {
            return null;
          }
        }).filter(r => r !== null);
        resolve(results);
      }
    });
  });
}

export function storageAddMessage(chatId: string, messageId: string, messageData: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const serialized = JSON.stringify(messageData);
    const encrypted = encryptLocal(Buffer.from(serialized, 'utf8'));
    const base64 = encrypted.toString('base64');
    const now = Date.now();
    getDb().run(
      `INSERT OR REPLACE INTO ${MESSAGES_TABLE} (id, chat_id, message_data, created_at) VALUES (?, ?, ?, ?)`,
      [messageId, chatId, base64, now],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export function storageDeleteMessages(chatId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${MESSAGES_TABLE} WHERE chat_id = ?`, [chatId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function storageDeleteMessage(messageId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM ${MESSAGES_TABLE} WHERE id = ?`, [messageId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function migrateFromLocalStorage(): Promise<void> {
  // Для каждого ключа, который может быть в localStorage, переносим в SQLite
  const keysToMigrate = [
    'orbita-auth-storage',
    'orbita-chat-storage',
  ];

  for (const key of keysToMigrate) {
    const data = localStorage.getItem(key);
    if (data) {
      await storageSet(key, data);
      localStorage.removeItem(key);
    }
  }

  // Дополнительно можно перенести другие ключи (например, настройки, если они не в сторах)
}

export function setupStorageIPC(): void {
  ipcMain.handle('storage:get', async (_, key: string) => {
    return await storageGet(key);
  });

  ipcMain.handle('storage:set', async (_, key: string, value: string) => {
    await storageSet(key, value);
  });

  ipcMain.handle('storage:remove', async (_, key: string) => {
    await storageRemove(key);
  });

  ipcMain.handle('storage:migrate', async () => {
    await migrateFromLocalStorage();
    return { success: true };
  });

  ipcMain.handle('storage:get-messages', async (_, chatId: string, limit?: number, offset?: number) => {
    return await storageGetMessages(chatId, limit, offset);
  });

  ipcMain.handle('storage:add-message', async (_, chatId: string, messageId: string, messageData: any) => {
    await storageAddMessage(chatId, messageId, messageData);
  });

  ipcMain.handle('storage:delete-messages', async (_, chatId: string) => {
    await storageDeleteMessages(chatId);
  });

  ipcMain.handle('storage:delete-message', async (_, messageId: string) => {
    await storageDeleteMessage(messageId);
  });
}