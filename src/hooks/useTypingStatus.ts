// src/hooks/useTypingStatus.ts
import { useState, useEffect, useRef } from 'react';
import { ablyService } from '../services/ablyService';

interface UseTypingStatusProps {
  chatId: string;
  userId: string;
}

export function useTypingStatus({ chatId, userId }: UseTypingStatusProps) {
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.log(`[useTypingStatus] Подписываемся на typing для чата ${chatId}`);

    const unsubscribe = ablyService.subscribeToTyping(chatId, (typingUserId, typingStatus) => {
      console.log(`[useTypingStatus] Событие: userId=${typingUserId}, isTyping=${typingStatus}, myUserId=${userId}`);
      
      if (typingUserId === userId) {
        console.log('[useTypingStatus] Игнорируем своё событие');
        return;
      }

      if (typingStatus) {
        console.log('[useTypingStatus] Устанавливаем isTyping = true');
        setIsTyping(true);
        
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          console.log('[useTypingStatus] Таймер сработал: isTyping = false');
          setIsTyping(false);
        }, 3000);
      } else {
        console.log('[useTypingStatus] Явное false: isTyping = false');
        setIsTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    });

    return () => {
      console.log(`[useTypingStatus] Отписываемся от typing для чата ${chatId}`);
      unsubscribe();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [chatId, userId]);

  return { isTyping };
}