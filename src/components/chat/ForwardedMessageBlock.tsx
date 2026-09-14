import React from 'react';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import { ForwardedFrom } from '../../store/useChatStore';
import { DeveloperBadge } from '../ui/DeveloperBadge';

interface ForwardedMessageBlockProps {
  forwarded: ForwardedFrom;
  isOwn: boolean;
  themeColor?: string;
}

export const ForwardedMessageBlock: React.FC<ForwardedMessageBlockProps> = ({
  forwarded,
  isOwn,
  themeColor,
}) => {
  const { t } = useTranslation();
  const isAnonymous = Boolean(forwarded.isAnonymous || !forwarded.sender);

  return (
    <div
      className="flex items-center gap-1.5 mb-1 select-none pointer-events-none"
      style={{
        fontSize: '12px',
        lineHeight: 1.2,
        color: isOwn ? 'rgba(255, 255, 255, 0.92)' : (themeColor || 'var(--accent-color, #9b7dd4)'),
        fontWeight: 500,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <Share2 size={12} className="flex-shrink-0" style={{ transform: 'scaleX(-1)' }} />
      <span className="truncate">
        {isAnonymous ? (
          t('forward.forwarded_message', 'Пересланное сообщение')
        ) : (
          <>
            <span style={{ opacity: 0.85, fontWeight: 400, marginRight: '4px' }}>
              {t('forward.forwarded_from', 'Переслано от')}
            </span>
            <span style={{ fontWeight: 600 }}>{forwarded.sender}</span>
          </>
        )}
      </span>
      {!isAnonymous && forwarded.senderId && (
        <DeveloperBadge userId={forwarded.senderId} size={15} />
      )}
    </div>
  );
};
