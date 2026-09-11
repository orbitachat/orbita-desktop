import { useChatStore, Chat, Message } from '../store/useChatStore';

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

  public async handleUserMessage(userText: string, t: any): Promise<void> {
    const raw = userText.trim().toLowerCase();
    let reply = '';
    let buttons: Message['buttons'] = undefined;

    if (raw === '/start' || raw === 'старт') {
      reply = t('orbitos.welcome_msg_1');
      buttons = [
        {
          text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
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
          channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
          icon: 'channel',
        },
        {
          text: t('orbitos.btn_backup', 'Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else if (raw === '/backup' || raw.includes('бэкап') || raw.includes('копи')) {
      reply = t('orbitos.backup_reply');
      buttons = [
        {
          text: t('orbitos.btn_backup', 'Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else if (raw === '/channels' || raw.includes('канал')) {
      reply = t('orbitos.channels_reply');
      buttons = [
        {
          text: t('orbitos.btn_channel', 'Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
          icon: 'channel',
        },
      ];
    } else if (raw === '/security' || raw.includes('безопасн') || raw.includes('шифр') || raw.includes('ratchet')) {
      reply = t('orbitos.security_reply');
    } else if (raw === '/privacy' || raw.includes('приватн') || raw.includes('скрыть') || raw.includes('id')) {
      reply = t('orbitos.privacy_reply');
    } else if (raw === '/calls' || raw.includes('звон') || raw.includes('видео') || raw.includes('webrtc')) {
      reply = t('orbitos.calls_reply');
    } else if (raw === '/appearance' || raw.includes('тема') || raw.includes('цвет') || raw.includes('дизайн')) {
      reply = t('orbitos.appearance_reply');
    } else if (raw === '/proxy' || raw === '/network' || raw.includes('прокси') || raw.includes('сеть')) {
      reply = t('orbitos.proxy_reply');
    } else if (raw === '/faq' || raw.includes('вопрос')) {
      reply = t('orbitos.faq_reply');
    } else if (raw === '/about' || raw.includes('орбита') || raw.includes('orbita')) {
      reply = t('orbitos.welcome_msg_1');
    } else {
      reply = t('orbitos.default_reply');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

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

