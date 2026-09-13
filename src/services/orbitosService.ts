import { useChatStore, Chat, Message } from '../store/useChatStore';
import { gatewayManager } from './gatewayManager';
const ORBITA_UPDATES_CHANNEL_ID = 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9';
const stripEmojis = (text: string): string => {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{1FA00}-\u{1FAFF}\u{FE00}-\u{FE0F}]/gu, '')
    .trim();
};
const ORBITOS_SYSTEM_PROMPT = 'Ты — официальный искусственный интеллект мессенджера Orbita (ORBITA AI). Твой стиль — как у передовых нейросетей Claude и ChatGPT ASTRA: высокий интеллектуальный уровень, безупречная точность, ясность, лаконичность, живая естественность и структурированность без шаблонных фраз и воды. 1. Архитектура и безопасность Orbita построены по стандарту Signal: сквозное шифрование (E2EE) на протоколе Double Ratchet (X25519, AES-256-GCM, HKDF-SHA256). Все сообщения и медиа шифруются исключительно на устройствах пользователей и не могут быть расшифрованы сервером или посторонними. 2. Доставка сообщений: как в Signal, зашифрованные пакеты проходят через защищённые сервера-релеи и временно хранятся в зашифрованной очереди доставки, пока получатель не выйдет в сеть и не прочитает сообщение. После доставки и прочтения сообщения удаляются с серверов. 3. Звонки: аудио- и видеозвонки, а также демонстрация экрана проходят через защищённые сервера-релеи (SFU / LiveKit), точно как в Signal, что полностью скрывает реальные IP-адреса собеседников и обеспечивает высочайшую защиту приватности и надёжность соединения. 4. Каналы и группы: защищены сквозным шифрованием (E2EE), сервер хранит только зашифрованные посты. 5. Резервные копии профиля (.orbita): зашифрованы мнемонической фразой из 12 слов стандарта BIP-39. 6. Официальный канал обновлений: Orbita Updates (ID: VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9). Если пользователь спрашивает про канал, новости или обновления, в самый конец ответа обязательно добавляй маркер [BUTTON:ORBITA_UPDATES] — интерфейс автоматически отобразит кнопку перехода в канал. 7. Стиль общения: будь вежливым, уверенным, умным и дружелюбным помощником. Различай сленг/эмоции и реальную токсичность: если пользователь просто эмоционален или использует сленг — отвечай спокойно и по делу. Только при прямой целенаправленной травле или хамстве давай остроумный, сдержанный и твердый отпор. 8. СТРОГИЙ ЗАПРЕТ НА ЭМОДЗИ: Категорически запрещено использовать любые эмодзи, смайлики и графические символы в ответе. Пиши только чистым текстом. 9. Отвечай максимально быстро, конкретно, структурированно и по существу.';

class OrbitosService {
  public readonly BOT_ID = 'system_orbitos';

