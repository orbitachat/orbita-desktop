// src/components/chat/InputContextMenu.tsx
import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type FormattingType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'quote'
  | 'monospace'
  | 'spoiler'
  | 'link'
  | 'date'
  | 'clear';

interface InputContextMenuProps {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onFormat: (type: FormattingType) => void;
  hasSelection: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const InputContextMenu: React.FC<InputContextMenuProps> = ({
  x,
  y,
  isOpen,
  onClose,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onSelectAll,
  onFormat,
  hasSelection,
}) => {
  const { t } = useTranslation();
  const [isFormattingHovered, setIsFormattingHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const formattingItemRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ left: x, top: y });
  const [subMenuPos, setSubMenuPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    if (!isOpen) return;

    const windowWidth = window.innerWidth;

    let posX = x;
    // Context menu dimensions
    const menuWidth = 220;
    const menuHeight = 290;

    // ALWAYS position menu ABOVE the click point / input area
    let posY = y - menuHeight - 6;

    if (posX + menuWidth > windowWidth - 10) {
      posX = Math.max(10, windowWidth - menuWidth - 10);
    }
    if (posX < 10) {
      posX = 10;
    }

    if (posY < 10) {
      posY = Math.max(10, y + 6);
    }

    setMenuPos({ left: posX, top: posY });
  }, [x, y, isOpen]);

  useEffect(() => {
    if (isFormattingHovered && formattingItemRef.current) {
      const rect = formattingItemRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const subMenuWidth = 240;
      const subMenuHeight = 310;

      let subX = rect.right - 2;
      if (subX + subMenuWidth > windowWidth - 10) {
        subX = rect.left - subMenuWidth + 2;
      }

      // Position sub-menu so it grows upwards and stays inside screen
      let subY = rect.bottom - subMenuHeight;
      if (subY + subMenuHeight > windowHeight - 10) {
        subY = Math.max(10, windowHeight - subMenuHeight - 10);
      }
      if (subY < 10) {
        subY = 10;
      }

      setSubMenuPos({ left: subX, top: subY });
    }
  }, [isFormattingHovered]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const MenuItem = ({
    label,
    onClick,
    disabled = false,
    danger = false,
    keepOpen = false,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
    keepOpen?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick();
          if (!keepOpen) {
            onClose();
          }
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '7px 14px',
        fontSize: '13.5px',
        fontWeight: 400,
        color: disabled
          ? 'var(--text-dim, rgba(255,255,255,0.3))'
          : danger
          ? '#ef4444'
          : 'var(--text-main, #f1f5f9)',
        background: 'none',
        border: 'none',
        borderRadius: '6px',
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        transition: 'background-color 0.12s ease',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <span>{label}</span>
    </button>
  );

  const Separator = () => (
    <div
      style={{
        height: '1px',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        margin: '4px 0',
      }}
    />
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${menuPos.left}px`,
        top: `${menuPos.top}px`,
        zIndex: 9999,
        minWidth: '180px',
        backgroundColor: 'var(--bg-secondary, #252836)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        borderRadius: '8px',
        border: 'none',
        boxShadow: '0 10px 32px rgba(0, 0, 0, 0.55)',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <MenuItem label={t('inputContextMenu.undo')} onClick={onUndo} />
      <MenuItem label={t('inputContextMenu.redo')} onClick={onRedo} />

      <Separator />

      <MenuItem label={t('inputContextMenu.cut')} onClick={onCut} disabled={!hasSelection} />
      <MenuItem label={t('inputContextMenu.copy')} onClick={onCopy} disabled={!hasSelection} />
      <MenuItem label={t('inputContextMenu.paste')} onClick={onPaste} />
      <MenuItem label={t('inputContextMenu.delete')} onClick={onDelete} disabled={!hasSelection} danger />

      <Separator />

      {/* Formatting Item with Sub-menu */}
      <div
        ref={formattingItemRef}
        style={{ position: 'relative', width: '100%' }}
        onMouseEnter={() => setIsFormattingHovered(true)}
        onMouseLeave={() => setIsFormattingHovered(false)}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '7px 14px',
            fontSize: '13.5px',
            fontWeight: 400,
            color: 'var(--text-main, #f1f5f9)',
            backgroundColor: isFormattingHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            borderRadius: '6px',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'background-color 0.12s ease',
          }}
          onClick={() => setIsFormattingHovered(!isFormattingHovered)}
        >
          <span>{t('inputContextMenu.formatting')}</span>
          <ChevronRight size={16} style={{ color: 'var(--text-dim, rgba(255,255,255,0.45))' }} />
        </div>

        {/* Sub-menu */}
        {isFormattingHovered && (
          <div
            style={{
              position: 'fixed',
              left: `${subMenuPos.left}px`,
              top: `${subMenuPos.top}px`,
              zIndex: 10000,
              minWidth: '190px',
              backgroundColor: 'var(--bg-secondary, #252836)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 10px 32px rgba(0, 0, 0, 0.55)',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
            }}
            onMouseEnter={() => setIsFormattingHovered(true)}
            onMouseLeave={() => setIsFormattingHovered(false)}
          >
            <MenuItem label={t('inputContextMenu.bold')} onClick={() => onFormat('bold')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.italic')} onClick={() => onFormat('italic')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.underline')} onClick={() => onFormat('underline')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.strikethrough')} onClick={() => onFormat('strikethrough')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.quote')} onClick={() => onFormat('quote')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.monospace')} onClick={() => onFormat('monospace')} keepOpen={true} />
            <MenuItem label={t('inputContextMenu.spoiler')} onClick={() => onFormat('spoiler')} keepOpen={true} />

            <Separator />

            <MenuItem label={t('inputContextMenu.add_link')} onClick={() => onFormat('link')} />
            <MenuItem label={t('inputContextMenu.date')} onClick={() => onFormat('date')} keepOpen={true} />

            <Separator />

            <MenuItem label={t('inputContextMenu.clear_formatting')} onClick={() => onFormat('clear')} keepOpen={true} />
          </div>
        )}
      </div>

      <Separator />

      <MenuItem label={t('inputContextMenu.select_all')} onClick={onSelectAll} keepOpen={true} />
    </div>
  );
};
