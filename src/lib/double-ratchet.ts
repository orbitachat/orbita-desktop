import { generateKeyPair as x25519GenKeyPair, sharedKey as x25519SharedKey } from '@stablelib/x25519';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { HMAC } from '@stablelib/hmac';

export interface SkippedKey {
  key: Uint8Array | string;
  timestamp: number;
}

export interface RatchetState {
  rootKey: string;
  sendChainKey: string | null;
  recvChainKey: string | null;
  sendIndex: number;
  recvIndex: number;
  prevSendCount: number;
  skippedKeys: Record<string, SkippedKey | string>;
  ourDHPrivate: string;
  ourDHPublic: string;
  theirDHPublic: string;
}

export interface EncryptedMessage {
  ciphertext: string;
  index: number;
  dhPublicKey: string;
  prevChainCount: number;
}

const MAX_SKIP = 2000;
const MAX_SKIPPED_KEYS = 100;
const SKIPPED_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HKDF_INFO_ROOT = new TextEncoder().encode('OrbitaDoubleRatchetRootKDF');
const HKDF_INFO_SYM_INIT = new TextEncoder().encode('OrbitaSymmetricRatchetInit');
const CONST_CHAIN_STEP = new Uint8Array([0x02]);
const CONST_MSG_KEY = new Uint8Array([0x01]);

function zeroize(arr: Uint8Array): void {
  arr.fill(0);
}

function padMessage(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;
  let targetLen = 128;
  if (len + 6 > 1024) {
    targetLen = Math.ceil((len + 6) / 512) * 512;
  } else if (len + 6 > 512) {
    targetLen = 1024;
  } else if (len + 6 > 256) {
    targetLen = 512;
  } else if (len + 6 > 128) {
    targetLen = 256;
  }
  const padded = new Uint8Array(targetLen);
  padded[0] = 0xFD;
  padded[1] = 0x50;
  padded[2] = (len >>> 24) & 0xFF;
  padded[3] = (len >>> 16) & 0xFF;
  padded[4] = (len >>> 8) & 0xFF;
  padded[5] = len & 0xFF;
  padded.set(bytes, 6);
  if (targetLen > len + 6) {
    const padLen = targetLen - (len + 6);
    const padBytes = new Uint8Array(padLen);
    crypto.getRandomValues(padBytes);
    padded.set(padBytes, len + 6);
  }
  return padded;
}

