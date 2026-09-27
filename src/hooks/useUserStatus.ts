import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ablyService } from '../services/ablyService';
import { formatLastSeen } from '../utils/messageUtils';

interface UserStatus {
  isOnline: boolean;
  text: string;
}

export function useUserStatus(userId: string): UserStatus {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UserStatus>({
    isOnline: false,
    text: t('common.loading', 'Загрузка...'),
  });

  const lastSeenRef = useRef<number | null>(null);
  const isOnlineRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const updateStatus = (isOnline: boolean, lastSeen?: number) => {
      if (!mounted) return;
      isOnlineRef.current = isOnline;

      if (isOnline) {
        setStatus({
          isOnline: true,
          text: t('userStatus.online'),
        });
        lastSeenRef.current = Date.now();
      } else {
        lastSeenRef.current = lastSeen || lastSeenRef.current || null;
        setStatus({
          isOnline: false,
          text: formatLastSeen(lastSeenRef.current, t),
        });
      }
    };

    const unsubscribe = ablyService.subscribeToUserPresence(userId, updateStatus);

    const updateInterval = setInterval(() => {
      if (mounted && !isOnlineRef.current && lastSeenRef.current) {
        setStatus((prev) => ({
          ...prev,
          text: formatLastSeen(lastSeenRef.current, t),
        }));
      }
    }, 60000);

    return () => {
      mounted = false;
      unsubscribe();
      clearInterval(updateInterval);
    };
  }, [userId, t]);

  return status;
}