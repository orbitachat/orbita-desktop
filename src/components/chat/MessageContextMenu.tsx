import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Copy, Image as ImageIcon, Download as DownloadIcon,
  CheckCircle, Trash, ChevronDown, Search
} from 'lucide-react';
import {
  EMOJI_CATEGORIES,
  getEmojisByCategory,
  searchEmojis,
  getEmojiByChar,
  Emoji,
} from '../../lib/emoji-data';
import {
  CustomPinIcon,
  CustomUnpinIcon,
  CustomEditIcon,
  CustomReplyIcon
} from './ChatIcons';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  messageIndex: number;
  messageId?: string;
  isOwn: boolean;
  type: 'text' | 'singleImage' | 'multipleImages' | 'file' | 'sticker';
  hasMultipleImages: boolean;
}

export const QUICK_REACTIONS = ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];

export const clampMenuPosition = (
  x: number,
  y: number,
  menuWidth = 224,
  menuHeight = 280
) => {
  const { innerWidth, innerHeight } = window;
  let adjustedX = x;
  let adjustedY = y;

  const OFFSET_FROM_SIDE = 24;

  if (x + menuWidth > innerWidth - OFFSET_FROM_SIDE) adjustedX = innerWidth - menuWidth - OFFSET_FROM_SIDE;
  if (y + menuHeight > innerHeight - 16) adjustedY = innerHeight - menuHeight - 16;
  if (adjustedX < OFFSET_FROM_SIDE) adjustedX = OFFSET_FROM_SIDE;
  if (adjustedY < 16) adjustedY = 16;

  return { x: adjustedX, y: adjustedY };
};

interface QuickReactionHeaderProps {
  onSelectReaction?: (emoji: string) => void;
  onCloseMenu: () => void;
  isExpanded: boolean;
  setIsExpanded: (val: boolean) => void;
  expandedHeight?: number;
}

