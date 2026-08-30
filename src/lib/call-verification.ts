// src/lib/call-verification.ts
import { allEmojis } from './emoji-data';

export async function generateCallVerificationEmojis(secret: string): Promise<string[]> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret + ':call-verification');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const emojis: string[] = [];
  const total = allEmojis.length;
  for (let i = 0; i < 4; i++) {
    const idx = i * 2;
    const value = (hashArray[idx] << 8) | hashArray[idx + 1];
    emojis.push(allEmojis[value % total].char);
  }
  return emojis;
}