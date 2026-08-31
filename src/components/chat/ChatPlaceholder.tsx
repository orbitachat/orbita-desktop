// src/components/chat/ChatPlaceholder.tsx
import { useTranslation } from 'react-i18next';

export const ChatPlaceholder = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full items-center justify-center select-none px-4">
      <div
        style={{
          backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.06))',
          color: 'var(--text-dim, #9f96b3)',
          fontSize: '13px',
          fontWeight: 500,
          padding: '6px 16px',
          borderRadius: '9999px',
          textAlign: 'center',
          lineHeight: '18px',
          letterSpacing: '0.1px',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {t('chatPlaceholder.title', 'Выберите чат или начните новый')}
      </div>
    </div>
  );
};