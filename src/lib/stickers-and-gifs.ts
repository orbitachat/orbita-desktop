// src/lib/stickers-and-gifs.ts

export interface StickerItem {
  id: string;
  url: string;
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

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'animated_3d',
    title: '3D Эмодзи & Мемы',
    author: '@orbita',
    avatarUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.gif',
    stickers: [
      { id: '3d_love', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.gif', packId: 'animated_3d', name: 'Влюбленный', tags: ['love', 'влюблен', 'сердца'] },
      { id: '3d_laugh', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.gif', packId: 'animated_3d', name: 'Смех до слез', tags: ['laugh', 'смех', 'слезы', 'lol'] },
      { id: '3d_party', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f973/512.gif', packId: 'animated_3d', name: 'Праздник', tags: ['party', 'праздник', 'вечеринка', 'дуделка'] },
      { id: '3d_shock', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f631/512.gif', packId: 'animated_3d', name: 'Крик / Шок', tags: ['shock', 'шок', 'крик', 'страх'] },
      { id: '3d_cool', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60e/512.gif', packId: 'animated_3d', name: 'Крутой', tags: ['cool', 'крутой', 'очки', 'смайл'] },
      { id: '3d_thumbsup', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.gif', packId: 'animated_3d', name: 'Палец вверх', tags: ['like', 'лайк', 'класс', 'супер'] },
      { id: '3d_thumbsdown', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44e/512.gif', packId: 'animated_3d', name: 'Палец вниз', tags: ['dislike', 'дизлайк', 'минус'] },
      { id: '3d_rage', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f621/512.gif', packId: 'animated_3d', name: 'Злость', tags: ['angry', 'злость', 'ярость', 'красный'] },
      { id: '3d_eyebrow', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f928/512.gif', packId: 'animated_3d', name: 'Хм', tags: ['thinking', 'хм', 'подозрение', 'бровь'] },
      { id: '3d_eyeroll', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f644/512.gif', packId: 'animated_3d', name: 'Закатил глаза', tags: ['eyeroll', 'закатил', 'мда', 'нуда'] },
      { id: '3d_100', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4af/512.gif', packId: 'animated_3d', name: '100%', tags: ['100', 'сотня', 'огонь', 'топ'] },
      { id: '3d_fire', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.gif', packId: 'animated_3d', name: 'Огонь', tags: ['fire', 'огонь', 'пламя', 'жара'] },
      { id: '3d_mindblown', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f92f/512.gif', packId: 'animated_3d', name: 'Взрыв мозга', tags: ['mindblown', 'взрыв', 'мозг', 'вау'] },
      { id: '3d_pleading', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f97a/512.gif', packId: 'animated_3d', name: 'Умоляющий', tags: ['pleading', 'пожалуйста', 'глазки', 'мило'] },
      { id: '3d_smirk', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60f/512.gif', packId: 'animated_3d', name: 'Ухмылка', tags: ['smirk', 'ухмылка', 'хитрый'] },
      { id: '3d_devil', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f608/512.gif', packId: 'animated_3d', name: 'Дьяволенок', tags: ['devil', 'черт', 'дьявол', 'злодей'] },
    ],
  },
  {
    id: 'uyutnenko',
    title: 'уютненько',
    author: '@iamgubg',
    avatarUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f43c/512.gif',
    stickers: [
      { id: 'uyut_panda', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f43c/512.gif', packId: 'uyutnenko', name: 'Пандочка', tags: ['panda', 'панда', 'мило'] },
      { id: 'uyut_cat_chubby', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f640/512.gif', packId: 'uyutnenko', name: 'Испуганный кот', tags: ['cat', 'кот', 'шок', 'испуг'] },
      { id: 'uyut_lion', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f981/512.gif', packId: 'uyutnenko', name: 'Лев', tags: ['lion', 'лев', 'грусть'] },
      { id: 'uyut_unicorn', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f984/512.gif', packId: 'uyutnenko', name: 'Единорог', tags: ['unicorn', 'единорог', 'радуга'] },
      { id: 'uyut_dog', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f436/512.gif', packId: 'uyutnenko', name: 'Собачка', tags: ['dog', 'собака', 'щенок'] },
      { id: 'uyut_hamster', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f439/512.gif', packId: 'uyutnenko', name: 'Хомяк', tags: ['hamster', 'хомяк', 'хомячок'] },
      { id: 'uyut_rabbit', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f430/512.gif', packId: 'uyutnenko', name: 'Кролик', tags: ['rabbit', 'кролик', 'зайка'] },
      { id: 'uyut_bear', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f43b/512.gif', packId: 'uyutnenko', name: 'Мишка', tags: ['bear', 'медведь', 'мишка'] },
      { id: 'uyut_fox', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f98a/512.gif', packId: 'uyutnenko', name: 'Лисичка', tags: ['fox', 'лиса', 'хитрая'] },
      { id: 'uyut_sparkles', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2728/512.gif', packId: 'uyutnenko', name: 'Блестки', tags: ['sparkles', 'звезды', 'магия', 'сияние'] },
    ],
  },
  {
    id: 'duck_classic',
    title: 'Уточка Duckling',
    author: '@telegram',
    avatarUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f424/512.gif',
    stickers: [
      { id: 'duck_chick', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f424/512.gif', packId: 'duck_classic', name: 'Цыпленок', tags: ['duck', 'утка', 'цыпленок', 'уточка'] },
      { id: 'duck_quack', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f986/512.gif', packId: 'duck_classic', name: 'Утка', tags: ['duck', 'кря', 'селезень'] },
      { id: 'duck_hatch', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f423/512.gif', packId: 'duck_classic', name: 'Вылупился', tags: ['egg', 'яйцо', 'цыпленок'] },
      { id: 'duck_bird', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f426/512.gif', packId: 'duck_classic', name: 'Птичка', tags: ['bird', 'птица', 'летит'] },
      { id: 'duck_swan', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f9a2/512.gif', packId: 'duck_classic', name: 'Лебедь', tags: ['swan', 'лебедь', 'грация'] },
      { id: 'duck_flamingo', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f9a9/512.gif', packId: 'duck_classic', name: 'Фламинго', tags: ['flamingo', 'розовый', 'птица'] },
      { id: 'duck_owl', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f989/512.gif', packId: 'duck_classic', name: 'Сова', tags: ['owl', 'сова', 'умный'] },
      { id: 'duck_parrot', url: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f99c/512.gif', packId: 'duck_classic', name: 'Попугай', tags: ['parrot', 'попугай', 'яркий'] },
    ],
  },
];

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

  // 1. Primary: Tenor API v2
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

  // 2. Fallback: Giphy API
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

