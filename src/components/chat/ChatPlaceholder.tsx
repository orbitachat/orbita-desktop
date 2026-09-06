import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const ChatPlaceholder = () => {
  const { t } = useTranslation();
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isWhatsNewOpen) return;
      if (e.key === 'Escape' || e.key === 'Enter') {
        setIsWhatsNewOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWhatsNewOpen]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '110px', height: '110px', flexShrink: 0 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="100%" height="100%">
            <defs>
              <clipPath id="orbita-front-clip">
                <rect x="-600" y="0" width="1200" height="600" />
              </clipPath>
              <mask id="orbita-back-ring-mask">
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <circle cx="400" cy="400" r="192" fill="black" />
              </mask>
              <mask id="orbita-planet-mask">
                <rect x="0" y="0" width="800" height="800" fill="white" />
                <g transform="translate(400, 400) rotate(-26)">
                  <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
                </g>
              </mask>
              <mask id="orbita-ring-hole">
                <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
                <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
              </mask>
            </defs>
            <g mask="url(#orbita-back-ring-mask)">
              <g transform="translate(400, 400) rotate(-26)">
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="#BCC0C3" mask="url(#orbita-ring-hole)" />
              </g>
            </g>
            <circle cx="400" cy="400" r="175" fill="#BCC0C3" mask="url(#orbita-planet-mask)" />
            <g transform="translate(400, 400) rotate(-26)">
              <g clipPath="url(#orbita-front-clip)">
                <ellipse cx="0" cy="0" rx="360" ry="105" fill="#BCC0C3" mask="url(#orbita-ring-hole)" />
              </g>
            </g>
          </svg>
        </div>

        <div
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text-main, #ffffff)',
            textAlign: 'center',
            letterSpacing: '0.2px',
            marginTop: '16px',
          }}
        >
          {t('chatPlaceholder.welcome', 'Добро пожаловать в Orbita')}
        </div>

        <div
          style={{
            fontSize: '14px',
            color: 'var(--text-dim, #8a96a3)',
            textAlign: 'center',
            marginTop: '6px',
          }}
        >
          <span>{t('chatPlaceholder.seeWhatsNewPrefix', 'Посмотрите, ')}</span>
          <button
            type="button"
            onClick={() => setIsWhatsNewOpen(true)}
            aria-label={t('chatPlaceholder.whatsNew', 'что нового')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              color: 'var(--accent-color, #7C3AED)',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            {t('chatPlaceholder.whatsNew', 'что нового')}
          </button>
          <span>{t('chatPlaceholder.seeWhatsNewSuffix', ' в этом обновлении')}</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '16px',
          right: '16px',
          fontSize: '13px',
          color: 'var(--text-dim, rgba(255, 255, 255, 0.45))',
          textAlign: 'center',
          letterSpacing: '0.1px',
          lineHeight: '18px',
        }}
      >
        {t('chatPlaceholder.footer', 'Orbita — полностью бесплатный и независимый мессенджер')}
      </div>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isWhatsNewOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                border: 'none',
              }}
              onClick={() => setIsWhatsNewOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="w-full max-w-[340px] rounded-[8px] p-5 shadow-2xl overflow-hidden"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--bg-secondary, #1e1b2e) 96%, #000)',
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-left">
                  <h3
                    className="text-[15px] font-semibold leading-snug"
                    style={{ color: 'var(--text-main, #ffffff)' }}
                  >
                    {t('chatPlaceholder.whatsNewTitle', 'Что нового')}
                  </h3>

                  <div
                    className="mt-3 text-[13px] leading-relaxed flex flex-col gap-2"
                    style={{ color: 'var(--text-dim, #9ca3af)' }}
                  >
                    <div className="flex items-start gap-2">
                      <span style={{ color: 'var(--accent-color, #7C3AED)', lineHeight: '18px' }}>•</span>
                      <span>{t('chatPlaceholder.whatsNewChange1', 'Единый запуск видео- и аудиозвонков в отдельном окне')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span style={{ color: 'var(--accent-color, #7C3AED)', lineHeight: '18px' }}>•</span>
                      <span>{t('chatPlaceholder.whatsNewChange2', 'Камера запрашивается и включается только во время видеозвонка')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span style={{ color: 'var(--accent-color, #7C3AED)', lineHeight: '18px' }}>•</span>
                      <span>{t('chatPlaceholder.whatsNewChange3', 'Микрофон включен по умолчанию при совершении звонка')}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span style={{ color: 'var(--accent-color, #7C3AED)', lineHeight: '18px' }}>•</span>
                      <span>{t('chatPlaceholder.whatsNewChange4', 'Обновленный экран приветствия в минималистичном стиле')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsWhatsNewOpen(false)}
                    aria-label={t('chatPlaceholder.understand', 'Я понимаю')}
                    className="px-3.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors cursor-pointer border-0 outline-none"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--accent-color, #7C3AED)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, transparent)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {t('chatPlaceholder.understand', 'Я понимаю')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};