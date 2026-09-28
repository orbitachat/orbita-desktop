import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore, type Message } from '../../store/useChatStore';
import { formatTimeOfDay } from '../../utils/messageUtils';
import { orbitFs } from './chatUtils';

interface CallMessageProps {
  msg: Message;
  chatId: string;
  onCall: (chatId: string) => void;
  isOwn?: boolean;
  customRadius?: string;
}

export const CallMessage = memo(
  ({
    msg,
    chatId,
    onCall,
    isOwn = false,
    customRadius,
  }: CallMessageProps) => {
    const { t } = useTranslation();
    const bubbleRadius = useChatStore((state) => state.bubbleRadius);

    const parts = msg.text.split(', ');
    const directionPart = parts[0].replace(/^\[Call\]\s/, '');
    const durationStr = parts[1] || '';

    const isOutgoing = isOwn || directionPart.toLowerCase().includes('исходящ') || directionPart.toLowerCase().includes('outgoing');
    const status = msg.mediaName || 'completed';
    const displayStatus = status === 'busy' ? 'rejected' : status;

    const isValidDuration = (str: string): boolean => {
      if (!str) return false;
      const p = str.split(':');
      if (p.length !== 2) return false;
      const mins = parseInt(p[0], 10);
      const secs = parseInt(p[1], 10);
      return !isNaN(mins) && !isNaN(secs) && mins >= 0 && secs >= 0 && secs < 60;
    };

    const showDuration = displayStatus === 'completed' && isValidDuration(durationStr);

    let mainText = '';
    if (displayStatus === 'missed') {
      mainText = t('call.missed_call');
    } else if (displayStatus === 'rejected') {
      mainText = t('call.rejected_call');
    } else {
      mainText = isOutgoing ? t('call.outgoing_call') : t('call.incoming_call');
    }

    const timeStr = formatTimeOfDay(msg.time);

    let durationDisplay = '';
    if (showDuration) {
      const parts2 = durationStr.split(':');
      const mins = parseInt(parts2[0], 10);
      const secs = parseInt(parts2[1], 10);
      if (mins === 0) {
        durationDisplay = t('call.seconds', { count: secs });
      } else {
        durationDisplay = t('call.duration', { mins, secs });
      }
    }

    return (
      <div
        className="flex items-center justify-between p-3 rounded-xl cursor-pointer select-none"
        style={{
          backgroundColor: isOwn
            ? 'var(--chat-bubble-own-bg, #2c6bed)'
            : 'var(--chat-bubble-incoming-bg, var(--surface-container, rgba(255,255,255,0.05)))',
          borderRadius: customRadius || bubbleRadius,
          border: 'none',
          gap: '40px',
          minWidth: '220px',
          height: '56px',
          boxSizing: 'border-box',
        }}
        onClick={() => onCall(chatId)}
      >
        <div className="flex flex-col min-w-0">
          <span className="font-medium truncate" style={{ color: isOwn ? '#ffffff' : 'var(--text-main)', fontSize: orbitFs(13) }}>
            {mainText}
          </span>
          <div className="text-xs truncate" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)', fontSize: orbitFs(11) }}>
            {timeStr}
            {durationDisplay && `, ${durationDisplay}`}
          </div>
        </div>
        <div style={{ color: isOwn ? '#ffffff' : 'var(--accent-color)' }} className="flex-shrink-0 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 42 42" fill="currentColor">
            <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
          </svg>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.msg.time === nextProps.msg.time &&
    prevProps.msg.text === nextProps.msg.text &&
    prevProps.msg.mediaName === nextProps.msg.mediaName &&
    prevProps.chatId === nextProps.chatId &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.customRadius === nextProps.customRadius
);
