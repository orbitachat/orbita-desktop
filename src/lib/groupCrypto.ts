import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { encode as hexEncode } from '@stablelib/hex';
import { randomBytes } from '@stablelib/random';

const BASE62_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function generateGroupCode(): string {
  const bytes = randomBytes(54);
  let result = '';
  for (let i = 0; i < 54; i++) {
    result += BASE62_CHARSET[bytes[i] % BASE62_CHARSET.length];
  }
  return result;
}

export function isValidGroupCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const cleaned = code.trim();
  if (cleaned.length !== 54) return false;
  return /^[0-9A-Za-z]{54}$/.test(cleaned);
}

export function deriveGroupId(groupCode: string): string {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(groupCode.trim());
  const hash = new SHA256();
  hash.update(inputBytes);
  const digest = hash.digest();
  const hex = hexEncode(digest);
  return `grp_${hex.slice(0, 24)}`;
}

export function deriveGroupKey(groupCode: string): string {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(groupCode.trim());
  const salt = encoder.encode('orbita-group-salt-v1');
  const info = encoder.encode('orbita-group-e2ee-key-v1');
  const hkdf = new HKDF(SHA256, inputBytes, salt, info);
  const keyBytes = hkdf.expand(32);
  return hexEncode(keyBytes);
}

export function extractGroupCode(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  const urlMatch = trimmed.match(/\/(?:g|group|join|invite)(?:\/group)?\/([a-zA-Z0-9]{54})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  const queryMatch = trimmed.match(/[?&](?:group|code|token)=([a-zA-Z0-9]{54})/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  const deepLinkMatch = trimmed.match(/orbita:\/\/(?:group|join|invite)(?:\/group)?\/([a-zA-Z0-9]{54})/i);
  if (deepLinkMatch && deepLinkMatch[1]) {
    return deepLinkMatch[1];
  }

  const deepLinkParamMatch = trimmed.match(/orbita:\/\/(?:group|join|invite)(?:\/group)?\?(?:code|token|group)=([a-zA-Z0-9]{54})/i);
  if (deepLinkParamMatch && deepLinkParamMatch[1]) {
    return deepLinkParamMatch[1];
  }

  if (trimmed.length === 54 && /^[0-9A-Za-z]{54}$/.test(trimmed)) {
    return trimmed;
  }

  const fallback54 = trimmed.match(/([0-9A-Za-z]{54})/);
  if (fallback54 && fallback54[1]) {
    return fallback54[1];
  }

  return '';
}

export function buildGroupInviteLink(
  groupCode: string,
  name?: string,
  creator?: string,
  avatarUrl?: string
): string {
  if (!groupCode) return '';
  const cleanCode = groupCode.trim();
  const base = `https://orbita-chess-network.alwaysdata.net/g/${encodeURIComponent(cleanCode)}`;
  const params = new URLSearchParams();
  if (name && name.trim() && name.trim() !== 'Группа' && name.trim() !== 'Group') {
    params.set('name', name.trim());
  }
  if (creator && creator.trim()) {
    params.set('creator', creator.trim());
  }
  if (avatarUrl && avatarUrl.trim()) {
    params.set('avatar', avatarUrl.trim());
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function extractGroupMetadata(input: string): {
  code: string;
  name?: string;
  creator?: string;
  avatarUrl?: string;
} {
  const code = extractGroupCode(input);
  if (!input) return { code };
  try {
    const raw = input.includes('?') ? input.split('?')[1] : '';
    if (!raw) return { code };
    const params = new URLSearchParams(raw);
    const name = params.get('name') || undefined;
    const creator = params.get('creator') || undefined;
    const avatarUrl = params.get('avatar') || undefined;
    return { code, name, creator, avatarUrl };
  } catch {
    return { code };
  }
}

export function getGroupInviteLink(
  groupCode: string,
  name?: string,
  creator?: string,
  avatarUrl?: string
): string {
  return buildGroupInviteLink(groupCode, name, creator, avatarUrl);
}
