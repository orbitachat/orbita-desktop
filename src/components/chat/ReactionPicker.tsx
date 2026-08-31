// src/components/chat/ReactionPicker.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import {
  EMOJI_CATEGORIES,
  categoryLabels,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}

const COLUMNS = 7;
const EMOJI_SIZE = 34;
const GAP = 4;
const PADDING = 4;
const PICKER_WIDTH = COLUMNS * EMOJI_SIZE + (COLUMNS - 1) * GAP + 2 * PADDING + 12; // ~265px
const PICKER_HEIGHT = 330;

type ListItem =
  | { type: 'header'; category: string }
  | { type: 'row'; emojis: Emoji[] };

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onSelect,
  onClose,
  anchorEl,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('orbita-recent-reactions');
      return saved ? JSON.parse(saved) : ['❤️', '👍', '🔥', '🥰', '👏'];
    } catch {
      return ['❤️', '👍', '🔥', '🥰', '👏'];
    }
  });

  const handleSelect = useCallback(
    (emojiChar: string) => {
      onSelect(emojiChar);
      setRecentEmojis((prev) => {
        const updated = [emojiChar, ...prev.filter((e) => e !== emojiChar)].slice(0, 14);
        try {
          localStorage.setItem('orbita-recent-reactions', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    },
    [onSelect]
  );

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Close on outside click
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

  const groupedRows = useMemo((): ListItem[] => {
    if (searchQuery.trim()) {
      const results = searchEmojis(searchQuery);
      const rows: ListItem[] = [];
      for (let i = 0; i < results.length; i += COLUMNS) {
        rows.push({ type: 'row', emojis: results.slice(i, i + COLUMNS) });
      }
      return rows;
    }

    const rows: ListItem[] = [];

    // Недавние реакции
    const recent = recentEmojis
      .map((char) => getEmojiByChar(char))
      .filter((e): e is Emoji => e !== null);
    if (recent.length > 0) {
      rows.push({ type: 'header', category: 'recent' });
      for (let i = 0; i < recent.length; i += COLUMNS) {
        rows.push({ type: 'row', emojis: recent.slice(i, i + COLUMNS) });
      }
    }

    // Категории
    for (const categoryId of EMOJI_CATEGORIES) {
      const emojis = getEmojisByCategory(categoryId);
      if (emojis.length === 0) continue;
      rows.push({ type: 'header', category: categoryId });
      for (let i = 0; i < emojis.length; i += COLUMNS) {
        rows.push({ type: 'row', emojis: emojis.slice(i, i + COLUMNS) });
      }
    }

    return rows;
  }, [searchQuery, recentEmojis]);

  const renderItem = (_index: number, item: ListItem) => {
    if (item.type === 'header') {
      const label =
        item.category === 'recent'
          ? 'Недавние'
          : categoryLabels[item.category] || item.category;
      return (
        <div className="px-2 py-1 text-[11px] font-semibold text-white/50 uppercase tracking-wider select-none">
          {label}
        </div>
      );
    }

    return (
      <div
        className="grid px-1"
        style={{
          gridTemplateColumns: `repeat(${COLUMNS}, ${EMOJI_SIZE}px)`,
          gap: GAP,
          padding: `0 ${PADDING}px`,
          contain: 'layout style paint',
        }}
      >
        {item.emojis.map((emoji) => (
          <button
            key={emoji.id}
            type="button"
            onClick={() => handleSelect(emoji.char)}
            className="emoji-font flex items-center justify-center active:scale-90"
            style={{ width: EMOJI_SIZE, height: EMOJI_SIZE, fontSize: '20px', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
          >
            {emoji.char}
          </button>
        ))}
      </div>
    );
  };

  const positionStyle = useMemo(() => {
    if (!anchorEl) {
      return { top: 0, left: 0 };
    }

    const rect = anchorEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - PICKER_HEIGHT - 8;

    if (left + PICKER_WIDTH > window.innerWidth) {
      left = window.innerWidth - PICKER_WIDTH - 12;
    }
    if (left < 12) {
      left = 12;
    }

    if (top < 12) {
      top = rect.bottom + 8;
    }

    return { top, left };
  }, [anchorEl]);

  return (
    <AnimatePresence>
      <motion.div
        ref={pickerRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          top: positionStyle.top,
          left: positionStyle.left,
          width: `${PICKER_WIDTH}px`,
          height: `${PICKER_HEIGHT}px`,
          zIndex: 99999,
          backgroundColor: 'var(--surface-container-strong, #1f1b2e)',
          borderRadius: '16px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Поисковая строка */}
        <div className="px-2.5 pt-2 pb-1 flex-shrink-0 flex flex-col gap-1.5">
          <div className="relative flex items-center bg-white/10 rounded-full px-2.5 py-1 border border-white/5">
            <Search size={14} className="text-white/40 mr-1.5 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск"
              className="w-full bg-transparent border-none outline-none text-xs text-white placeholder:text-white/30"
              style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            />
          </div>
        </div>

        {/* Область виртуализации реакций */}
        <div className="flex-1 overflow-hidden px-1 py-1" style={{ overflowX: 'hidden' }}>
          {groupedRows.length === 0 ? (
            <div className="flex items-center justify-center py-4 text-white/40 text-xs">
              Ничего не найдено
            </div>
          ) : (
            <Virtuoso
              style={{ height: '100%', width: '100%', willChange: 'transform' }}
              data={groupedRows}
              itemContent={renderItem}
              increaseViewportBy={300}
              initialTopMostItemIndex={0}
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
