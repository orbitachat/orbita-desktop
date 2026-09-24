export interface StickerItem {
  id: string;
  url: string;
  thumbUrl?: string;
  packId: string;
  name: string;
  tags: string[];
}

export interface StickerPack {
  id: string;
  title: string;
  author?: string;
  avatarUrl: string;
  stickers: StickerItem[];
}

export interface GifItem {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  tags: string[];
  reaction?: string;
  aspectRatio?: number;
}

export const GIF_REACTIONS = [
  { emoji: '🕒', label: 'Недавние', key: 'trending' },
  { emoji: '👍', label: 'Класс', key: 'thumbs_up' },
  { emoji: '🤔', label: 'Хм', key: 'thinking' },
  { emoji: '😍', label: 'Любовь', key: 'love' },
  { emoji: '😡', label: 'Злость', key: 'angry' },
  { emoji: '🥳', label: 'Праздник', key: 'party' },
  { emoji: '😂', label: 'Смех', key: 'laugh' },
  { emoji: '😮', label: 'Шок', key: 'shock' },
  { emoji: '🙄', label: 'Мда', key: 'eyeroll' },
  { emoji: '😎', label: 'Круто', key: 'cool' },
  { emoji: '👎', label: 'Дизлайк', key: 'dislike' },
];

export const GIF_ITEMS: GifItem[] = [
  {
    id: 'rock_eyebrow',
    url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
    title: 'The Rock Eyebrow',
    tags: ['rock', 'скала', 'бровь', 'eyebrow', 'meme', 'мем', 'shock', 'шок', 'взгляд'],
    reaction: '😮',
    aspectRatio: 1.33,
  },
  {
    id: 'rock_cool',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    title: 'The Rock Sigma',
    tags: ['rock', 'скала', 'sigma', 'сигма', 'face', 'лицо', 'cool', 'крутой', 'meme'],
    reaction: '😎',
    aspectRatio: 0.9,
  },
  {
    id: 'leo_cheers',
    url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
    title: 'Leonardo Cheers',
    tags: ['leo', 'дикаприо', 'бокал', 'cheers', 'пиво', 'тост', 'за вас', 'drink', 'beer', 'лайк'],
    reaction: '👍',
    aspectRatio: 1.77,
  },
  {
    id: 'laugh_lol',
    url: 'https://media.giphy.com/media/3o72F8t9TDi2xVnxOE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o72F8t9TDi2xVnxOE/giphy.gif',
    title: 'Laughing Man',
    tags: ['laugh', 'смех', 'ржу', 'lol', 'haha', 'хаха', 'ахах', 'funny', 'смешно', 'угарает'],
    reaction: '😂',
    aspectRatio: 1.0,
  },
  {
    id: 'crying_sad',
    url: 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
    title: 'Crying Boy',
    tags: ['cry', 'плачет', 'слезы', 'sad', 'грусть', 'печаль', 'tears', 'обидно', 'жалко'],
    reaction: '😭',
    aspectRatio: 1.25,
  },
  {
    id: 'party_dance',
    url: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
    title: 'Party Dance',
    tags: ['party', 'вечеринка', 'туса', 'пляс', 'dance', 'танец', 'ура', 'celebrate', 'праздник'],
    reaction: '🥳',
    aspectRatio: 1.0,
  },
  {
    id: 'kermit_tea',
    url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    title: 'Kermit Tea',
    tags: ['tea', 'чай', 'кермит', 'kermit', 'thinking', 'думаю', 'хм', 'подозрительно', 'judge'],
    reaction: '🤔',
    aspectRatio: 1.33,
  },
  {
    id: 'shocked_blink',
    url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
    title: 'Blinking Guy',
    tags: ['shock', 'шок', 'моргает', 'blink', 'what', 'что', 'confused', 'непонял', 'офигел'],
    reaction: '😮',
    aspectRatio: 1.0,
  },
  {
    id: 'cat_cute_love',
    url: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
    title: 'Cute Cat Love',
    tags: ['cat', 'кот', 'котик', 'cute', 'милый', 'love', 'любовь', 'няшка', 'сердечки', 'kitty'],
    reaction: '😍',
    aspectRatio: 1.25,
  },
  {
    id: 'doge_cool',
    url: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
    title: 'Doge Cool',
    tags: ['doge', 'доге', 'собака', 'dog', 'cool', 'очки', 'glasses', 'мем', 'крутой'],
    reaction: '😎',
    aspectRatio: 1.0,
  },
  {
    id: 'ronaldo_drink',
    url: 'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/9Y5BbDSkSTiY8/giphy.gif',
    title: 'Ronaldo Drink',
    tags: ['ronaldo', 'роналду', 'вода', 'drink', 'water', 'siu', 'криштиану', 'одобрение', 'лайк'],
    reaction: '👍',
    aspectRatio: 0.8,
  },
  {
    id: 'thumbs_down_no',
    url: 'https://media.giphy.com/media/ISOckXUybVfQ4/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ISOckXUybVfQ4/giphy.gif',
    title: 'Dislike No',
    tags: ['dislike', 'дизлайк', 'нет', 'no', 'nope', 'фу', 'отстой', 'минус', 'thumbs down'],
    reaction: '👎',
    aspectRatio: 1.2,
  },
  {
    id: 'cat_crying_sad',
    url: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/MDJ9IbxxvDUQM/giphy.gif',
    title: 'Crying Kitten',
    tags: ['cat', 'кот', 'плачет', 'crying', 'котёнок', 'слезки', 'sad', 'грустно', 'жалко'],
    reaction: '😭',
    aspectRatio: 1.0,
  },
  {
    id: 'trump_laugh',
    url: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    title: 'Trump Laughing',
    tags: ['trump', 'трамп', 'laugh', 'смех', 'lol', 'ржач', 'smile', 'улыбка', 'funny'],
    reaction: '😂',
    aspectRatio: 1.33,
  },
  {
    id: 'cat_vibing',
    url: 'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif',
    title: 'Cat Vibing',
    tags: ['cat', 'кот', 'качает', 'музыка', 'vibe', 'vibing', 'танец', 'круто', 'кайф'],
    reaction: '😎',
    aspectRatio: 1.1,
  },
  {
    id: 'travolta_confused',
    url: 'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
    title: 'Confused Travolta',
    tags: ['travolta', 'траволта', 'где', 'непонял', 'confused', 'что', 'потерялся', 'мем'],
    reaction: '🙄',
    aspectRatio: 1.4,
  },
  {
    id: 'rickroll_dance',
    url: 'https://media.giphy.com/media/Ju7l5y9osyymQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Ju7l5y9osyymQ/giphy.gif',
    title: 'Rickroll',
    tags: ['rick', 'rickroll', 'рик', 'рикролл', 'never gonna give you up', 'dance', 'танец'],
    reaction: '🥳',
    aspectRatio: 1.33,
  },
  {
    id: 'cat_zoom',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    title: 'Cat Zoom',
    tags: ['cat', 'кот', 'zoom', 'взгляд', 'шок', 'смотрит', 'thinking', 'подозрение'],
    reaction: '🤔',
    aspectRatio: 1.0,
  },
];

