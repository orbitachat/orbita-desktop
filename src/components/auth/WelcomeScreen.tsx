import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { AccountRestoreModal } from './AccountRestoreModal';

export const WelcomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const setStep = useAuthStore((state) => state.setStep);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-primary, #14111d)',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* ВЕРХНЯЯ ШАПКА / ПЛАШКА */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          width: '100%',
          flex: '0.85 1 0%',
          minHeight: isMobile ? '180px' : '220px',
          maxHeight: isMobile ? '260px' : '340px',
          position: 'relative',
          backgroundColor: 'var(--bg-secondary, #211d2f)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Мягкое внутреннее свечение в центре */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* ------------------------------------------------------------- */}
        {/* Векторный монохромный паттерн (Орбиты, планеты, звезды, ноутбуки, телефоны) */}
        {/* ------------------------------------------------------------- */}
        <svg
          viewBox="0 0 1000 500"
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <defs>
            <linearGradient id="orbGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#c7d2fe" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="saturnGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
            </linearGradient>
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* === ФОНОВЫЕ ОРБИТАЛЬНЫЕ ЛИНИИ И ДУГИ === */}
          <ellipse cx="500" cy="250" rx="420" ry="190" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="6 8" />
          <ellipse cx="500" cy="250" rx="320" ry="140" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5" transform="rotate(-15 500 250)" />
          <ellipse cx="500" cy="250" rx="230" ry="95" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" transform="rotate(18 500 250)" />

          {/* Маленькие спутники на орбитах */}
          <circle cx="210" cy="180" r="3.5" fill="#ffffff" opacity="0.75" />
          <circle cx="790" cy="310" r="4.5" fill="#ffffff" opacity="0.8" />
          <circle cx="360" cy="360" r="3" fill="#ffffff" opacity="0.6" />
          <circle cx="680" cy="140" r="4" fill="#ffffff" opacity="0.7" />

          {/* === ЛЕВАЯ ВЕРХНЯЯ ЗОНА: Планета Сатурн с кольцом + Звезды === */}
          <g transform="translate(130, 95) scale(1.1)">
            {/* Планета Сатурн */}
            <circle cx="40" cy="40" r="22" fill="url(#saturnGrad)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
            <ellipse cx="40" cy="40" rx="38" ry="10" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" transform="rotate(-25 40 40)" />
            {/* 4-конечная звезда рядом */}
            <path d="M90,20 Q90,32 102,32 Q90,32 90,44 Q90,32 78,32 Q90,32 90,20 Z" fill="rgba(255,255,255,0.65)" />
            <circle cx="10" cy="15" r="2" fill="rgba(255,255,255,0.6)" />
            <circle cx="100" cy="70" r="2.5" fill="rgba(255,255,255,0.5)" />
          </g>

          {/* === ЛЕВАЯ СРЕДНЯЯ ЗОНА: Ноутбук (Laptop) === */}
          <g transform="translate(70, 260) scale(0.95)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Экран ноутбука */}
            <rect x="20" y="20" width="70" height="46" rx="4" fill="rgba(255,255,255,0.06)" />
            {/* Окошко / строки чата на экране */}
            <line x1="30" y1="32" x2="55" y2="32" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
            <line x1="30" y1="40" x2="70" y2="40" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            <line x1="30" y1="48" x2="60" y2="48" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            {/* База ноутбука с тачпадом */}
            <path d="M10,66 L100,66 L94,76 L16,76 Z" fill="rgba(255,255,255,0.12)" />
            <line x1="45" y1="69" x2="65" y2="69" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          </g>

          {/* === ЛЕВАЯ НИЖНЯЯ ЗОНА: Облачко сообщений + Щит шифрования (E2EE) === */}
          <g transform="translate(240, 310) scale(0.9)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Облачко чата */}
            <path d="M15,15 h36 a12,12 0 0 1 12,12 v10 a12,12 0 0 1 -12,12 h-20 l-10,8 v-8 h-6 a12,12 0 0 1 -12,-12 v-10 a12,12 0 0 1 12,-12 z" fill="rgba(255,255,255,0.08)" />
            {/* Три точки сообщения */}
            <circle cx="25" cy="31" r="2" fill="rgba(255,255,255,0.7)" stroke="none" />
            <circle cx="33" cy="31" r="2" fill="rgba(255,255,255,0.7)" stroke="none" />
            <circle cx="41" cy="31" r="2" fill="rgba(255,255,255,0.7)" stroke="none" />
          </g>

          {/* === ПРАВАЯ ВЕРХНЯЯ ЗОНА: Смартфон (Phone) + Бумажный самолётик (Telegram-style) === */}
          <g transform="translate(760, 75) scale(0.95)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Корпус телефона */}
            <rect x="25" y="10" width="42" height="74" rx="9" fill="rgba(255,255,255,0.06)" />
            {/* Динамик / вырез камеры */}
            <line x1="41" y1="16" x2="51" y2="16" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
            {/* Сообщение на экране телефона */}
            <rect x="31" y="26" width="22" height="12" rx="4" fill="rgba(255,255,255,0.2)" stroke="none" />
            <rect x="39" y="44" width="22" height="12" rx="4" fill="rgba(255,255,255,0.35)" stroke="none" />
            {/* Нижняя полоса Home bar */}
            <line x1="40" y1="78" x2="52" y2="78" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />

            {/* Бумажный самолётик рядом с телефоном */}
            <g transform="translate(70, 15) scale(0.85)">
              <path d="M0,25 L40,0 L20,38 L14,24 Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
              <path d="M14,24 L40,0" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
            </g>
          </g>

          {/* === ПРАВАЯ СРЕДНЯЯ ЗОНА: Планета Земля / Глобус с меридианами === */}
          <g transform="translate(820, 240) scale(1.05)">
            <circle cx="35" cy="35" r="25" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
            <ellipse cx="35" cy="35" rx="14" ry="25" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
            <line x1="10" y1="35" x2="60" y2="35" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
            <path d="M14,23 Q35,28 56,23" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
            <path d="M14,47 Q35,42 56,47" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
          </g>

          {/* === ПРАВАЯ НИЖНЯЯ ЗОНА: Щит безопасности E2EE + Замочек === */}
          <g transform="translate(680, 320) scale(0.9)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Щит */}
            <path d="M30,10 L50,18 V32 C50,44 30,52 30,52 C30,52 10,44 10,32 V18 Z" fill="rgba(255,255,255,0.08)" />
            {/* Замочек внутри */}
            <rect x="24" y="27" width="12" height="10" rx="2" fill="rgba(255,255,255,0.3)" stroke="none" />
            <path d="M26,27 V23 A4,4 0 0 1 34,23 V27" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8" />
          </g>

          {/* === МЕЛКИЕ ЗВЁЗДЫ И КОСМИЧЕСКИЕ ТОЧКИ ПО ВСЕМУ ПОЛЮ === */}
          {/* 4-конечные сияющие звёзды */}
          <path d="M310,80 Q310,90 320,90 Q310,90 310,100 Q310,90 300,90 Q310,90 310,80 Z" fill="rgba(255,255,255,0.75)" />
          <path d="M680,85 Q680,95 690,95 Q680,95 680,105 Q680,95 670,95 Q680,95 680,85 Z" fill="rgba(255,255,255,0.65)" />
          <path d="M220,230 Q220,238 228,238 Q220,238 220,246 Q220,238 212,238 Q220,238 220,230 Z" fill="rgba(255,255,255,0.55)" />
          <path d="M760,250 Q760,258 768,258 Q760,258 760,266 Q760,258 752,258 Q760,258 760,250 Z" fill="rgba(255,255,255,0.5)" />
          <path d="M430,370 Q430,378 438,378 Q430,378 430,386 Q430,378 422,378 Q430,378 430,370 Z" fill="rgba(255,255,255,0.4)" />

          {/* 5-конечные звёздочки */}
          <polygon points="170,200 173,208 181,208 175,213 177,221 170,216 163,221 165,213 159,208 167,208" fill="rgba(255,255,255,0.45)" />
          <polygon points="860,160 862,166 869,166 864,170 866,176 860,172 854,176 856,170 851,166 858,166" fill="rgba(255,255,255,0.45)" />

          {/* Россыпь микро-звёзд (точки) */}
          <circle cx="260" cy="130" r="1.8" fill="#ffffff" opacity="0.6" />
          <circle cx="380" cy="120" r="1.5" fill="#ffffff" opacity="0.5" />
          <circle cx="480" cy="80" r="2" fill="#ffffff" opacity="0.65" />
          <circle cx="580" cy="110" r="1.5" fill="#ffffff" opacity="0.55" />
          <circle cx="620" cy="170" r="1.8" fill="#ffffff" opacity="0.7" />
          <circle cx="160" cy="380" r="2" fill="#ffffff" opacity="0.45" />
          <circle cx="820" cy="370" r="2.2" fill="#ffffff" opacity="0.55" />
          <circle cx="890" cy="300" r="1.5" fill="#ffffff" opacity="0.4" />
          <circle cx="70" cy="180" r="2" fill="#ffffff" opacity="0.5" />
          <circle cx="930" cy="120" r="2" fill="#ffffff" opacity="0.6" />
        </svg>

        {/* ------------------------------------------------------------- */}
        {/* ЦЕНТРАЛЬНАЯ ЭМБЛЕМА / ЛОГО ORBITA */}
        {/* ------------------------------------------------------------- */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: isMobile ? '160px' : '220px',
            height: isMobile ? '160px' : '220px',
          }}
        >
          <svg viewBox="0 0 800 800" width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
                <clipPath id="front-clip">
                    <rect x="-600" y="0" width="1200" height="600" />
                </clipPath>
                <mask id="back-ring-mask">
                    <rect x="0" y="0" width="800" height="800" fill="white" />
                    <circle cx="400" cy="400" r="192" fill="black" />
                </mask>
                <mask id="planet-mask">
                    <rect x="0" y="0" width="800" height="800" fill="white" />
                    <g transform="translate(400, 400) rotate(-26)">
                        <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
                    </g>
                </mask>
                <mask id="ring-hole">
                    <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
                    <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
                </mask>
            </defs>
            <g mask="url(#back-ring-mask)">
                <g transform="translate(400, 400) rotate(-26)">
                    <ellipse cx="0" cy="0" rx="360" ry="105" fill="#BCC0C3" mask="url(#ring-hole)" />
                </g>
            </g>
            <circle cx="400" cy="400" r="175" fill="#BCC0C3" mask="url(#planet-mask)" />
            <g transform="translate(400, 400) rotate(-26)">
                <g clip-path="url(#front-clip)">
                    <ellipse cx="0" cy="0" rx="360" ry="105" fill="#BCC0C3" mask="url(#ring-hole)" />
                </g>
            </g>
          </svg>
        </motion.div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* НИЖНЯЯ ЧАСТЬ ЭКРАНА: Тёмный фон, заголовок и кнопка "Начните общаться" */}
      {/* ------------------------------------------------------------- */}
      <div
        style={{
          width: '100%',
          flex: '1 1 0%',
          backgroundColor: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: isMobile ? '40px' : '64px',
          paddingLeft: isMobile ? '20px' : '32px',
          paddingRight: isMobile ? '20px' : '32px',
          paddingBottom: isMobile ? '24px' : '36px',
          boxSizing: 'border-box',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '440px',
            width: '100%',
          }}
        >
          {/* Главная надпись: Orbita Desktop */}
          <h1
            style={{
              margin: '0 0 34px 0',
              fontSize: isMobile ? '32px' : '40px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: 'var(--text-main, #ffffff)',
              lineHeight: 1.15,
            }}
          >
            {t('welcome.title', 'Orbita Desktop')}
          </h1>

          <motion.button
            onClick={() => setStep('nickname')}
            aria-label={t('welcome.start_messaging')}
            style={{
              width: isMobile ? '100%' : '270px',
              maxWidth: '300px',
              height: '52px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: 'var(--bg-secondary, #211d2f)',
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: 650,
              letterSpacing: '0.01em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {t('welcome.start_messaging', 'Начните общаться')}
          </motion.button>

          <motion.button
            onClick={() => setIsRestoreOpen(true)}
            aria-label={t('welcome.restore_account')}
            style={{
              marginTop: '12px',
              width: isMobile ? '100%' : '270px',
              maxWidth: '300px',
              height: '46px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              backgroundColor: 'transparent',
              color: 'rgba(255, 255, 255, 0.75)',
              fontSize: '14.5px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <KeyRound size={16} color="rgba(255, 255, 255, 0.75)" />
            {t('welcome.restore_account', 'Восстановить аккаунт')}
          </motion.button>
        </motion.div>
      </div>

      <AccountRestoreModal
        isOpen={isRestoreOpen}
        onClose={() => setIsRestoreOpen(false)}
      />
    </div>
  );
};