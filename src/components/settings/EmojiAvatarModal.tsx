import React, { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';
import { allEmojis, type Emoji } from '../../lib/emoji-data';
import { AVATAR_GRADIENTS } from '../common/Avatar';

interface EmojiAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const GRADIENTS = AVATAR_GRADIENTS;

export const EmojiAvatarModal: React.FC<EmojiAvatarModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [selectedGradient, setSelectedGradient] = useState(GRADIENTS[6]);
  const [selectedEmoji, setSelectedEmoji] = useState('🎁');

  const emojiRows = useMemo(() => {
    const rows: Emoji[][] = [];
    for (let i = 0; i < allEmojis.length; i += 9) {
      rows.push(allEmojis.slice(i, i + 9));
    }
    return rows;
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      const size = 512;
      const center = size / 2;
      const radius = center - 1.5;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const colors = selectedGradient.match(/#[0-9a-fA-F]{3,6}|rgba?\([^)]+\)/g) || ['#a855f7', '#ec4899'];
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, colors[0]);
      grad.addColorStop(1, colors[1] || colors[0]);

      const offCanvas = document.createElement('canvas');
      offCanvas.width = size;
      offCanvas.height = size;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      let offsetX = 0;
      let offsetY = 0;

      if (offCtx) {
        offCtx.font = '295px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.fillText(selectedEmoji, center, center);

        try {
          const imgData = offCtx.getImageData(0, 0, size, size);
          const data = imgData.data;
          let minX = size, maxX = 0, minY = size, maxY = 0;
          let hasPixels = false;

          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const alpha = data[(y * size + x) * 4 + 3];
              if (alpha > 15) {
                hasPixels = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (hasPixels) {
            const actualCenterX = (minX + maxX) / 2;
            const actualCenterY = (minY + maxY) / 2;
            offsetX = center - actualCenterX;
            offsetY = center - actualCenterY;
          }
        } catch (e) {}
      }

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.font = '295px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(selectedEmoji, center + offsetX, center + offsetY);

      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
      onClose();
    } catch (err) {
      console.error('Failed to generate emoji avatar:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          maxHeight: '86vh',
          backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
          borderRadius: '10px',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'scaleUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px 4px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-main, #fff)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '8px',
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main, #fff)' }}>
            {t('avatar.choose_emoji')}
          </span>

          <button
            type="button"
            onClick={handleSave}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-color, #9b7dd4)',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 8px',
            }}
          >
            {t('avatar.save')}
          </button>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '8px 12px 14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 14px' }}>
            <div
              style={{
                width: '106px',
                height: '106px',
                borderRadius: '50%',
                background: selectedGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              <span
                className="emoji-font"
                style={{
                  fontSize: '60px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  transform: 'translateY(1px)',
                }}
              >
                {selectedEmoji}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              flexWrap: 'wrap',
              marginBottom: '14px',
              padding: '0 2px',
              flexShrink: 0,
            }}
          >
            {GRADIENTS.map((grad, index) => {
              const isSelected = selectedGradient === grad;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedGradient(grad)}
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: grad,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 2.5px #ffffff' : 'none',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    transform: isSelected ? 'scale(1.12)' : 'scale(1)',
                  }}
                />
              );
            })}
          </div>

          <div style={{ flex: 1, height: '240px', width: '100%', overflow: 'hidden' }}>
            <Virtuoso
              style={{ height: '240px', width: '100%' }}
              className="no-scrollbar"
              totalCount={emojiRows.length}
              itemContent={(rowIndex) => {
                const row = emojiRows[rowIndex];
                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(9, minmax(0, 1fr))',
                      gap: '2px',
                      paddingBottom: '3px',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    {row.map((emoji) => {
                      const isSelected = selectedEmoji === emoji.char;
                      return (
                        <button
                          key={emoji.id}
                          type="button"
                          onClick={() => setSelectedEmoji(emoji.char)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            aspectRatio: '1/1',
                            borderRadius: '6px',
                            backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'background-color 0.12s ease',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <span className="emoji-font" style={{ fontSize: '20px', lineHeight: 1 }}>
                            {emoji.char}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
