// src/components/settings/NotificationPreview.tsx
import React from 'react';
import { NotificationPosition } from '../../store/useChatStore';

interface NotificationPreviewProps {
  count: number;
  position: NotificationPosition;
  onPositionChange?: (position: NotificationPosition) => void;
  onCountChange?: (count: number) => void;
}

const POSITIONS: { id: NotificationPosition; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

export const NotificationMonitor: React.FC<NotificationPreviewProps> = ({
  count,
  position,
  onPositionChange,
}) => {
  const getSlotStyle = (pos: NotificationPosition): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      cursor: 'pointer',
      transition: 'transform 150ms ease, opacity 150ms ease',
      zIndex: 2,
    };

    switch (pos) {
      case 'top-left':
        return { ...base, top: '10px', left: '10px' };
      case 'top-center':
        return { ...base, top: '10px', left: '50%', transform: 'translateX(-50%)' };
      case 'top-right':
        return { ...base, top: '10px', right: '10px' };
      case 'bottom-left':
        return { ...base, bottom: '10px', left: '10px' };
      case 'bottom-right':
      default:
        return { ...base, bottom: '10px', right: '10px' };
    }
  };

  const renderStrip = (isSelected: boolean, key: number) => {
    return (
      <div
        key={key}
        style={{
          width: '74px',
          height: '17px',
          borderRadius: '0px',
          backgroundColor: isSelected ? 'var(--bg-secondary, #1b172a)' : 'rgba(28, 24, 42, 0.45)',
          border: isSelected ? '1px solid var(--accent-color, #9b7dd4)' : 'none',
          boxShadow: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: '0 5px',
          gap: '5px',
          boxSizing: 'border-box',
          transition: 'all 150ms ease',
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            backgroundColor: isSelected ? 'var(--accent-color, #a89ec4)' : 'rgba(255, 255, 255, 0.25)',
            flexShrink: 0,
          }}
        />
        {/* Content bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
          <div
            style={{
              width: '85%',
              height: '2px',
              borderRadius: '0px',
              backgroundColor: isSelected ? 'var(--text-main, #ffffff)' : 'rgba(255, 255, 255, 0.3)',
            }}
          />
          <div
            style={{
              width: '60%',
              height: '2px',
              borderRadius: '0px',
              backgroundColor: isSelected ? 'var(--text-dim, #a89ec4)' : 'rgba(255, 255, 255, 0.18)',
            }}
          />
        </div>
        {/* Close dot */}
        <div
          style={{
            width: '2px',
            height: '2px',
            borderRadius: '0px',
            backgroundColor: isSelected ? 'var(--accent-color, #a89ec4)' : 'rgba(255, 255, 255, 0.2)',
            flexShrink: 0,
          }}
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 auto', userSelect: 'none' }}>
      {/* Monitor Outer Chassis */}
      <div
        style={{
          width: '300px',
          height: '175px',
          backgroundColor: '#e3e4e8',
          borderRadius: '12px 12px 6px 6px',
          padding: '8px 8px 14px 8px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.2)',
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Monitor Screen Area */}
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'radial-gradient(ellipse at 50% 50%, var(--bg-secondary, #2a223e) 0%, var(--bg-primary, #151120) 100%)',
            borderRadius: '4px',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 12px rgba(0, 0, 0, 0.45)',
          }}
        >
          {POSITIONS.map((pos) => {
            const isSelected = position === pos.id;
            const itemsCount = isSelected ? Math.max(1, Math.min(5, count)) : 1;

            return (
              <div
                key={pos.id}
                style={getSlotStyle(pos.id)}
                onClick={() => onPositionChange?.(pos.id)}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.opacity = '0.9';
                    (e.currentTarget as HTMLElement).style.transform =
                      pos.id === 'top-center' ? 'translateX(-50%) scale(1.06)' : 'scale(1.06)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                    (e.currentTarget as HTMLElement).style.transform =
                      pos.id === 'top-center' ? 'translateX(-50%)' : 'none';
                  }
                }}
              >
                {Array.from({ length: itemsCount }).map((_, i) =>
                  renderStrip(isSelected, i)
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Monitor Stand Neck */}
      <div
        style={{
          width: '54px',
          height: '24px',
          background: 'linear-gradient(180deg, #6c667c 0%, #3e3a4c 100%)',
          clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
          marginTop: '-1px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      />

      {/* Monitor Stand Base */}
      <div
        style={{
          width: '84px',
          height: '6px',
          background: 'linear-gradient(180deg, #5a5468 0%, #2f2a3a 100%)',
          borderRadius: '0 0 6px 6px',
          boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
};

export const NotificationCountSelector: React.FC<{
  count: number;
  onChange: (count: number) => void;
}> = ({ count, onChange }) => {
  const steps = [1, 2, 3, 4, 5];

  return (
    <div style={{ width: '100%', padding: '0 20px', boxSizing: 'border-box', userSelect: 'none' }}>
      {/* 5 Segment bars */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          width: '100%',
          marginBottom: '10px',
          cursor: 'pointer',
        }}
      >
        {steps.map((n) => {
          const isActive = count === n;
          return (
            <div
              key={n}
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                height: isActive ? '4px' : '3px',
                borderRadius: '2px',
                backgroundColor: isActive ? 'var(--accent-color, #a888f8)' : 'rgba(255, 255, 255, 0.14)',
                boxShadow: isActive ? '0 0 8px rgba(168, 136, 248, 0.4)' : 'none',
                transition: 'all 150ms ease',
                marginTop: isActive ? '0' : '0.5px',
              }}
            />
          );
        })}
      </div>

      {/* Numbers */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          padding: '0 2px',
        }}
      >
        {steps.map((n) => {
          const isActive = count === n;
          return (
            <div
              key={n}
              onClick={() => onChange(n)}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent-color, #a888f8)' : 'rgba(255, 255, 255, 0.45)',
                cursor: 'pointer',
                transition: 'color 150ms ease',
              }}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationMonitor;