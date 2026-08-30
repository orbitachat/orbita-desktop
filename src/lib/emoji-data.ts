// src/lib/emoji-data.ts
import data from '@emoji-mart/data';

// Типы, соответствующие РЕАЛЬНОЙ структуре данных @emoji-mart/data
interface EmojiMartSkin {
  unified: string;
  native: string;
  x?: number;
  y?: number;
  shortcodes?: string;
}

interface EmojiMartEmoji {
  id: string;
  name: string;
  keywords: string[];
  skins: EmojiMartSkin[];
  emoticons?: string[];
  version?: number;
}

interface EmojiMartCategory {
  id: string;
  emojis: string[]; // массив id эмодзи
}

// Приводим импорт к известной структуре
const typedData = data as {
  emojis: Record<string, EmojiMartEmoji>;
  categories: EmojiMartCategory[];
};

export interface Emoji {
  char: string;
  id: string;
  name: string;
  category: string;
  keywords: string[];
  codepoint?: string;
}

// Кеш для поиска
const searchCache = new Map<string, Emoji[]>();

// Строим карту id -> categoryId один раз, чтобы category у эмодзи была настоящей,
// а не пустой строкой (пригодится, если понадобится фильтрация по категории напрямую)
const emojiIdToCategory = new Map<string, string>();
for (const cat of typedData.categories) {
  for (const emojiId of cat.emojis) {
    emojiIdToCategory.set(emojiId, cat.id);
  }
}

// Все эмодзи, преобразованные в наш внутренний формат
// Фильтруем эмодзи версии 14.0+ (которых нет в AppleColorEmoji.ttf)
const UNSUPPORTED_EMOJIS = new Set([
  '🫥', '🫢', '🫣', '🫠', '🫡', '🥹', '🫤', '🫨', '🩷', '🩵', '🩶',
  '🫸', '🫷', '🪿', '🫎', '🪼', '🪭', '🪮', '🪈', '🪇', '🪻', '🫚',
  '🫛', '🪽', '🪾', '🫅', '🫄', '🫃', '🫦', '🫧', '🪹', '🪺', '🪪',
  '🫗', '🪣', '🪤', '🪘', '🩼', '🩻', '🪒', '🪄', '🪅', '🪆', '🪡',
  '🪢', '🩴', '🪖', '🪗', '🪕', '🪚', '🪛', '🪜', '🪝', '🪞', '🪟',
  '🪠', '🪡'
]);

export const allEmojis: Emoji[] = Object.values(typedData.emojis)
  .filter((raw) => {
    if (!raw.skins || raw.skins.length === 0) return false;
    if (raw.version && raw.version > 13) return false;
    if (UNSUPPORTED_EMOJIS.has(raw.skins[0].native)) return false;
    return true;
  })
  .map((raw) => ({
    char: raw.skins[0].native,
    id: raw.id,
    name: raw.name || raw.id,
    category: emojiIdToCategory.get(raw.id) || '',
    keywords: raw.keywords || [],
    codepoint: raw.skins[0].unified,
  }));

// Индекс id -> Emoji для быстрого доступа (используется в getEmojisByCategory)
const emojiById = new Map<string, Emoji>();
for (const e of allEmojis) {
  emojiById.set(e.id, e);
}

// Индекс char -> Emoji для быстрого доступа (используется в getEmojiByChar)
const emojiByChar = new Map<string, Emoji>();
for (const e of allEmojis) {
  if (!emojiByChar.has(e.char)) {
    emojiByChar.set(e.char, e);
  }
}

// Список идентификаторов категорий
export const EMOJI_CATEGORIES = typedData.categories.map((cat) => cat.id);

// Получение эмодзи по категории
export function getEmojisByCategory(categoryId: string): Emoji[] {
  const category = typedData.categories.find((cat) => cat.id === categoryId);
  if (!category) return [];
  return category.emojis
    .map((id) => emojiById.get(id))
    .filter((e): e is Emoji => e !== undefined);
}

// Поиск по имени и ключевым словам (с кешированием)
export function searchEmojis(query: string): Emoji[] {
  if (!query.trim()) return [];
  const cacheKey = query.toLowerCase();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }
  const lowerQuery = query.toLowerCase();
  const results = allEmojis.filter((e) =>
    e.name.toLowerCase().includes(lowerQuery) ||
    e.keywords.some((k) => k.toLowerCase().includes(lowerQuery))
  );
  searchCache.set(cacheKey, results);
  return results;
}

// Получение эмодзи по символу
export function getEmojiByChar(char: string): Emoji | null {
  return emojiByChar.get(char) || null;
}

// Проверка, состоит ли строка только из эмодзи
export function isEmojiOnly(text: string): boolean {
  if (!text || !text.trim()) return false;
  const emojiRegex = /^\s*(?:[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F300}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]|\s)+$/u;
  return emojiRegex.test(text);
}

// Очистка кеша поиска (необязательно)
export function clearSearchCache(): void {
  searchCache.clear();
}

// Локализованные названия категорий (без эмодзи)
export const categoryLabels: Record<string, string> = {
  smileys: 'Смайлы',
  people: 'Люди',
  animals: 'Животные',
  food: 'Еда',
  activities: 'Активности',
  travel: 'Путешествия',
  objects: 'Предметы',
  symbols: 'Символы',
  flags: 'Флаги',
};