import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { encode as hexEncode } from '@stablelib/hex';
import { generateGroupInviteCode } from './codes';

export function generateGroupCode(): string {
  return generateGroupInviteCode();
}

export function isValidGroupCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const cleaned = code.trim();
  if (cleaned.length < 8 || cleaned.length > 54) return false;
  if (/^join_[0-9A-Za-z_-]{6,20}$/.test(cleaned)) return true;
  if (cleaned.length === 54 && /^[0-9A-Za-z]{54}$/.test(cleaned)) return true;
  if (cleaned.length === 36 && /^[0-9A-Z]{36}$/i.test(cleaned)) return true;
  return /^[0-9A-Za-z_-]{10,25}$/.test(cleaned);
}

export function deriveGroupId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.length === 36 && /^[0-9A-Z]{36}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(trimmed);
  const hash = new SHA256();
  hash.update(inputBytes);
  const digest = hash.digest();
  const hex = hexEncode(digest);
  return hex.slice(0, 36).toUpperCase();
}

export function deriveGroupKey(keySource: string): string {
  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(keySource.trim());
  const salt = encoder.encode('orbita-group-salt-v1');
  const info = encoder.encode('orbita-group-e2ee-key-v1');
  const hkdf = new HKDF(SHA256, inputBytes, salt, info);
  const keyBytes = hkdf.expand(32);
  return hexEncode(keyBytes);
}

export function extractGroupCode(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  const directJoinMatch = trimmed.match(/(join_[a-zA-Z0-9_-]{6,20})/i);
  if (directJoinMatch && directJoinMatch[1]) {
    return directJoinMatch[1];
  }

  const slashMatch = trimmed.match(/orbita\/(join_[a-zA-Z0-9_-]{6,20})/i);
  if (slashMatch && slashMatch[1]) {
    return slashMatch[1];
  }

  const urlMatch = trimmed.match(/\/(?:g|group|join|invite)(?:\/group)?\/([a-zA-Z0-9_-]{8,54})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  const queryMatch = trimmed.match(/[?&](?:group|code|token)=([a-zA-Z0-9_-]{8,54})/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  const deepLinkMatch = trimmed.match(/orbita:\/\/(?:group|join|invite)(?:\/group)?\/([a-zA-Z0-9_-]{8,54})/i);
  if (deepLinkMatch && deepLinkMatch[1]) {
    return deepLinkMatch[1];
  }

  const deepLinkParamMatch = trimmed.match(/orbita:\/\/(?:group|join|invite)(?:\/group)?\?(?:code|token|group)=([a-zA-Z0-9_-]{8,54})/i);
  if (deepLinkParamMatch && deepLinkParamMatch[1]) {
    return deepLinkParamMatch[1];
  }

  if (trimmed.startsWith('join_') && trimmed.length <= 25) {
    return trimmed;
  }

  if (trimmed.length === 54 && /^[0-9A-Za-z]{54}$/.test(trimmed)) {
    return trimmed;
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
