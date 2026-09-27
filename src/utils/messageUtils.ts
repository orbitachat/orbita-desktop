export function formatPreviewText(rawText: string, t: any): string {
  if (!rawText) return '';
  const clean = rawText.replace(/^↩\s(?:\[id:.+?\]\s)?.+?:.+?,\s\d{2}:\d{2}\n?/, '').trim();
  if (/^\[Sticker\]/i.test(clean) || clean.includes('/stickers/') || clean.includes('\\stickers\\') || clean.includes('.stickers')) return t('chatWindow.sticker', 'Стикер');
  if (/^\[GIF\]/i.test(clean)) return 'GIF';
  if (/^\[Photo\]/i.test(clean)) return t('chatWindow.photo', 'Фотография');
  if (/^\[Video\]/i.test(clean)) return t('chatWindow.video', 'Видео');
  if (/^\[Audio\]/i.test(clean)) {
    if (/voice_/i.test(clean)) return t('chatWindow.voice_message', 'Голосовое сообщение');
    const match = clean.match(/^\[Audio\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
    return match ? match[1] : t('chatWindow.audio', 'Аудио');
  }
  if (/^\[File\]/i.test(clean)) {
    const match = clean.match(/^\[File\]\s+(.+?)(?:\s+https?:\/\/|$)/i);
    return match ? match[1] : t('chatWindow.file', 'Файл');
  }
  return clean.replace(/\n+/g, ' ');
}

export function parseReplyChain(text: string): {
  quotes: Array<{ id?: string; senderId?: string; sender: string; text: string; time: string }>;
  body: string;
} {
  const quotes: Array<{ id?: string; senderId?: string; sender: string; text: string; time: string }> = [];
  let rest = text;
  // New format: ↩ [id:msgId:senderId] SenderName: text, 12:34
  // Legacy format: ↩ [id:msgId] SenderName: text, 12:34
  // Legacy format without id: ↩ SenderName: text, 12:34
  const m = rest.match(/^↩\s(?:\[id:([^\]:]+)(?::([^\]]+))?\]\s)?(.+?):\s(.+?),\s(\d{2}:\d{2})\n/);
  if (m) {
    quotes.push({ id: m[1] || undefined, senderId: m[2] || undefined, sender: m[3], text: m[4], time: m[5] });
    rest = rest.slice(m[0].length);
  }
  return { quotes, body: rest };
}

export function countEmojis(text: string): number {
  const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/u;
  let count = 0;
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as any).Segmenter('en', { granularity: 'grapheme' });
    for (const segment of segmenter.segment(text)) {
      if (segment.segment.trim() && emojiRegex.test(segment.segment)) {
        count++;
      }
    }
    return count;
  }
  for (const char of text) {
    if (emojiRegex.test(char)) count++;
  }
  return count;
}

export function formatTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatLastSeen(
  timestamp: number | null | undefined,
  t: (key: string, options?: any) => string
): string {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return t('userStatus.offline');
  }

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60 * 1000) {
    return t('userStatus.just_now');
  }

  if (diff < 5 * 60 * 1000) {
    return t('userStatus.offline');
  }

  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (isToday) {
    return t('userStatus.today_at', { time: timeStr });
  }

  if (isYesterday) {
    return t('userStatus.yesterday_at', { time: timeStr });
  }

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const currentYear = today.getFullYear();
  const dateStr = year === currentYear ? `${day}.${month}` : `${day}.${month}.${year}`;

  return t('userStatus.date_at', { date: dateStr, time: timeStr });
}

export function htmlToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return '\n';
  }

  let inner = '';
  el.childNodes.forEach((child, index) => {
    const childTag = child.nodeType === Node.ELEMENT_NODE ? (child as HTMLElement).tagName.toLowerCase() : '';
    const isBlock = childTag === 'div' || childTag === 'p' || childTag === 'blockquote';
    if (isBlock && index > 0 && inner.length > 0 && !inner.endsWith('\n')) {
      inner += '\n';
    }
    inner += htmlToMarkdown(child);
  });

  if (tag === 'b' || tag === 'strong' || el.style?.fontWeight === 'bold' || parseInt(el.style?.fontWeight || '400') >= 600) {
    return inner ? `**${inner}**` : '';
  }
  if (tag === 'i' || tag === 'em' || el.style?.fontStyle === 'italic') {
    return inner ? `*${inner}*` : '';
  }
  if (tag === 'u' || el.style?.textDecoration?.includes('underline')) {
    return inner ? `<u>${inner}</u>` : '';
  }
  if (tag === 's' || tag === 'strike' || tag === 'del' || el.style?.textDecoration?.includes('line-through')) {
    return inner ? `~~${inner}~~` : '';
  }
  if (tag === 'code' || el.style?.fontFamily?.includes('monospace')) {
    return inner ? `\`${inner}\`` : '';
  }
  if (tag === 'blockquote') {
    return inner ? inner.split('\n').map((line) => `> ${line}`).join('\n') : '';
  }
  if (el.classList?.contains('spoiler') || el.getAttribute?.('data-spoiler') === 'true' || el.style?.filter?.includes('blur')) {
    return inner ? `||${inner}||` : '';
  }
  if (tag === 'a') {
    const href = el.getAttribute('href') || '';
    if (href === inner) return inner; // raw link
    return inner ? `[${inner}](${href})` : '';
  }

  return inner;
}

export function markdownToHtml(md: string, themeColor: string = '#7C3AED', disableLinks: boolean = false): string {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const links: string[] = [];
  const addLink = (href: string, label: string) => {
    if (disableLinks) {
      return label;
    }
    const safeHref = href.replace(/"/g, '&quot;');
    const linkHtml = `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:${themeColor};text-decoration:none;cursor:pointer;">${label}</a>`;
    links.push(linkHtml);
    return `___LINK_PLACEHOLDER_${links.length - 1}___`;
  };

  // 1. Handle [text](url) or [text](domain.com) links
  html = html.replace(/\[([^\]]+)\]\(((?:https?:\/\/|ftp:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})[^\s)]*)\)/gi, (_match, label, url) => {
    const href = url.match(/^(https?:\/\/|ftp:\/\/)/i) ? url : `http://${url}`;
    return addLink(href, label);
  });

  // 2. Handle raw scheme URLs (https://, http://, ftp://)
  html = html.replace(/(?:https?:\/\/|ftp:\/\/)[^\s<>"'\)]+/gi, (match) => {
    return addLink(match, match);
  });

  // 3. Handle raw domain URLs without scheme (google.com, yandex.ru, sub.domain.org/path, etc.)
  html = html.replace(/\b(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s<>"'\)]*)?/gi, (match) => {
    const href = `http://${match}`;
    return addLink(href, match);
  });

  // Restore allowed formatting HTML tags
  html = html
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/~~(.*?)~~/g, '<s>$1</s>')
    .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>')
    .replace(/`([^`]+)`/g, '<code style="font-family:monospace;background:rgba(255,255,255,0.12);padding:2px 4px;border-radius:4px;">$1</code>')
    .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" data-spoiler="true" style="background:rgba(255,255,255,0.18);filter:blur(3px);padding:0 3px;border-radius:4px;cursor:pointer;">$1</span>')
    .replace(/^&gt;\s?(.*)$/gm, `<blockquote style="border-left:3px solid ${themeColor};padding-left:8px;margin:4px 0;">$1</blockquote>`)
    .replace(/\n/g, '<br>');

  // Restore generated link tags
  html = html.replace(/___LINK_PLACEHOLDER_(\d+)___/g, (_match, index) => {
    return links[parseInt(index, 10)] || '';
  });

  return html;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}