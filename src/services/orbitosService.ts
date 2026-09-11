import { useChatStore, Chat, Message } from '../store/useChatStore';

class OrbitosService {
  public readonly BOT_ID = 'system_orbitos';

  public initOrbitosChat(t: any): void {
    const store = useChatStore.getState();
    const existing = store.chats.find((c) => c.id === this.BOT_ID);
    if (existing) {
      const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
      const hasButtons = existingMsgs.some((m) => m.buttons && m.buttons.length > 0);
      if (!hasButtons && existingMsgs.length > 0) {
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) => {
              if (m.id === 'orbitos_welcome_2' && !m.buttons) {
                return {
                  ...m,
                  buttons: [
                    {
                      text: t('orbitos.btn_backup', '🛡️ Резервная копия'),
                      action: 'open_backup',
                      icon: 'backup' as const,
                    },
                  ],
                };
              }
              if (m.id === 'orbitos_welcome_3' && !m.buttons) {
                return {
                  ...m,
                  buttons: [
                    {
                      text: t('orbitos.btn_channel', '📢 Перейти в Orbita Updates'),
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

    const chatName = t('orbitos.name', 'Орбитос');
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
        text: t('orbitos.welcome_msg_1', 'Привет! Меня зовут Орбитос 🪐\nДобро пожаловать в Orbita!'),
        time: now - 3000,
        read: false,
        status: 'delivered',
      },
      {
        id: 'orbitos_welcome_2',
        senderId: this.BOT_ID,
        sender: chatName,
        isOutgoing: false,
        text: t('orbitos.welcome_msg_2', 'Не забудьте сделать резервную копию профиля в настройках.\n\nИстория сообщений хранится строго локально на ваших устройствах.'),
        time: now - 2000,
        read: false,
        status: 'delivered',
        buttons: [
          {
            text: t('orbitos.btn_backup', '🛡️ Резервная копия'),
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
        text: t('orbitos.welcome_msg_3', 'Рекомендую подписаться на официальный канал:\n\nOrbita Updates:\nVZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9'),
        time: now - 1000,
        read: false,
        status: 'delivered',
        buttons: [
          {
            text: t('orbitos.btn_channel', '📢 Перейти в Orbita Updates'),
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

    if (raw === '/help' || raw === 'помощь' || raw === 'help' || raw === '/start') {
      reply = t('orbitos.help_reply');
      buttons = [
        {
          text: t('orbitos.btn_channel', '📢 Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
          icon: 'channel',
        },
        {
          text: t('orbitos.btn_backup', '🛡️ Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else if (raw === '/backup' || raw.includes('бэкап') || raw.includes('копи')) {
      reply = t('orbitos.backup_reply');
      buttons = [
        {
          text: t('orbitos.btn_backup', '🛡️ Резервная копия'),
          action: 'open_backup',
          icon: 'backup',
        },
      ];
    } else if (raw === '/channels' || raw.includes('канал')) {
      reply = t('orbitos.channels_reply');
      buttons = [
        {
          text: t('orbitos.btn_channel', '📢 Перейти в Orbita Updates'),
          action: 'open_channel',
          channelId: 'VZAXNAEWMWT3HGDZHI702JDB1PMSDCJ17DMUD2HIR9',
          icon: 'channel',
        },
      ];
    } else if (raw === '/security' || raw.includes('безопасн') || raw.includes('шифр')) {
      reply = t('orbitos.security_reply');
    } else if (raw === '/about' || raw.includes('орбита') || raw.includes('orbita')) {
      reply = t('orbitos.welcome_msg_1');
    } else {
      reply = t('orbitos.default_reply');
    }

    await new Promise((resolve) => setTimeout(resolve, 650));

    const store = useChatStore.getState();
    const replyMsg: Message = {
      id: `bot_reply_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: this.BOT_ID,
      sender: t('orbitos.name', 'Орбитос'),
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

