export const BASE_INVITE_URL = 'https://orbita-chess-network.alwaysdata.net/u';

export function getInviteLink(code: string): string {
  if (!code) return '';
  const cleanCode = code.trim();
  return `${BASE_INVITE_URL}/${encodeURIComponent(cleanCode)}`;
}

export function extractCodeFromInput(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  const urlMatch = trimmed.match(/\/u\/([a-zA-Z0-9_-]{6,64})/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  const queryMatch = trimmed.match(/[?&](?:code|id)=([a-zA-Z0-9_-]{6,64})/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  const deepLinkMatch = trimmed.match(/orbita:\/\/(?:connect|invite|u)?\/?(?:code=)?([a-zA-Z0-9_-]{6,64})/i);
  if (deepLinkMatch && deepLinkMatch[1]) {
    return deepLinkMatch[1];
  }

  return trimmed;
}
