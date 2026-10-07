import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';

const KEY_FILE = 'local_key.enc';
const KEY_BACKUP = 'local_key.bak';
const PIN_KEY_FILE = 'local_key_pin.enc';

let localKey: Buffer | null = null;

function getPinFilePath(): string {
  return path.join(app.getPath('userData'), PIN_KEY_FILE);
}

function getKeyFilePath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

function getBackupFilePath(): string {
  return path.join(app.getPath('userData'), KEY_BACKUP);
}

export function isPinSet(): boolean {
  return fs.existsSync(getPinFilePath());
}

export function isPinLocked(): boolean {
  return isPinSet() && localKey === null;
}

export function unlockWithPin(pin: string): boolean {
  const pinPath = getPinFilePath();
  if (!fs.existsSync(pinPath)) return false;

  try {
    const raw = fs.readFileSync(pinPath, 'utf8');
    const parsed = JSON.parse(raw);
    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');
    const tag = Buffer.from(parsed.tag, 'hex');
    const cipherText = Buffer.from(parsed.data, 'hex');

    const derivedKey = pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);

    if (decrypted.length === 32) {
      localKey = decrypted;
      return true;
    }
  } catch {}

  return false;
}

export function setupPin(pin: string): boolean {
  try {
    let keyToProtect = localKey;
    if (!keyToProtect) {
      keyToProtect = getLocalKey();
    }
    if (!keyToProtect) {
      keyToProtect = randomBytes(32);
      localKey = keyToProtect;
    }

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const derivedKey = pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(keyToProtect), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = JSON.stringify({
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    });

    fs.writeFileSync(getPinFilePath(), payload, 'utf8');

    const keyPath = getKeyFilePath();
    const backupPath = getBackupFilePath();
    if (fs.existsSync(keyPath)) {
      try { fs.unlinkSync(keyPath); } catch {}
    }
    if (fs.existsSync(backupPath)) {
      try { fs.unlinkSync(backupPath); } catch {}
    }

    localKey = keyToProtect;
    return true;
  } catch {
    return false;
  }
}

export function removePin(): boolean {
  try {
    if (!localKey) return false;

    const keyPath = getKeyFilePath();
    const backupPath = getBackupFilePath();

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(localKey.toString('hex'));
      fs.writeFileSync(keyPath, encrypted);
      fs.writeFileSync(backupPath, encrypted);
    } else {
      fs.writeFileSync(keyPath, localKey);
      fs.writeFileSync(backupPath, localKey);
    }

    const pinPath = getPinFilePath();
    if (fs.existsSync(pinPath)) {
      try { fs.unlinkSync(pinPath); } catch {}
    }

    return true;
  } catch {
    return false;
  }
}

export function getLocalKey(): Buffer | null {
  if (localKey) return localKey;

  if (isPinSet()) {
    return null;
  }

  const keyPath = getKeyFilePath();
  const backupPath = getBackupFilePath();

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
  const keyPath = getKeyFilePath();
  const backupPath = getBackupFilePath();
  const pinPath = getPinFilePath();

  if (fs.existsSync(keyPath)) {
    try { fs.unlinkSync(keyPath); } catch {}
  }
  if (fs.existsSync(backupPath)) {
    try { fs.unlinkSync(backupPath); } catch {}
  }
  if (fs.existsSync(pinPath)) {
    try { fs.unlinkSync(pinPath); } catch {}
  }
  localKey = null;
}