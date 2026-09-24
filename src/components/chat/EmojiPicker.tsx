import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  EMOJI_CATEGORIES,
  categoryLabels,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';
import {
  GIF_REACTIONS,
  fetchGifsOnline,
  GifItem,
  STICKER_PACKS,
  StickerItem,
  searchStickers,
} from '../../lib/stickers-and-gifs';
import { TgsPlayer } from './TgsPlayer';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectGif?: (gifUrl: string) => void;
  onSelectSticker?: (sticker: StickerItem) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  headerEl?: HTMLElement | null;
  recentEmojis: string[];
  onRecentUpdate: (emoji: string) => void;
  horizontalOffset?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

type TabType = 'emoji' | 'stickers' | 'gif';

const COLUMNS = 9;
const GAP = 2;
const PICKER_WIDTH_DESKTOP = 350;
const PICKER_HEIGHT_DESKTOP = 650;
const MOBILE_BREAKPOINT = 650;
const MOBILE_HEIGHT = 420;

const StickerGridButton: React.FC<{
  sticker: StickerItem;
  onSelect: (s: StickerItem) => void;
}> = ({ sticker, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isTgs = sticker.url.endsWith('.tgs');

  return (
    <button
      type="button"
      onClick={() => onSelect(sticker)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative aspect-square flex items-center justify-center p-1.5 rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer bg-transparent border-0"
      aria-label={sticker.name}
    >
      {isTgs && isHovered ? (
        <TgsPlayer src={sticker.url} loop={true} className="w-full h-full select-none pointer-events-none" />
      ) : (
        <img
          src={sticker.thumbUrl || sticker.url}
          alt=""
          className="w-full h-full object-contain pointer-events-none select-none"
          loading="lazy"
        />
      )}
    </button>
  );
};

export const EmojiPicker = ({
  onSelect,
  onSelectGif,
  onSelectSticker,
  onClose,
  anchorEl,
  headerEl,
  recentEmojis,
  onRecentUpdate,
  onMouseEnter,
  onMouseLeave,
}: EmojiPickerProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('emoji');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGifReaction, setActiveGifReaction] = useState('trending');

  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectEmoji = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onRecentUpdate(emoji);
    },
    [onSelect, onRecentUpdate]
  );

  const handleSelectGifItem = useCallback(
    (gif: GifItem) => {
      if (onSelectGif) {
        let finalUrl = gif.url;
        if (finalUrl && finalUrl.includes('giphy.com') && finalUrl.endsWith('.gif')) {
          finalUrl = finalUrl.replace(/\/giphy\.gif$/i, '/giphy.mp4').replace(/\.gif$/i, '.mp4');
        }
        onSelectGif(finalUrl);
      }
      onClose();
    },
    [onSelectGif, onClose]
  );

  const handleSelectSticker = useCallback(
    (sticker: StickerItem) => {
      if (onSelectSticker) {
        onSelectSticker(sticker);
      }
      onClose();
    },
    [onSelectSticker, onClose]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const positionStyle = useMemo(() => {
    if (isMobile) {
      return {
        position: 'fixed' as const,
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: Math.min(MOBILE_HEIGHT, windowDimensions.height * 0.7),
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      };
    }

    if (!anchorEl) {
      return { top: -9999, left: -9999, width: PICKER_WIDTH_DESKTOP, height: PICKER_HEIGHT_DESKTOP };
    }

    const anchorRect = anchorEl.getBoundingClientRect();

    // 1. Determine header bottom coordinate
    let headerBottom = 86; // fallback: 30px TitleBar + 56px Chat Header
    if (headerEl) {
      const headerRect = headerEl.getBoundingClientRect();
      headerBottom = headerRect.bottom;
    } else {
      const headerDom = document.querySelector('header');
      if (headerDom) {
        headerBottom = headerDom.getBoundingClientRect().bottom;
      }
    }

    const topMargin = 10; // Gap below header
    const bottomMargin = 16; // Gap above input field / emoji button
    const minTop = headerBottom + topMargin;
    const pickerBottom = anchorRect.top - bottomMargin;

    // Available vertical height between header and input area
    const availableHeight = Math.max(160, pickerBottom - minTop);
    const height = Math.min(PICKER_HEIGHT_DESKTOP, availableHeight);
    const top = pickerBottom - height;

    const width = Math.min(PICKER_WIDTH_DESKTOP, windowDimensions.width - 20);
    const left = Math.max(10, windowDimensions.width - width - 10);
    const rightMargin = windowDimensions.width - (left + width);

    return {
      position: 'fixed' as const,
      top,
      left,
      width: width + rightMargin,
      height: height + bottomMargin,
      paddingRight: rightMargin,
      paddingBottom: bottomMargin,
      boxSizing: 'border-box' as const,
    };
  }, [anchorEl, headerEl, isMobile, windowDimensions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [activeTab]);

  const [initialRecentEmojis] = useState(() => recentEmojis);

  const emojiRows = useMemo(() => {
    const rows: any[] = [];
    const q = searchQuery.trim();
    if (q) {
      const results = searchEmojis(q);
      for (let i = 0; i < results.length; i += COLUMNS) {
        rows.push({ type: 'emojis', items: results.slice(i, i + COLUMNS) });
      }
    } else {
      const recent = initialRecentEmojis
        .map((char) => getEmojiByChar(char))
        .filter((e): e is Emoji => e !== null);
      if (recent.length > 0) {
        for (let i = 0; i < recent.length; i += COLUMNS) {
          rows.push({ type: 'emojis', items: recent.slice(i, i + COLUMNS) });
        }
      }
      const categories = EMOJI_CATEGORIES.map((catId) => ({
        id: catId,
        label: categoryLabels[catId] || catId,
        emojis: getEmojisByCategory(catId),
      })).filter((c) => c.emojis.length > 0);

      categories.forEach((cat) => {
        rows.push({ type: 'header', label: cat.label, id: cat.id });
        for (let i = 0; i < cat.emojis.length; i += COLUMNS) {
          rows.push({ type: 'emojis', items: cat.emojis.slice(i, i + COLUMNS) });
        }
      });
    }
    return rows;
  }, [searchQuery, initialRecentEmojis]);

  const [gifs, setGifs] = useState<GifItem[]>([]);
  const [isGifLoading, setIsGifLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'gif') return;

    let isMounted = true;
    setIsGifLoading(true);

    const timer = setTimeout(async () => {
      try {
        const data = await fetchGifsOnline(searchQuery, activeGifReaction, 60);
        if (isMounted) {
          setGifs(data);
          setIsGifLoading(false);
        }
      } catch {
        if (isMounted) setIsGifLoading(false);
      }
    }, searchQuery.trim() ? 250 : 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeTab, searchQuery, activeGifReaction]);

  const gifRows = useMemo(() => {
    const rows: any[] = [];
    for (let i = 0; i < gifs.length; i += 2) {
      rows.push({ type: 'gifs', items: gifs.slice(i, i + 2) });
    }
    return rows;
  }, [gifs]);

  const [renderedEmojiCount, setRenderedEmojiCount] = useState(25);
  const [renderedGifCount, setRenderedGifCount] = useState(12);

  useEffect(() => {
    setRenderedEmojiCount(25);
    setRenderedGifCount(12);
  }, [searchQuery, activeTab]);

  const visibleEmojiRows = useMemo(() => {
    return emojiRows.slice(0, renderedEmojiCount);
  }, [emojiRows, renderedEmojiCount]);

  const visibleGifRows = useMemo(() => {
    return gifRows.slice(0, renderedGifCount);
  }, [gifRows, renderedGifCount]);

  const unrenderedEmojiBottomCount = emojiRows.length - visibleEmojiRows.length;
  const virtualEmojiBottomHeight = unrenderedEmojiBottomCount > 0 ? unrenderedEmojiBottomCount * 36 : 0;

  const unrenderedGifBottomCount = gifRows.length - visibleGifRows.length;
  const virtualGifBottomHeight = unrenderedGifBottomCount > 0 ? unrenderedGifBottomCount * 120 : 0;

  const handleEmojiScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const renderedHeight = renderedEmojiCount * 36;
    if (el.scrollTop + el.clientHeight >= renderedHeight - 350) {
      if (renderedEmojiCount < emojiRows.length) {
        setRenderedEmojiCount((prev) => Math.min(emojiRows.length, prev + 25));
      }
    }
  }, [renderedEmojiCount, emojiRows.length]);

  const handleGifScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const renderedHeight = renderedGifCount * 120;
    if (el.scrollTop + el.clientHeight >= renderedHeight - 350) {
      if (renderedGifCount < gifRows.length) {
        setRenderedGifCount((prev) => Math.min(gifRows.length, prev + 12));
      }
    }
  }, [renderedGifCount, gifRows.length]);

  const filteredStickers = useMemo(() => {
    if (activeTab !== 'stickers') return [];
    const q = searchQuery.trim();
    if (!q) return [];
    return searchStickers(q);
  }, [activeTab, searchQuery]);

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'emoji', label: t('emojiPicker.emojis', 'Эмодзи') },
    { id: 'stickers', label: t('emojiPicker.stickers', 'Стикеры') },
    { id: 'gif', label: t('emojiPicker.gif', 'GIF') },
  ];

  return (
    <motion.div
      ref={pickerRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="fixed z-[350] select-none"
      style={{
        ...positionStyle,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        willChange: 'opacity, transform',
      }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault();
        }
      }}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="w-full h-full border-none overflow-hidden flex flex-col"
        style={{
          borderRadius: 10,
          backgroundColor: 'var(--settings-bg, var(--bg-secondary, #211d2f))',
          boxShadow: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          filter: 'none',
        }}
      >
          <div className="pt-2.5 px-3 pb-1 flex-shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-around relative pb-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSearchQuery('');
                    }}
                    className={`relative py-1 px-4 text-sm font-semibold transition-colors duration-150 ${isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
                      }`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {tab.label}
                    {isActive && (
                      <div
                        className="absolute bottom-[-5px] left-0 right-0 h-[2.5px] rounded-full"
                        style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="relative flex items-center rounded-full px-3 py-1.5 mx-[10px]" style={{ backgroundColor: 'var(--surface-container, rgba(255,255,255,0.08))' }}>
              <Search size={16} className="text-white/40 mr-2 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder={t('emojiPicker.search', 'Поиск')}
                className="w-full bg-transparent border-none outline-none text-sm text-white placeholder:text-white/30"
                style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-white/40 hover:text-white text-xs px-1"
                  aria-label={t('common.cancel', 'Отмена')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden">
            {/* TAB 1: EMOJI (CHUNKED) */}
            {activeTab === 'emoji' && (
              <div
                onScroll={handleEmojiScroll}
                className="custom-chat-scrollbar h-full overflow-y-auto overflow-x-hidden"
                style={{
                  padding: '0 8px 10px 8px',
                  overscrollBehaviorY: 'contain',
                  transform: 'translateZ(0)',
                  willChange: 'scroll-position',
                }}
              >
                {visibleEmojiRows.map((row, idx) => {
                  if (row.type === 'header') {
                    return (
                      <div
                        key={`header-${row.id || idx}`}
                        className="px-1 pt-2.5 pb-1 text-xs font-semibold text-white/40 select-none"
                      >
                        {row.label}
                      </div>
                    );
                  }
                  if (row.type === 'emojis') {
                    return (
                      <div
                        key={`row-${idx}`}
                        className="grid"
                        style={{
                          gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
                          gap: GAP,
                          marginBottom: GAP,
                          contain: 'layout style paint',
                        }}
                      >
                        {row.items.map((emoji: Emoji) => (
                          <button
                            key={emoji.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectEmoji(emoji.char)}
                            className="emoji-font flex items-center justify-center active:opacity-70"
                            style={{
                              fontSize: '21px',
                              aspectRatio: '1 / 1',
                              width: '100%',
                              cursor: 'pointer',
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              lineHeight: 1,
                            }}
                          >
                            {emoji.char}
                          </button>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })}
                {virtualEmojiBottomHeight > 0 && (
                  <div style={{ height: `${virtualEmojiBottomHeight}px`, flexShrink: 0 }} />
                )}
              </div>
            )}

            {activeTab === 'stickers' && (
              <div
                className="custom-chat-scrollbar h-full overflow-y-auto overflow-x-hidden"
                style={{
                  padding: '0 8px 10px 8px',
                  overscrollBehaviorY: 'contain',
                  transform: 'translateZ(0)',
                }}
              >
                {searchQuery.trim() ? (
                  filteredStickers.length === 0 ? (
                    <div className="flex flex-col flex-1 h-full items-center justify-center gap-2 pt-16">
                      <div className="text-white/40 text-sm">{t('emojiPicker.no_stickers_found', 'Стикеры не найдены')}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {filteredStickers.map((sticker) => (
                        <StickerGridButton
                          key={sticker.id}
                          sticker={sticker}
                          onSelect={handleSelectSticker}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  STICKER_PACKS.map((pack) => (
                    <div key={pack.id} className="mb-3" id={`sticker-pack-${pack.id}`}>
                      <div className="px-1 pt-2 pb-1 text-xs font-semibold text-white/40 select-none">
                        {pack.title}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {pack.stickers.map((sticker) => (
                          <StickerGridButton
                            key={sticker.id}
                            sticker={sticker}
                            onSelect={handleSelectSticker}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'gif' && (
              gifRows.length === 0 ? (
                <div className="flex flex-col flex-1 h-full items-center justify-center gap-2">
                  {isGifLoading ? (
                    <div className="text-white/40 text-sm animate-pulse">{t('emojiPicker.loading_gif', 'Загрузка GIF...')}</div>
                  ) : (
                    <div className="text-white/40 text-sm">{t('emojiPicker.no_gifs_found', 'Гифки не найдены')}</div>
                  )}
                </div>
              ) : (
                <div
                  onScroll={handleGifScroll}
                  className="custom-chat-scrollbar h-full overflow-y-auto overflow-x-hidden"
                  style={{
                    padding: `0 10px 10px 10px`,
                    overscrollBehaviorY: 'contain',
                    transform: 'translateZ(0)',
                    willChange: 'scroll-position',
                  }}
                >
                  {visibleGifRows.map((row, idx) => (
                    <div key={`gif-row-${idx}`} className="flex gap-2 mb-2">
                      {row.items.map((gif: GifItem) => (
                        <button
                          key={gif.id}
                          type="button"
                          onClick={() => handleSelectGifItem(gif)}
                          className="relative flex-1 rounded-lg overflow-hidden bg-white/5 active:opacity-70 cursor-pointer"
                          style={{ minHeight: '100px', maxHeight: '140px' }}
                        >
                          <img
                            src={gif.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  ))}
                  {virtualGifBottomHeight > 0 && (
                    <div style={{ height: `${virtualGifBottomHeight}px`, flexShrink: 0 }} />
                  )}
                </div>
              )
            )}
          </div>

          {activeTab !== 'emoji' && (
            <div className="h-10 px-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'var(--surface-container, rgba(0,0,0,0.15))' }}>
              {activeTab === 'stickers' && (
                <div className="flex items-center gap-1.5 overflow-x-auto w-full px-1 scrollbar-none">
                  {STICKER_PACKS.map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`sticker-pack-${pack.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="w-7 h-7 rounded-md overflow-hidden p-0.5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 bg-transparent border-0 cursor-pointer"
                      aria-label={pack.title}
                    >
                      <img src={pack.avatarUrl} alt="" className="w-full h-full object-contain pointer-events-none" />
                    </button>
                  ))}
                  <button
                    type="button"
                    className="p-1 text-white/50 hover:text-white transition-colors flex-shrink-0 ml-auto bg-transparent border-0 cursor-pointer"
                    aria-label={t('emojiPicker.sticker_settings', 'Настройки стикеров')}
                  >
                    <Settings size={16} />
                  </button>
                </div>
              )}

              {activeTab === 'gif' && (
                <div className="flex items-center justify-between w-full px-1 overflow-x-auto scrollbar-none gap-1">
                  {GIF_REACTIONS.map((r) => {
                    const isSelected = activeGifReaction === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setActiveGifReaction(r.key);
                          setSearchQuery('');
                        }}
                        className={`text-sm px-1.5 py-0.5 rounded transition-all flex-shrink-0 ${isSelected ? 'bg-white/20 scale-110' : 'opacity-60 hover:opacity-100'
                          }`}
                        aria-label={r.label}
                      >
                        {r.emoji}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
  );
};