import React from 'react';
import { Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomForwardIcon } from './ChatWindow';

interface SelectionPanelProps {
  selectedCount: number;
  onDelete?: () => void;
  onForward?: () => void;
  onCancel: () => void;
  height: number;
}

export const SelectionPanel: React.FC<SelectionPanelProps> = ({
  selectedCount,
  onDelete,
  onForward,
  onCancel,
  height,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
        borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label={t('common.delete')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--accent-color)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '6px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <Trash size={18} />
            {t('common.delete')}
          </button>
        )}

        {onForward && (
          <button
            onClick={onForward}
            aria-label={t('common.forward')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--surface-container-high, rgba(255, 255, 255, 0.08))',
              color: 'var(--text-main, #ffffff)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
              borderRadius: '10px',
              padding: '6px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-container-high, rgba(255, 255, 255, 0.08))')}
          >
            <CustomForwardIcon size={17} />
            {t('common.forward')}
          </button>
        )}
      </div>

      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main)' }}>
        {t('chatWindow.selected_count', { count: selectedCount }) ||
          `Выбрано: ${selectedCount}`}
      </div>

      <button
        onClick={onCancel}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-main)',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          padding: '8px 12px',
          borderRadius: '8px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = 'transparent')
        }
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};