export const QuickReactionHeader: React.FC<QuickReactionHeaderProps> = ({
  onSelectReaction,
  onCloseMenu,
  isExpanded,
  setIsExpanded,
  expandedHeight = 230,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(96);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('orbita-recent-reactions');
      return saved ? JSON.parse(saved) : ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];
    } catch {
      return ['❤️‍🔥', '👍', '❤️', '👎', '🔥'];
    }
  });

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelectReaction?.(emoji);
      setRecentEmojis((prev) => {
        const updated = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 14);
        try {
          localStorage.setItem('orbita-recent-reactions', JSON.stringify(updated));
        } catch { }
        return updated;
      });
      onCloseMenu();
    },
    [onSelectReaction, onCloseMenu]
  );

  useEffect(() => {
    if (!isExpanded) {
      setDisplayLimit(96);
      setSearchQuery('');
    } else if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isExpanded]);

  const allEmojisList = useMemo(() => {
    if (!isExpanded) return [];
    if (searchQuery.trim()) {
      return searchEmojis(searchQuery);
    }
    const list: Emoji[] = [];
    const seen = new Set<string>();
    for (const char of recentEmojis) {
      const em = getEmojiByChar(char);
      if (em && !seen.has(em.id)) {
        seen.add(em.id);
        list.push(em);
      }
    }
    for (const catId of EMOJI_CATEGORIES) {
      const emojis = getEmojisByCategory(catId);
      for (const em of emojis) {
        if (!seen.has(em.id)) {
          seen.add(em.id);
          list.push(em);
        }
      }
    }
    return list;
  }, [isExpanded, searchQuery, recentEmojis]);

  const displayedEmojis = useMemo(() => {
    if (searchQuery.trim()) return allEmojisList;
    return allEmojisList.slice(0, displayLimit);
  }, [allEmojisList, searchQuery, displayLimit]);

  const handleGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      setDisplayLimit((prev) => Math.min(allEmojisList.length, prev + 60));
    }
  }, [allEmojisList.length]);

  return (
    <motion.div
      initial={false}
      animate={{
        height: isExpanded ? expandedHeight : 40,
        borderRadius: '8px',
      }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="relative backdrop-blur-xl select-none overflow-hidden flex flex-col"
      style={{
        width: '224px',
        backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
        border: 'none',
        boxShadow: 'none',
        marginBottom: isExpanded ? '0px' : '10px',
        willChange: 'height',
      }}
    >
      <AnimatePresence initial={false}>
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="absolute top-0 left-0 flex items-center justify-between px-2.5 py-1.5 w-full h-[40px]"
          >
            {QUICK_REACTIONS.slice(0, 5).map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelect(emoji)}
                className="emoji-font text-base flex items-center justify-center active:scale-95 flex-shrink-0 cursor-pointer"
                style={{
                  lineHeight: 1,
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  userSelect: 'none',
                }}
              >
                {emoji}
              </button>
            ))}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(true);
              }}
              aria-label={t('common.expand', 'Развернуть')}
              className="w-7 h-7 rounded-full active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
              style={{
                cursor: 'pointer',
                backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                color: 'var(--text-main, #ffffff)',
                border: 'none',
              }}
            >
              <ChevronDown size={14} />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="flex flex-col h-full w-full p-2 overflow-hidden"
          >
            <div className="flex items-center gap-1 mb-2 flex-shrink-0">
              <div
                className="relative flex-1 flex items-center rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                  border: '1px solid var(--border-color, rgba(128,128,128,0.2))',
                }}
              >
                <Search size={14} style={{ color: 'var(--text-dim, #8e8e93)' }} className="mr-1.5 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full bg-transparent border-none outline-none text-xs"
                  style={{
                    color: 'var(--text-main)',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(false);
                }}
                aria-label={t('common.collapse', 'Свернуть')}
                className="w-7 h-7 rounded-full active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
                style={{
                  cursor: 'pointer',
                  backgroundColor: 'var(--surface-container, rgba(128,128,128,0.15))',
                  color: 'var(--text-main, #ffffff)',
                  border: 'none',
                }}
              >
                <ChevronDown size={14} className="rotate-180" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-0.5 custom-chat-scrollbar"
              onScroll={handleGridScroll}
            >
              <div className="grid grid-cols-6 gap-1 justify-items-center">
                {displayedEmojis.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    onClick={() => handleSelect(emoji.char)}
                    className="emoji-font flex items-center justify-center active:scale-95 cursor-pointer"
                    style={{ width: 31, height: 31, fontSize: '18px', border: 'none', background: 'none', padding: 0 }}
                  >
                    {emoji.char}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface MessageContextMenuProps {
  menu: ContextMenuState;
  setMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  isPinned: boolean;
  onCopy?: () => void;
  onCopyImage?: () => void;
  onSaveAs?: () => void;
  onSelect: () => void;
  onSelectReaction?: (emoji: string) => void;
  canManageMessages?: boolean;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  menu,
  setMenu,
  onReply,
  onEdit,
  onPin,
  onDelete,
  isPinned,
  onCopy,
  onCopyImage,
  onSaveAs,
  onSelect,
  onSelectReaction,
  canManageMessages,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    if (menu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menu.visible, setMenu]);

  if (!menu.visible) return null;

  const close = () => setMenu((prev) => ({ ...prev, visible: false }));

  const iconColor = 'var(--text-main)';
  const baseBtnClass =
    'w-full flex items-center gap-2.5 px-3.5 py-1.5 text-[13px] font-normal normal-case transition-colors hover:bg-[var(--surface-container-strong)] rounded-none cursor-pointer';
  const baseBtnStyle = { color: 'var(--text-main)' };

  const items: { label: string; onClick: () => void; icon: React.ReactNode }[] = [];

  if (canManageMessages !== false) {
    items.push({
      label: t('common.reply'),
      onClick: onReply,
      icon: <CustomReplyIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false && menu.isOwn && menu.type === 'text') {
    items.push({
      label: t('common.edit'),
      onClick: onEdit,
      icon: <CustomEditIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: isPinned ? t('common.unpin') : t('common.pin'),
      onClick: onPin,
      icon: isPinned ? (
        <CustomUnpinIcon size={16} style={{ color: iconColor }} />
      ) : (
        <CustomPinIcon size={16} style={{ color: iconColor }} />
      ),
    });
  }

  if (menu.type === 'text') {
    items.push({
      label: t('common.copy'),
      onClick: onCopy || close,
      icon: <Copy size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'singleImage') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
    items.push({
      label: t('chatWindow.copy_image'),
      onClick: onCopyImage || close,
      icon: <ImageIcon size={16} style={{ color: iconColor }} />,
    });
  } else if (menu.type === 'multipleImages' || menu.type === 'file') {
    items.push({
      label: t('chatWindow.save_image_as'),
      onClick: onSaveAs || close,
      icon: <DownloadIcon size={16} style={{ color: iconColor }} />,
    });
  }

  if (canManageMessages !== false) {
    items.push({
      label: t('common.delete'),
      onClick: onDelete,
      icon: <Trash size={16} style={{ color: iconColor }} />,
    });
  }

  items.push({
    label: t('common.select'),
    onClick: onSelect,
    icon: <CheckCircle size={16} style={{ color: iconColor }} />,
  });

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[300] select-none"
      style={{
        left: menu.x,
        top: menu.y,
        transformOrigin: 'top left',
        width: '224px',
      }}
    >
      <motion.div
        ref={menuCardRef}
        animate={{
          opacity: isExpanded ? 0 : 1,
          pointerEvents: isExpanded ? 'none' : 'auto',
        }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="backdrop-blur-xl select-none overflow-hidden py-1 absolute top-[50px] left-0 z-[1]"
        style={{
          width: '224px',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          borderRadius: '8px',
          border: 'none',
          boxShadow: 'none',
        }}
      >
        {items.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              item.onClick();
              close();
            }}
            className={baseBtnClass}
            style={baseBtnStyle}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>
              {item.icon}
            </span>
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        ))}
      </motion.div>

      <div className="relative z-[2]">
        <QuickReactionHeader
          onSelectReaction={onSelectReaction}
          onCloseMenu={close}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
          expandedHeight={230}
        />
      </div>
    </motion.div>
  );
};
