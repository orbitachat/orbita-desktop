// electron/localKey.ts
import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

const KEY_FILE = 'local_key.enc';
const KEY_BACKUP = 'local_key.bak';
let localKey: Buffer | null = null;

export function getLocalKey(): Buffer {
  if (localKey) return localKey;
  const userDataPath = app.getPath('userData');
  const keyPath = path.join(userDataPath, KEY_FILE);
  const backupPath = path.join(userDataPath, KEY_BACKUP);

  if (fs.existsSync(keyPath)) {
    try {
      const encrypted = fs.readFileSync(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encrypted);
        localKey = Buffer.from(decrypted, 'hex');
        if (!fs.existsSync(backupPath)) {
          try { fs.writeFileSync(backupPath, encrypted); } catch {}
        }
        return localKey;
      }
    } catch {}
  }

  if (fs.existsSync(backupPath)) {
    try {
      const encrypted = fs.readFileSync(backupPath);
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(encrypted);
        localKey = Buffer.from(decrypted, 'hex');
        return localKey;
      }
    } catch {}
  }

  const newKey = randomBytes(32);
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(newKey.toString('hex'));
      fs.writeFileSync(keyPath, encrypted);
      fs.writeFileSync(backupPath, encrypted);
    } else {
      fs.writeFileSync(keyPath, newKey);
      fs.writeFileSync(backupPath, newKey);
    }
  } catch {}
  localKey = newKey;
  return localKey;
}

export function clearLocalKey(): void {
  const userDataPath = app.getPath('userData');
  const keyPath = path.join(userDataPath, KEY_FILE);
  if (fs.existsSync(keyPath)) {
    fs.unlinkSync(keyPath);
  }
  localKey = null;
}