  public initOrbitosChat(t: any): void {
    const store = useChatStore.getState();
    const existing = store.chats.find((c) => c.id === this.BOT_ID);
    if (existing) {
      const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
      const hasOldButtons = existingMsgs.some((m) => m.buttons && m.buttons.some((b) => b.text.includes('🛡️') || b.text.includes('📢')));
      const hasOldWelcome = existingMsgs.some((m) => m.id === 'orbitos_welcome_1' && (m.text.includes('Орбитос') || m.text.includes('🪐')));
      if (hasOldButtons || hasOldWelcome) {
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) => {
              if (m.id === 'orbitos_welcome_1') {
                return {
                  ...m,
                  sender: t('orbitos.name', 'ORBITA'),
                  text: t('orbitos.welcome_msg_1', 'Привет! Меня зовут ORBITA.\nДобро пожаловать в Orbita — защищённый мессенджер с полным сквозным шифрованием.'),
                };
              }
              if (m.id === 'orbitos_welcome_2') {
                return {
                  ...m,
                  buttons: [
                    {
                      text: t('orbitos.btn_backup', 'Резервная копия'),
                      action: 'open_backup',
                      icon: 'backup' as const,
                    },
                  ],
                };
              }
              if (m.id === 'orbitos_welcome_3') {
                return {
                  ...m,
                  buttons: [
                    {
                      text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
                      action: 'open_channel',
                      channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
                      icon: 'channel' as const,
                    },
                  ],
                };
              }
              return m;
            }),
          },
        }));
      }
      return;
    }

    const chatName = t('orbitos.name', 'ORBITA');
    const initialLastMsg = t('orbitos.initial_last_msg', 'Добро пожаловать в Orbita!');
    const now = Date.now();

    const botChat: Chat = {
      id: this.BOT_ID,
      type: 'bot',
      name: chatName,
      lastMsg: initialLastMsg,
      online: true,
      description: t('orbitos.description', 'Официальный системный помощник мессенджера Orbita'),
      createdAt: now,
      updatedAt: now,
      unreadCount: 3,
    };

    store.addChat(botChat);

    const msgs: Message[] = [
      {
        id: 'orbitos_welcome_1',
        senderId: this.BOT_ID,
        sender: chatName,
        isOutgoing: false,
        text: t('orbitos.welcome_msg_1', 'Привет! Меня зовут ORBITA.\nДобро пожаловать в Orbita — защищённый мессенджер с полным сквозным шифрованием.'),
        time: now - 3000,
        read: false,
        status: 'delivered',
      },
      {
        id: 'orbitos_welcome_2',
        senderId: this.BOT_ID,
        sender: chatName,
        isOutgoing: false,
        text: t('orbitos.welcome_msg_2', 'Важное: сделайте резервную копию профиля в настройках. Тогда вы сможете восстановить все свои контакты и ключи на новом устройстве.\n\nИстория сообщений хранится строго локально — это наш принцип защиты от перехвата данных.'),
        time: now - 2000,
        read: false,
        status: 'delivered',
        buttons: [
          {
            text: t('orbitos.btn_backup', 'Резервная копия'),
            action: 'open_backup',
            icon: 'backup',
          },
        ],
      },
      {
        id: 'orbitos_welcome_3',
        senderId: this.BOT_ID,
        sender: chatName,
        isOutgoing: false,
        text: t('orbitos.welcome_msg_3', 'Рекомендую подписаться на официальный канал, чтобы первыми узнавать обо всех обновлениях:\n\nOrbita Updates\nID: VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9'),
        time: now - 1000,
        read: false,
        status: 'delivered',
        buttons: [
          {
            text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
            action: 'open_channel',
            channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
            icon: 'channel',
          },
        ],
      },
    ];

    for (const msg of msgs) {
      store.addMessage(this.BOT_ID, msg);
    }
  }

  private async askGeminiAI(userText: string, t?: any): Promise<{ reply: string; buttons?: Message['buttons'] } | null> {
    const store = useChatStore.getState();
    const history = (store.messagesByChatId[this.BOT_ID] || []).slice(-10).map((m) => ({
      text: m.text,
      isOutgoing: m.isOutgoing,
    }));

    try {
      const res = await gatewayManager.fetch('/orbitos/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history,
          systemPrompt: ORBITOS_SYSTEM_PROMPT,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.reply) {
          let reply = stripEmojis(String(data.reply));
          let buttons: Message['buttons'] = undefined;
          const hasButtonTag = reply.includes('[BUTTON:ORBITA_UPDATES]');
          const mentionsChannel = reply.includes(ORBITA_UPDATES_CHANNEL_ID) || /orbita\s+updates/i.test(reply);
          if (hasButtonTag || mentionsChannel) {
            reply = reply.replace(/\[BUTTON:ORBITA_UPDATES\]/g, '').trim();
            const btnText = t ? t('orbitos.btn_channel', 'Перейти в Orbita Updates') : 'Перейти в Orbita Updates';
            buttons = [
              {
                text: btnText,
                action: 'open_channel',
                channelId: ORBITA_UPDATES_CHANNEL_ID,
                icon: 'channel',
              },
            ];
          }
          return { reply, buttons };
        }
      }
    } catch {}

    return null;
  }

  public async handleUserMessage(
    userText: string,
    t: any,
    mediaUrl?: string,
    mediaType?: string,
    mime?: string
  ): Promise<void> {
    const raw = userText.trim().toLowerCase();
    let reply = '';
    let buttons: Message['buttons'] = undefined;

    if (raw === '/start' || raw === 'старт') {
      reply = t('orbitos.welcome_msg_1');
      buttons = [
        {
          text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: ORBITA_UPDATES_CHANNEL_ID,
          icon: 'channel',
        },
        {
          text: t('orbitos.btn_backup', 'Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else if (raw === '/help' || raw === 'помощь' || raw === 'help') {
      reply = t('orbitos.help_reply');
      buttons = [
        {
          text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: ORBITA_UPDATES_CHANNEL_ID,
          icon: 'channel',
        },
        {
          text: t('orbitos.btn_backup', 'Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else {
      const mediaHint = mediaUrl
        ? `[Медиавложение: ${mediaType || 'файл'}, тип: ${mime || 'auto'}, URL: ${mediaUrl}]`
        : '';
      const promptText = [userText, mediaHint].filter(Boolean).join('\n').trim();
      const aiResult = await this.askGeminiAI(promptText, t);
      if (aiResult && aiResult.reply) {
        reply = stripEmojis(aiResult.reply);
        buttons = aiResult.buttons;
      } else {
        reply = t('orbitos.temp_error', 'Хм, что-то пошло не так на моей стороне. Попробуй ещё раз — обычно это быстро проходит.');
      }
    }

    reply = stripEmojis(reply);

    const store = useChatStore.getState();
    const replyMsg: Message = {
      id: `bot_reply_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: this.BOT_ID,
      sender: t('orbitos.name', 'ORBITA'),
      isOutgoing: false,
      text: reply,
      time: Date.now(),
      read: false,
      status: 'delivered',
      buttons,
    };

    store.addMessage(this.BOT_ID, replyMsg);
    store.updateChat(this.BOT_ID, { lastMsg: reply });
  }

  public async syncAnnouncementsFromBackend(): Promise<void> {
    return;
  }
}

export const orbitosService = new OrbitosService();

