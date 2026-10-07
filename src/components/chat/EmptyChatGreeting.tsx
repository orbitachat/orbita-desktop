import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { TgsPlayer } from './TgsPlayer';
import { GREETING_STICKERS, StickerItem } from '../../lib/stickers-and-gifs';

interface EmptyChatGreetingProps {
  onSendGreeting: (sticker?: StickerItem) => void;
  chatId?: string | null;
}

export const EmptyChatGreeting: React.FC<EmptyChatGreetingProps> = ({
  onSendGreeting,
  chatId,
}) => {
  const { t } = useTranslation();

  const greetingSticker = useMemo(() => {
    if (!chatId) return GREETING_STICKERS[0];
    let hash = 0;
    for (let i = 0; i < chatId.length; i++) {
      hash = (hash << 5) - hash + chatId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % GREETING_STICKERS.length;
    return GREETING_STICKERS[idx] || GREETING_STICKERS[0];
  }, [chatId]);

  return (
    <div className="flex-1 w-full h-full flex items-center justify-center p-4 select-none pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="pointer-events-auto flex flex-col items-center justify-center text-center max-w-[340px] px-6 py-5"
        style={{
          borderRadius: '15px',
          backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
          border: 'none',
          boxShadow: 'none',
        }}
      >
        <h3
          className="text-[15px] font-semibold mb-2 leading-snug"
          style={{ color: 'var(--text-main, #ffffff)' }}
        >
          {t('chatWindow.empty_chat_title')}
        </h3>

        <p
          className="text-[13px] leading-relaxed mb-3"
          style={{ color: 'var(--text-dim, #8e8e93)' }}
        >
          {t('chatWindow.empty_chat_description')}
        </p>

        <button
          type="button"
          onClick={() => onSendGreeting(greetingSticker)}
          aria-label={t('chatWindow.send_greeting', 'Отправить приветствие')}
          className="cursor-pointer outline-none transition-transform duration-150 hover:scale-105 active:scale-95 flex items-center justify-center p-1 rounded-2xl focus:outline-none"
          style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
        >
          <div className="w-[124px] h-[124px] pointer-events-none">
            <TgsPlayer
              src={greetingSticker.url}
              loop={true}
              autoplay={true}
              className="w-full h-full select-none"
            />
          </div>
        </button>
      </motion.div>
    </div>
  );
};