export const SPOTTY_STICKER_PACK: StickerPack = {
  id: 'spotty',
  title: 'Spotty',
  author: 'Telegram',
  avatarUrl: './stickers/SpottyAnimated/file_3298489.webp',
  stickers: Array.from({ length: 49 }, (_, i) => {
    const fileId = 3298489 + i;
    return {
      id: `spotty_${fileId}`,
      url: `./stickers/SpottyAnimated/file_${fileId}.tgs`,
      thumbUrl: `./stickers/SpottyAnimated/file_${fileId}.webp`,
      packId: 'spotty',
      name: `Spotty ${i + 1}`,
      tags: ['spotty', 'спотти', 'dog', 'собака', 'пес', 'telegram', 'tgs', 'анимация', 'animated'],
    };
  }),
};

export const BISCUIT_STICKER_PACK: StickerPack = {
  id: 'biscuit',
  title: 'Biscuit',
  author: 'Orbita',
  avatarUrl: './stickers/biscuit/biscuit 1.webp',
  stickers: Array.from({ length: 49 }, (_, i) => {
    const num = i + 1;
    return {
      id: `biscuit_${num}`,
      url: `./stickers/biscuit/biscuit ${num}.webp`,
      packId: 'biscuit',
      name: `Biscuit ${num}`,
      tags: ['biscuit', 'бисквит', 'кот', 'котик', 'cat', 'kitten', 'cute', 'милый'],
    };
  }),
};

export const STICKER_PACKS: StickerPack[] = [
  SPOTTY_STICKER_PACK,
  BISCUIT_STICKER_PACK,
];

export function resolveStickerUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const clean = rawUrl.trim();
  if (
    clean.startsWith('http://') ||
    clean.startsWith('https://') ||
    clean.startsWith('data:') ||
    clean.startsWith('blob:')
  ) {
    return clean;
  }
  if (clean.startsWith('./stickers/') || clean.startsWith('/stickers/')) {
    return clean;
  }
  if (clean.startsWith('stickers/')) {
    return `./${clean}`;
  }
  if (clean.includes('SpottyAnimated') || clean.includes('spotty')) {
    const match = clean.match(/file_(\d+)/i) || clean.match(/(\d{7})/);
    if (match) {
      return `./stickers/SpottyAnimated/file_${match[1]}.tgs`;
    }
  }
  if (clean.includes('biscuit')) {
    const match = clean.match(/(\d+)/);
    if (match) {
      return `./stickers/biscuit/biscuit ${match[1]}.webp`;
    }
  }
  if (clean.endsWith('.tgs')) {
    return `./stickers/SpottyAnimated/${clean}`;
  }
  if (clean.endsWith('.webp')) {
    return `./stickers/biscuit/${clean}`;
  }
  return clean;
}

