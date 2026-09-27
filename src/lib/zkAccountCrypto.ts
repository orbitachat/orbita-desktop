import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex';
import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdfSha256, aesGcmEncrypt, aesGcmDecrypt } from './crypto';

export const MAX_CONFIG_BLOB_BYTES = 128 * 1024;

export interface DerivedAccountKeys {
  userId: string;
  authSeed: Uint8Array;
  authPublicKey: Uint8Array;
  backupEncKey: Uint8Array;
}

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const generateMasterSeedHex = (): string => {
  const entropy = new Uint8Array(32);
  globalThis.crypto.getRandomValues(entropy);
  return hexEncode(entropy).toLowerCase();
};

export const isValidMasterSeedHex = (seedHex: string): boolean => {
  return /^[0-9a-fA-F]{64}$/.test(seedHex.trim());
};

export const deriveAccountKeys = (masterSeedHex: string): DerivedAccountKeys => {
  const trimmed = masterSeedHex.trim().toLowerCase();
  if (!isValidMasterSeedHex(trimmed)) {
    throw new Error('INVALID_MASTER_SEED');
  }
  const masterSeedBytes = hexDecode(trimmed);
  const emptySalt = new Uint8Array(32);

  const authInfo = new TextEncoder().encode('orbita-identity-auth-v1');
  const authSeed = hkdfSha256(masterSeedBytes, emptySalt, authInfo, 32);
  const authPublicKey = ed25519.getPublicKey(authSeed);
  const userId = hexEncode(authPublicKey).toLowerCase();

  const encInfo = new TextEncoder().encode('orbita-user-config-enc-v1');
  const backupEncKey = hkdfSha256(masterSeedBytes, emptySalt, encInfo, 32);

  return {
    userId,
    authSeed,
    authPublicKey,
    backupEncKey,
  };
};

export const signConfigPayload = (
  authSeed: Uint8Array,
  userId: string,
  version: number | bigint,
  configBlob: string
): string => {
  const messageStr = `${userId.toLowerCase()}${version}${configBlob}`;
  const messageBytes = new TextEncoder().encode(messageStr);
  const signatureBytes = ed25519.sign(messageBytes, authSeed);
  return hexEncode(signatureBytes).toLowerCase();
};

export const verifyConfigPayloadSignature = (
  userIdHex: string,
  version: number | bigint,
  configBlob: string,
  signatureHex: string
): boolean => {
  try {
    const pubKey = hexDecode(userIdHex.trim().toLowerCase());
    const sig = hexDecode(signatureHex.trim().toLowerCase());
    const messageStr = `${userIdHex.trim().toLowerCase()}${version}${configBlob}`;
    const messageBytes = new TextEncoder().encode(messageStr);
    return ed25519.verify(sig, messageBytes, pubKey);
  } catch {
    return false;
  }
};

export const encryptConfigBlob = async (
  backupEncKey: Uint8Array,
  plaintextJson: string
): Promise<string> => {
  const plaintextBytes = new TextEncoder().encode(plaintextJson);
  const { ciphertext, nonce, tag } = await aesGcmEncrypt(backupEncKey, plaintextBytes);
  const combined = new Uint8Array(nonce.length + ciphertext.length + tag.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  combined.set(tag, nonce.length + ciphertext.length);

  if (combined.byteLength > MAX_CONFIG_BLOB_BYTES) {
    throw new Error('CONFIG_BLOB_TOO_LARGE');
  }

  return bytesToBase64(combined);
};

export const decryptConfigBlob = async (
  backupEncKey: Uint8Array,
  base64Blob: string
): Promise<string> => {
  const combined = base64ToBytes(base64Blob);
  if (combined.byteLength < 12 + 16) {
    throw new Error('INVALID_CIPHERTEXT_LENGTH');
  }
  const nonce = combined.subarray(0, 12);
  const tagOffset = combined.byteLength - 16;
  const ciphertext = combined.subarray(12, tagOffset);
  const tag = combined.subarray(tagOffset);

  const decryptedBytes = await aesGcmDecrypt(backupEncKey, ciphertext, nonce, tag);
  if (!decryptedBytes) {
    throw new Error('CORRUPTED_OR_INVALID_KEY');
  }

  return new TextDecoder().decode(decryptedBytes);
};
