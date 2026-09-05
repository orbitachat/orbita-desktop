import { useTranslation } from 'react-i18next';

export const ChatPlaceholder = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ height: '40px', flexShrink: 0 }} />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0px',
        }}
      >
        <div style={{ width: '240px', height: '240px', flexShrink: 0 }}>
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
            fontSize: '28px',
            fontWeight: 600,
            color: 'var(--text-main, #ffffff)',
            textAlign: 'center',
            letterSpacing: '0.2px',
            marginTop: '-18px',
          }}
        >
          {t('chatPlaceholder.welcome', 'Мы рады вас видеть в Orbita')}
        </div>
      </div>

      <div
        style={{
          fontSize: '14px',
          color: 'var(--text-dim, rgba(255, 255, 255, 0.45))',
          textAlign: 'center',
          letterSpacing: '0.1px',
          lineHeight: '20px',
        }}
      >
        {t('chatPlaceholder.footer', 'Orbita — полностью бесплатный и независимый мессенджер')}
      </div>
    </div>
  );
};