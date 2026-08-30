// src/lib/crypto.ts
import { generateKeyPair as x25519GenKeyPair, sharedKey as x25519SharedKey, scalarMultBase } from '@stablelib/x25519';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { encode as hexEncode, decode as hexDecode } from '@stablelib/hex';
import { randomBytes } from '@stablelib/random';
import { nanoid } from 'nanoid';

// Works in browser/Electron renderer and in Node 19+ (main process) via globalThis.crypto
const subtle = globalThis.crypto?.subtle;

export const generateKeyPair = (): { publicKey: string; privateKey: string } => {
  const keyPair = x25519GenKeyPair();
  return {
    publicKey: hexEncode(keyPair.publicKey),
    privateKey: hexEncode(keyPair.secretKey),
  };
};

export const derivePublicKey = (privateKeyHex: string): string => {
  const priv = hexDecode(privateKeyHex);
  const pub = scalarMultBase(priv);
  return hexEncode(pub);
};

export const deriveSharedSecret = (myPrivateKey: string, otherPublicKey: string): string => {
  const priv = hexDecode(myPrivateKey);
  const pub = hexDecode(otherPublicKey);
  const shared = x25519SharedKey(priv, pub);
  return hexEncode(shared);
};

export const generateChatId = (): string => nanoid(21);

/**
 * Derive a proper root key from a raw X25519 shared secret via HKDF-SHA256.
 * The raw DH output must never be used directly as a symmetric key.
 * @param sharedSecret - hex-encoded 32-byte X25519 shared secret
 * @returns hex-encoded 32-byte root key suitable for Double Ratchet
 */
export const deriveRootKey = (sharedSecret: string): string => {
  const ikm = hexDecode(sharedSecret);
  const salt = new Uint8Array(32); // fixed salt OK per RFC 5869 §3.1 when IKM is already pseudo-random
  const info = new TextEncoder().encode('orbita-root-key-v1');
  const derived = hkdfSha256(ikm, salt, info, 32);
  return hexEncode(derived);
};

/**
 * HKDF with SHA-256
 * @param ikm  - input key material (Uint8Array)
 * @param salt - salt (Uint8Array)
 * @param info - context info (Uint8Array)
 * @param length - output length in bytes
 */
export const hkdfSha256 = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array => {
  const hkdf = new HKDF(SHA256, ikm, salt, info);
  return hkdf.expand(length);
};

/**
 * AES-GCM encryption (Hardware-accelerated Rust / Web Crypto API)
 * @param key - 32-byte key (Uint8Array)
 * @param plaintext - data to encrypt (Uint8Array)
 * @param nonce - 12-byte nonce (if not provided, generated)
 * @param associatedData - optional additional data
 */
export const aesGcmEncrypt = async (
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce?: Uint8Array,
  associatedData?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array }> => {
  if (window.orbita?.rustEncryptMessage) {
    try {
      const res = await window.orbita.rustEncryptMessage(key, plaintext, nonce, associatedData);
      if (res && res.ciphertext && res.nonce && res.tag) {
        return {
          ciphertext: new Uint8Array(res.ciphertext),
          nonce: new Uint8Array(res.nonce),
          tag: new Uint8Array(res.tag),
        };
      }
    } catch {
      // fallback to Web Crypto
    }
  }

  if (!nonce) nonce = randomBytes(12);
  const cryptoKey = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
  const algorithm: AesGcmParams = { name: 'AES-GCM', iv: nonce as BufferSource };
  if (associatedData) algorithm.additionalData = associatedData as BufferSource;
  const result = new Uint8Array(
    await subtle.encrypt(algorithm, cryptoKey, plaintext as BufferSource)
  );
  // Web Crypto appends the 16-byte tag to the end of the ciphertext
  const tagOffset = result.length - 16;
  const ciphertext = result.subarray(0, tagOffset);
  const tag = result.subarray(tagOffset);
  return { ciphertext, nonce, tag };
};

/**
 * AES-GCM decryption (Hardware-accelerated Rust / Web Crypto API)
 * @param key - 32-byte key (Uint8Array)
 * @param ciphertext - encrypted data (Uint8Array)
 * @param nonce - 12-byte nonce
 * @param tag - 16-byte authentication tag
 * @param associatedData - optional additional data
 */
export const aesGcmDecrypt = async (
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  tag: Uint8Array,
  associatedData?: Uint8Array
): Promise<Uint8Array | null> => {
  if (window.orbita?.rustDecryptMessage) {
    try {
      const decrypted = await window.orbita.rustDecryptMessage(key, ciphertext, nonce, tag, associatedData);
      if (decrypted) return new Uint8Array(decrypted);
    } catch {
      // fallback to Web Crypto
    }
  }

  try {
    const cryptoKey = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt']);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext);
    combined.set(tag, ciphertext.length);
    const algorithm: AesGcmParams = { name: 'AES-GCM', iv: nonce as BufferSource };
    if (associatedData) algorithm.additionalData = associatedData as BufferSource;
    const decrypted = await subtle.decrypt(algorithm, cryptoKey, combined as BufferSource);
    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
};

// For backward compatibility with existing code that expects hex strings
export const encryptMessage = async (text: string, sharedSecret: string): Promise<string> => {
  const key = hexDecode(sharedSecret);
  const plaintext = new TextEncoder().encode(text);
  const { ciphertext, nonce, tag } = await aesGcmEncrypt(key, plaintext);
  // Format: nonce + ciphertext + tag, all concatenated as hex
  const combined = new Uint8Array(nonce.length + ciphertext.length + tag.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  combined.set(tag, nonce.length + ciphertext.length);
  return hexEncode(combined);
};

export const decryptMessage = async (cipherText: string, sharedSecret: string): Promise<string> => {
  try {
    const key = hexDecode(sharedSecret);
    const data = hexDecode(cipherText);
    if (data.length < 12 + 16) throw new Error('Invalid ciphertext');
    const nonce = data.subarray(0, 12);
    const tagOffset = data.length - 16;
    const ciphertext = data.subarray(12, tagOffset);
    const tag = data.subarray(tagOffset);
    const decrypted = await aesGcmDecrypt(key, ciphertext, nonce, tag);
    if (!decrypted) throw new Error('Decryption failed');
    return new TextDecoder().decode(decrypted);
  } catch {
    return '[ENCRYPTED MESSAGE]';
  }
};