function unpadMessage(bytes: Uint8Array): Uint8Array {
  if (bytes.length >= 6 && bytes[0] === 0xFD && bytes[1] === 0x50) {
    const len = ((bytes[2] << 24) >>> 0) + (bytes[3] << 16) + (bytes[4] << 8) + bytes[5];
    if (len <= bytes.length - 6) {
      return bytes.subarray(6, 6 + len);
    }
  }
  return bytes;
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexDecode(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function getSkippedKeyBytes(entry: SkippedKey | string): Uint8Array {
  if (typeof entry === 'string') {
    return hexDecode(entry);
  }
  if (entry.key instanceof Uint8Array) {
    return entry.key;
  }
  if (typeof entry.key === 'string') {
    return hexDecode(entry.key);
  }
  if (typeof entry.key === 'object' && entry.key !== null) {
    return new Uint8Array(Object.values(entry.key));
  }
  throw new Error('Invalid skipped key format');
}

export class DoubleRatchet {
  private state: RatchetState;

  constructor(state: RatchetState) {
    this.state = {
      ...state,
      skippedKeys: { ...state.skippedKeys },
    };
    this.cleanSkippedKeys();
  }

  getState(): RatchetState {
    this.cleanSkippedKeys();
    return {
      ...this.state,
      skippedKeys: { ...this.state.skippedKeys },
    };
  }

  canSend(): boolean {
    return this.state.sendChainKey !== null;
  }

  static initAsInitiator(rootKey: string, theirDHPublic: string): DoubleRatchet {
    const kp = x25519GenKeyPair();
    const ourDHPrivate = hexEncode(kp.secretKey);
    const ourDHPublic = hexEncode(kp.publicKey);

    const dhOut = x25519SharedKey(kp.secretKey, hexDecode(theirDHPublic));
    const { newRootKey, chainKey: sendChainKey } = kdfRootKey(hexDecode(rootKey), dhOut);

    return new DoubleRatchet({
      rootKey: hexEncode(newRootKey),
      sendChainKey: hexEncode(sendChainKey),
      recvChainKey: null,
      sendIndex: 0,
      recvIndex: 0,
      prevSendCount: 0,
      skippedKeys: {},
      ourDHPrivate,
      ourDHPublic,
      theirDHPublic,
    });
  }

  static initAsResponder(
    rootKey: string,
    ourDHPrivate: string,
    ourDHPublic: string,
  ): DoubleRatchet {
    return new DoubleRatchet({
      rootKey,
      sendChainKey: null,
      recvChainKey: null,
      sendIndex: 0,
      recvIndex: 0,
      prevSendCount: 0,
      skippedKeys: {},
      ourDHPrivate,
      ourDHPublic,
      theirDHPublic: '',
    });
  }

  static initSymmetric(
    rootKey: string,
    ourDHPrivate: string,
    ourDHPublic: string,
    theirDHPublic: string,
  ): DoubleRatchet {
    const rootBytes = hexDecode(rootKey);
    const { masterRootKey, chainAtoB, chainBtoA } = kdfSymmetricInit(rootBytes);

    const isFirstRole = ourDHPublic.toLowerCase() < theirDHPublic.toLowerCase();

    return new DoubleRatchet({
      rootKey: hexEncode(masterRootKey),
      sendChainKey: hexEncode(isFirstRole ? chainAtoB : chainBtoA),
      recvChainKey: hexEncode(isFirstRole ? chainBtoA : chainAtoB),
      sendIndex: 0,
      recvIndex: 0,
      prevSendCount: 0,
      skippedKeys: {},
      ourDHPrivate,
      ourDHPublic,
      theirDHPublic,
    });
  }

  static fromState(state: RatchetState): DoubleRatchet {
    return new DoubleRatchet({
      ...state,
      skippedKeys: { ...state.skippedKeys },
    });
  }

  static initForNotes(rootKey: string): DoubleRatchet {
    const ours = x25519GenKeyPair();
    const theirs = x25519GenKeyPair();

    const dhOut = x25519SharedKey(ours.secretKey, theirs.publicKey);
    const { newRootKey, chainKey: sendChainKey } = kdfRootKey(hexDecode(rootKey), dhOut);

    return new DoubleRatchet({
      rootKey: hexEncode(newRootKey),
      sendChainKey: hexEncode(sendChainKey),
      recvChainKey: hexEncode(sendChainKey),
      sendIndex: 0,
      recvIndex: 0,
      prevSendCount: 0,
      skippedKeys: {},
      ourDHPrivate: hexEncode(ours.secretKey),
      ourDHPublic: hexEncode(ours.publicKey),
      theirDHPublic: hexEncode(theirs.publicKey),
    });
  }

  getOurDHPublic(): string {
    return this.state.ourDHPublic;
  }

  async encrypt(plaintext: string): Promise<{
    ciphertext: string;
    index: number;
    dhPublicKey: string;
    prevChainCount: number;
  }> {
    if (!this.state.sendChainKey) {
      throw new Error(
        '[DoubleRatchet] No sending chain key available. ' +
        'As responder, wait for at least one message from the initiator first.',
      );
    }

    const index = this.state.sendIndex;
    const { msgKey, nextChainKey } = kdfChainKey(hexDecode(this.state.sendChainKey));

    this.state.sendChainKey = hexEncode(nextChainKey);
    this.state.sendIndex = index + 1;

    const plaintextBytes = new TextEncoder().encode(plaintext);
    const paddedBytes = padMessage(plaintextBytes);
    const { ciphertext, nonce, tag } = await aesGcmEncrypt(msgKey, paddedBytes);
    zeroize(msgKey);
    zeroize(paddedBytes);

    const combined = new Uint8Array(nonce.length + ciphertext.length + tag.length);
    combined.set(nonce, 0);
    combined.set(ciphertext, nonce.length);
    combined.set(tag, nonce.length + ciphertext.length);

    return {
      ciphertext: hexEncode(combined),
      index,
      dhPublicKey: this.state.ourDHPublic,
      prevChainCount: this.state.prevSendCount,
    };
  }

  async decrypt(
    combinedHex: string,
    index: number,
    dhPublicKeyHex: string,
    prevChainCount?: number,
  ): Promise<string | null> {
    try {
      const combined = hexDecode(combinedHex);
      if (combined.length < 28) return null;

      const nonce = combined.slice(0, 12);
      const ciphertext = combined.slice(12, combined.length - 16);
      const tag = combined.slice(combined.length - 16);

      this.cleanSkippedKeys();
      const skippedEntry = this.state.skippedKeys[`${dhPublicKeyHex}:${index}`];
      if (skippedEntry) {
        delete this.state.skippedKeys[`${dhPublicKeyHex}:${index}`];
        const msgKey = getSkippedKeyBytes(skippedEntry);
        const decryptedBytes = await aesGcmDecrypt(msgKey, nonce, ciphertext, tag);
        zeroize(msgKey);
        const unpadded = unpadMessage(decryptedBytes);
        return new TextDecoder().decode(unpadded);
      }

      if (dhPublicKeyHex !== this.state.theirDHPublic) {
        if (prevChainCount !== undefined) {
          this.skipMessageKeys(this.state.theirDHPublic, prevChainCount);
        }
        this.dhRatchet(dhPublicKeyHex);
      }

      if (index < this.state.recvIndex) {
        return null;
      }

      this.skipMessageKeys(dhPublicKeyHex, index);

      if (!this.state.recvChainKey) return null;

      const { msgKey, nextChainKey } = kdfChainKey(hexDecode(this.state.recvChainKey));
      this.state.recvChainKey = hexEncode(nextChainKey);
      this.state.recvIndex = index + 1;

      const decryptedBytes = await aesGcmDecrypt(msgKey, nonce, ciphertext, tag);
      zeroize(msgKey);
      const unpadded = unpadMessage(decryptedBytes);
      return new TextDecoder().decode(unpadded);
    } catch (err) {
      console.error('[DoubleRatchet] Decryption failed:', err);
      return null;
    }
  }

  private cleanSkippedKeys(): void {
    const now = Date.now();
    const entries = Object.entries(this.state.skippedKeys);

    for (const [dictKey, entry] of entries) {
      if (typeof entry === 'object' && entry !== null && typeof entry.timestamp === 'number') {
        if (now - entry.timestamp > SKIPPED_KEY_TTL_MS) {
          delete this.state.skippedKeys[dictKey];
        }
      }
    }

    const currentKeys = Object.keys(this.state.skippedKeys);
    if (currentKeys.length > MAX_SKIPPED_KEYS) {
      const sorted = currentKeys.sort((a, b) => {
        const itemA = this.state.skippedKeys[a];
        const itemB = this.state.skippedKeys[b];
        const timeA = typeof itemA === 'object' && itemA !== null && typeof itemA.timestamp === 'number' ? itemA.timestamp : 0;
        const timeB = typeof itemB === 'object' && itemB !== null && typeof itemB.timestamp === 'number' ? itemB.timestamp : 0;
        return timeA - timeB;
      });

      const toDeleteCount = currentKeys.length - MAX_SKIPPED_KEYS;
      for (let i = 0; i < toDeleteCount; i++) {
        delete this.state.skippedKeys[sorted[i]];
      }
    }
  }

  private skipMessageKeys(theirDHPublicHex: string, untilIndex: number): void {
    if (!theirDHPublicHex || !this.state.recvChainKey) return;
    if (this.state.recvIndex + MAX_SKIP < untilIndex) {
      throw new Error('[DoubleRatchet] Too many messages skipped');
    }
    while (this.state.recvIndex < untilIndex) {
      const { msgKey, nextChainKey } = kdfChainKey(hexDecode(this.state.recvChainKey));
      this.state.recvChainKey = hexEncode(nextChainKey);
      this.state.skippedKeys[`${theirDHPublicHex}:${this.state.recvIndex}`] = {
        key: hexEncode(msgKey),
        timestamp: Date.now(),
      };
      this.state.recvIndex += 1;
    }
    this.cleanSkippedKeys();
  }

  private dhRatchet(theirDHPublicHex: string): void {
    this.state.prevSendCount = this.state.sendIndex;
    this.state.sendIndex = 0;
    this.state.recvIndex = 0;
    this.state.theirDHPublic = theirDHPublicHex;

    const dhRecv = x25519SharedKey(hexDecode(this.state.ourDHPrivate), hexDecode(theirDHPublicHex));
    const { newRootKey: rootAfterRecv, chainKey: recvChainKey } = kdfRootKey(
      hexDecode(this.state.rootKey),
      dhRecv,
    );
    this.state.rootKey = hexEncode(rootAfterRecv);
    this.state.recvChainKey = hexEncode(recvChainKey);

    const kp = x25519GenKeyPair();
    this.state.ourDHPrivate = hexEncode(kp.secretKey);
    this.state.ourDHPublic = hexEncode(kp.publicKey);

    const dhSend = x25519SharedKey(kp.secretKey, hexDecode(theirDHPublicHex));
    const { newRootKey: rootAfterSend, chainKey: sendChainKey } = kdfRootKey(
      rootAfterRecv,
      dhSend,
    );
    this.state.rootKey = hexEncode(rootAfterSend);
    this.state.sendChainKey = hexEncode(sendChainKey);
  }
}

function hmacSha256Sync(key: Uint8Array, data: Uint8Array): Uint8Array {
  const hmac = new HMAC(SHA256, key);
  hmac.update(data);
  return hmac.digest();
}

function kdfSymmetricInit(rootKeyBytes: Uint8Array): {
  masterRootKey: Uint8Array;
  chainAtoB: Uint8Array;
  chainBtoA: Uint8Array;
} {
  const hkdf = new HKDF(SHA256, rootKeyBytes, new Uint8Array(32), HKDF_INFO_SYM_INIT);
  const masterRootKey = hkdf.expand(32);
  const chainAtoB = hkdf.expand(32);
  const chainBtoA = hkdf.expand(32);
  return { masterRootKey, chainAtoB, chainBtoA };
}

function kdfRootKey(rootKey: Uint8Array, dhOut: Uint8Array): { newRootKey: Uint8Array; chainKey: Uint8Array } {
  const hkdf = new HKDF(SHA256, dhOut, rootKey, HKDF_INFO_ROOT);
  const out = hkdf.expand(64);
  return {
    newRootKey: out.slice(0, 32),
    chainKey: out.slice(32, 64),
  };
}

function kdfChainKey(chainKey: Uint8Array): { msgKey: Uint8Array; nextChainKey: Uint8Array } {
  const msgKey = hmacSha256Sync(chainKey, CONST_MSG_KEY);
  const nextChainKey = hmacSha256Sync(chainKey, CONST_CHAIN_STEP);
  return { msgKey, nextChainKey };
}

async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintextBytes: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array; tag: Uint8Array }> {
  if (window.orbita?.rustEncryptMessage) {
    try {
      const res = await window.orbita.rustEncryptMessage(keyBytes, plaintextBytes);
      if (res && res.ciphertext && res.nonce && res.tag) {
        return {
          ciphertext: new Uint8Array(res.ciphertext),
          nonce: new Uint8Array(res.nonce),
          tag: new Uint8Array(res.tag),
        };
      }
    } catch (e) {
      console.warn('[DoubleRatchet] Rust encrypt fallback to WebCrypto:', e);
    }
  }

  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
    cryptoKey,
    plaintextBytes as BufferSource,
  );

  const encBytes = new Uint8Array(encrypted);
  const tag = encBytes.slice(encBytes.length - 16);
  const ciphertext = encBytes.slice(0, encBytes.length - 16);

  return { ciphertext, nonce, tag };
}

async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
): Promise<Uint8Array> {
  if (window.orbita?.rustDecryptMessage) {
    try {
      const decrypted = await window.orbita.rustDecryptMessage(keyBytes, ciphertext, nonce, tag);
      if (decrypted) return new Uint8Array(decrypted);
    } catch (e) {
      console.warn('[DoubleRatchet] Rust decrypt fallback to WebCrypto:', e);
    }
  }

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
    cryptoKey,
    combined as BufferSource,
  );

  return new Uint8Array(decrypted);
}