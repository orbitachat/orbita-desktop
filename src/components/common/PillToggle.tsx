import { memo } from 'react';

export const PillToggle = memo(({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => (
  <div
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) onChange();
    }}
    style={{
      width: '42px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: checked ? 'var(--accent-color, #5c54e5)' : 'var(--switch-bg, rgba(255,255,255,0.14))',
      boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--switch-border, rgba(255,255,255,0.22))',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 200ms ease, box-shadow 200ms ease',
      flexShrink: 0,
      boxSizing: 'border-box',
      opacity: disabled ? 0.38 : 1,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        transition: 'left 200ms cubic-bezier(0.2,0,0,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }}
    />
  </div>
));