export function searchStickers(query: string): StickerItem[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return STICKER_PACKS.flatMap((p) => p.stickers);
  }
  return STICKER_PACKS.flatMap((p) => p.stickers).filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.packId.toLowerCase().includes(q)
  );
}

export function searchGifs(query: string, reactionKey?: string): GifItem[] {
  const q = query.toLowerCase().trim();
  let results = GIF_ITEMS;

  if (reactionKey && reactionKey !== 'trending') {
    const reactionObj = GIF_REACTIONS.find((r) => r.key === reactionKey);
    if (reactionObj) {
      results = results.filter((g) => g.reaction === reactionObj.emoji);
    }
  }

  if (!q) return results;

  return results.filter(
    (g) =>
      g.title.toLowerCase().includes(q) ||
      g.tags.some((t) => t.toLowerCase().includes(q))
  );
}

const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
const gifCache = new Map<string, GifItem[]>();

const REACTION_QUERIES: Record<string, string> = {
  trending: '',
  thumbs_up: 'thumbs up',
  thinking: 'thinking',
  love: 'love hearts',
  angry: 'angry rage',
  party: 'party celebration',
  laugh: 'laugh lol haha meme',
  shock: 'shock wow omg',
  eyeroll: 'eye roll whatever',
  cool: 'cool deal with it sigma',
  dislike: 'dislike no thumbs down',
};

const TENOR_API_KEY = 'LIVDSRZULELA';

export async function fetchGifsOnline(query: string, reactionKey?: string, limit: number = 60): Promise<GifItem[]> {
  const trimmed = query.trim();
  const reaction = reactionKey || 'trending';
  const cacheKey = `${trimmed}::${reaction}::${limit}`;

  if (gifCache.has(cacheKey)) {
    return gifCache.get(cacheKey)!;
  }

  let searchQuery = trimmed;
  if (!searchQuery && reaction !== 'trending') {
    searchQuery = REACTION_QUERIES[reaction] || reaction;
  }

  let tenorUrl = '';
  if (searchQuery) {
    tenorUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${TENOR_API_KEY}&limit=${limit}&client_key=orbita_desktop`;
  } else {
    tenorUrl = `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=${limit}&client_key=orbita_desktop`;
  }

  try {
    const res = await fetch(tenorUrl);
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.results) && json.results.length > 0) {
        const items: GifItem[] = json.results.map((item: any) => {
          const formats = item.media_formats || {};
          const mp4Obj = formats.mp4 || formats.tinymp4 || formats.nanomp4 || {};
          const webpObj = formats.tinywebp || formats.webp || formats.tinygif || formats.gif || {};

          const dims = mp4Obj.dims || webpObj.dims || [200, 200];
          const width = Number(dims[0]) || 200;
          const height = Number(dims[1]) || 200;

          const bestUrl = mp4Obj.url || webpObj.url || formats.gif?.url || '';
          const bestPreview = webpObj.url || formats.tinygif?.url || formats.gif?.url || bestUrl;

          return {
            id: String(item.id),
            url: bestUrl,
            previewUrl: bestPreview,
            title: item.title || item.content_description || searchQuery || 'GIF',
            tags: item.tags || [searchQuery || ''],
            aspectRatio: width / height,
          };
        });

        gifCache.set(cacheKey, items);
        return items;
      }
    }
  } catch (err) {
    console.warn('[Tenor] Failed to fetch online GIFs, falling back to Giphy:', err);
  }

  let giphyUrl = '';
  if (searchQuery) {
    giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=${limit}&rating=g`;
  } else {
    giphyUrl = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`;
  }

  try {
    const res = await fetch(giphyUrl);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const json = await res.json();
    if (json && Array.isArray(json.data) && json.data.length > 0) {
      const items: GifItem[] = json.data.map((item: any) => {
        const fixed = item.images?.fixed_height || item.images?.fixed_width || item.images?.downsized || {};
        const original = item.images?.original || item.images?.downsized_medium || fixed;
        const width = Number(fixed.width) || 200;
        const height = Number(fixed.height) || 200;

        let bestUrl = original.mp4 || original.webp || fixed.mp4 || fixed.webp || original.url;
        if (bestUrl && bestUrl.includes('giphy.com') && bestUrl.endsWith('.gif')) {
          bestUrl = bestUrl.replace(/\/giphy\.gif$/i, '/giphy.mp4').replace(/\.gif$/i, '.mp4');
        }
        const bestPreview = fixed.webp || fixed.url || original.webp || original.url || fixed.mp4 || original.mp4;

        return {
          id: String(item.id),
          url: bestUrl,
          previewUrl: bestPreview,
          title: item.title || searchQuery || 'GIF',
          tags: [item.title || '', item.slug || ''],
          aspectRatio: width / height,
        };
      });

      gifCache.set(cacheKey, items);
      return items;
    }
  } catch (err) {
    console.warn('[GIPHY] Failed to fetch online GIFs, falling back to local list:', err);
  }

  return searchGifs(query, reactionKey);
}

