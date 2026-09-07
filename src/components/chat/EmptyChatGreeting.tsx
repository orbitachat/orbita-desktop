// src/components/chat/EmptyChatGreeting.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

interface EmptyChatGreetingProps {
  onSendGreeting: () => void;
  isInitiator?: boolean;
  isPeerOnline?: boolean;
  isRatchetReady?: boolean;
}

export const EmptyChatGreeting: React.FC<EmptyChatGreetingProps> = ({
  onSendGreeting,
  isInitiator,
  isPeerOnline,
  isRatchetReady,
}) => {
  const { t } = useTranslation();

  // Condition: I created the chat, but friend is offline and E2EE session is not ready yet
  const isOfflineWaiting = Boolean(isInitiator && !isPeerOnline && !isRatchetReady);

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

        {isOfflineWaiting ? (
          <div
            className="flex flex-col gap-1.5 text-[13px] leading-relaxed"
            style={{ color: 'var(--text-dim, #8e8e93)' }}
          >
            <p>{t('chatWindow.empty_chat_offline_desc_1')}</p>
            <p>{t('chatWindow.empty_chat_offline_desc_2')}</p>
            <p className="text-[12px] opacity-80">{t('chatWindow.empty_chat_offline_desc_3')}</p>
          </div>
        ) : (
          <>
            <p
              className="text-[13px] leading-relaxed mb-3"
              style={{ color: 'var(--text-dim, #8e8e93)' }}
            >
              {t('chatWindow.empty_chat_description')}
            </p>

            <button
              type="button"
              onClick={onSendGreeting}
              className="cursor-pointer outline-none transition-transform duration-150 hover:scale-125 active:scale-95 flex items-center justify-center p-2 rounded-full focus:outline-none"
              style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
            >
              <span
                role="img"
                aria-label="wave"
                className="text-5xl select-none inline-block hover:rotate-12 transition-transform duration-200"
                style={{ filter: 'none' }}
              >
                👋
              </span>
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
};
