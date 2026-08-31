// src/services/securityService.ts

const LOCK_ENABLED_KEY = 'orbita_lock_enabled';
const LOCK_SALT_KEY = 'orbita_lock_salt';
const LOCK_HASH_KEY = 'orbita_lock_hash';

export interface PasswordStrength {
  score: number;
  percent: number;
  labelKey: 'strength_too_short' | 'strength_weak' | 'strength_medium' | 'strength_strong' | 'strength_very_strong';
  color: string;
}

/**
 * Evaluates password strength locally using length, character variety, and entropy rules.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 6) {
    return {
      score: 0,
      percent: password ? 15 : 0,
      labelKey: 'strength_too_short',
      color: '#ef4444',
    };
  }

  let score = 0;

  // Length checks
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;

  // Character variety checks
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return { score: 1, percent: 30, labelKey: 'strength_weak', color: '#ef4444' };
  } else if (score === 2) {
    return { score: 2, percent: 55, labelKey: 'strength_medium', color: '#f59e0b' };
  } else if (score === 3) {
    return { score: 3, percent: 80, labelKey: 'strength_strong', color: '#10b981' };
  } else {
    return { score: 4, percent: 100, labelKey: 'strength_very_strong', color: '#059669' };
  }
}

/**
 * Derives a PBKDF2 hash using Web Crypto API (SHA-256, 100,000 iterations).
 */
async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export const securityService = {
  isPasswordSet(): boolean {
    return localStorage.getItem(LOCK_ENABLED_KEY) === 'true';
  },

  async setPassword(password: string): Promise<boolean> {
    try {
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const saltHex = bufferToHex(salt);
      const hashHex = await deriveHash(password, salt);

      localStorage.setItem(LOCK_ENABLED_KEY, 'true');
      localStorage.setItem(LOCK_SALT_KEY, saltHex);
      localStorage.setItem(LOCK_HASH_KEY, hashHex);
      return true;
    } catch (err) {
      console.error('[Security] Failed to set password:', err);
      return false;
    }
  },

  async verifyPassword(password: string): Promise<boolean> {
    try {
      const saltHex = localStorage.getItem(LOCK_SALT_KEY);
      const expectedHash = localStorage.getItem(LOCK_HASH_KEY);

      if (!saltHex || !expectedHash) return false;

      const salt = hexToBuffer(saltHex);
      const computedHash = await deriveHash(password, salt);

      return computedHash === expectedHash;
    } catch (err) {
      console.error('[Security] Failed to verify password:', err);
      return false;
    }
  },

  removePassword(): void {
    localStorage.removeItem(LOCK_ENABLED_KEY);
    localStorage.removeItem(LOCK_SALT_KEY);
    localStorage.removeItem(LOCK_HASH_KEY);
  },
};
