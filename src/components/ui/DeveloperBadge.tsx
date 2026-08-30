import React, { useEffect } from 'react';
import { supabaseService } from '../../services/supabaseService';

// Динамический список ID разработчиков из Supabase с постоянным кэшированием (Stale-While-Revalidate как в Session)
const STORAGE_KEY = 'orbita_cached_dev_codes_v2';
const LAST_FETCH_KEY = 'orbita_dev_codes_last_fetch';

const getInitialCachedCodes = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return new Set(list.map((c: string) => c.trim()));
    }
  } catch (e) {}
  return new Set();
};

let developerCodes: Set<string> = getInitialCachedCodes();
const listeners = new Set<() => void>();

const notifyListeners = () => {
  listeners.forEach((fn) => fn());
};

// Загрузка и синхронизация разработчиков с сохранением предыдущего кэша
export const loadDeveloperCodes = async (force = false): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  const lastFetch = Number(localStorage.getItem(LAST_FETCH_KEY) || 0);

  // Троттлинг: не запрашивать чаще одного раза в 60 секунд, если кэш уже есть
  if (!force && developerCodes.size > 0 && now - lastFetch < 60 * 1000) {
    return true;
  }

  try {
    const codes = await supabaseService.getDeveloperCodes();
    if (codes && Array.isArray(codes)) {
      developerCodes = new Set(codes.map((c) => c.trim()));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(developerCodes)));
        localStorage.setItem(LAST_FETCH_KEY, String(now));
      } catch (e) {}
      notifyListeners();
      return true;
    }
  } catch (err) {
    console.warn('[DeveloperBadge] Background revalidation failed, preserving persistent cache:', err);
  }
  return false;
};

// Проверка при первом подключении к человеку (отправке/получении заявки)
export const revalidateDevelopersOnConnection = async (userId?: string): Promise<boolean> => {
  try {
    await loadDeveloperCodes(false);
  } catch {}
  return isDeveloper(userId);
};

// Инициализация Realtime подписки и фоновой проверки
if (typeof window !== 'undefined') {
  // Первичная подгрузка (всегда актуализирует кэш в фоне)
  loadDeveloperCodes(true);

  // Подписка на Realtime изменения в Supabase (моментальное обновление при добавлении в БД)
  supabaseService.subscribeToDevelopers((newCodes) => {
    if (newCodes && newCodes.length > 0) {
      developerCodes = new Set(newCodes.map((c) => c.trim()));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(developerCodes)));
        localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
      } catch (e) {}
      notifyListeners();
    }
  });

  // Фоновая проверка раз в 5 минут
  setInterval(() => {
    loadDeveloperCodes(true);
  }, 5 * 60 * 1000);
}

export const isDeveloper = (userId: string | undefined | null): boolean => {
  if (!userId) return false;
  const trimmed = userId.trim();
  return (
    developerCodes.has(trimmed) ||
    developerCodes.has(trimmed.toUpperCase()) ||
    developerCodes.has(trimmed.toLowerCase())
  );
};

export const OrbitaBadgeIcon: React.FC<{ size?: number | string; color?: string }> = ({
  size = '100%',
  color = 'currentColor',
}) => (
  <svg viewBox="0 0 800 800" width={size} height={size} style={{ overflow: 'visible', display: 'block' }}>
    <defs>
      <clipPath id="front-clip-dev-global">
        <rect x="-600" y="0" width="1200" height="600" />
      </clipPath>
      <mask id="back-ring-mask-dev-global">
        <rect x="0" y="0" width="800" height="800" fill="white" />
        <circle cx="400" cy="400" r="192" fill="black" />
      </mask>
      <mask id="planet-mask-dev-global">
        <rect x="0" y="0" width="800" height="800" fill="white" />
        <g transform="translate(400, 400) rotate(-26)">
          <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
        </g>
      </mask>
      <mask id="ring-hole-dev-global">
        <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
        <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
      </mask>
    </defs>
    <g mask="url(#back-ring-mask-dev-global)">
      <g transform="translate(400, 400) rotate(-26)">
        <ellipse cx="0" cy="0" rx="360" ry="105" fill={color} mask="url(#ring-hole-dev-global)" />
      </g>
    </g>
    <circle cx="400" cy="400" r="175" fill={color} mask="url(#planet-mask-dev-global)" />
    <g transform="translate(400, 400) rotate(-26)">
      <g clipPath="url(#front-clip-dev-global)">
        <ellipse cx="0" cy="0" rx="360" ry="105" fill={color} mask="url(#ring-hole-dev-global)" />
      </g>
    </g>
  </svg>
);

interface DeveloperBadgeProps {
  userId?: string;
  nickname?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

import { useToastStore } from '../../store/useToastStore';

export const DeveloperBadge: React.FC<DeveloperBadgeProps> = ({
  userId,
  nickname,
  size = 15,
  className = '',
  style = {},
  onClick,
}) => {
  const [, setTick] = React.useState(0);

  useEffect(() => {
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (!isDeveloper(userId)) return null;

  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      onClick(e);
    } else {
      e.stopPropagation();
      useToastStore.getState().showDevToast(nickname);
    }
  };

  return (
    <span
      onClick={handleClick}
      className={`developer-badge-icon ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        width: size,
        height: size,
        flexShrink: 0,
        verticalAlign: 'middle',
        color: 'var(--accent-color, #c85f95)',
        ...style,
      }}
    >
      <OrbitaBadgeIcon size={size} color="var(--accent-color, #c85f95)" />
    </span>
  );
};

export const DeveloperToast: React.FC<{
  isOpen: boolean;
  nickname?: string;
}> = ({ isOpen, nickname }) => {
  useEffect(() => {
    if (isOpen) {
      useToastStore.getState().showDevToast(nickname);
    }
  }, [isOpen, nickname]);

  return null;
};
