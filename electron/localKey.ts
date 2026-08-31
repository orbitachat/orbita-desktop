// electron/localKey.ts
import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

const KEY_FILE = 'local_key.enc';
let localKey: Buffer | null = null;

export function getLocalKey(): Buffer {
  if (localKey) return localKey;
  const userDataPath = app.getPath('userData');
  const keyPath = path.join(userDataPath, KEY_FILE);

  if (fs.existsSync(keyPath)) {
    const encrypted = fs.readFileSync(keyPath);
    const decrypted = safeStorage.decryptString(encrypted);
    localKey = Buffer.from(decrypted, 'hex');
    return localKey;
  }

  const newKey = randomBytes(32);
  const encrypted = safeStorage.encryptString(newKey.toString('hex'));
  fs.writeFileSync(keyPath, encrypted);
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