import { useChatStore, Chat, Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { getPusher } from '../utils/pusher';

export interface SupportTicketRecord {
  id?: number;
  ticket_number: string;
  user_code: string;
  sender_nickname?: string;
  message_text: string;
  status: 'sent' | 'answered';
  admin_reply?: string;
  admin_code?: string;
  created_at: string;
  answered_at?: string;
}

class SupportService {
  public readonly BOT_ID = 'system_support';
  public isAdmin: boolean = false;
  private adminToken: string = '';
  private myCode: string = '';
  private t: any = null;
  private syncInterval: any = null;
  private isSubscribed: boolean = false;

  public initSupportChat(t: any): void {
    this.t = t;
    const store = useChatStore.getState();
    this.myCode = store.myCode || '';

    const existing = store.chats.find((c) => c.id === this.BOT_ID);
    const chatName = t('support.name', 'Техническая поддержка');
    const initialLastMsg = t('support.initial_last_msg', 'Служба поддержки Orbita');
    const now = Date.now();

    if (!existing) {
      const botChat: Chat = {
        id: this.BOT_ID,
        type: 'bot',
        name: chatName,
        lastMsg: initialLastMsg,
        online: true,
        description: t('support.description', 'Официальная служба технической поддержки мессенджера Orbita'),
        createdAt: now,
        updatedAt: now,
        unreadCount: 1,
      };
      store.addChat(botChat);

      const welcomeMsg: Message = {
        id: 'support_welcome_1',
        senderId: this.BOT_ID,
        sender: chatName,
        isOutgoing: false,
        text: t('support.welcome_msg', 'Здравствуйте! Вы обратились в официальную службу технической поддержки Orbita.\n\nОпишите ваш вопрос или возникшую проблему в этом чате. Ваше сообщение будет передано администраторам, и ответ поступит прямо сюда.'),
        time: now,
        read: false,
        status: 'delivered',
      };
      store.addMessage(this.BOT_ID, welcomeMsg);
    }

    this.checkAdminStatus();
  }

  public async checkAdminStatus(): Promise<void> {
    const store = useChatStore.getState();
    this.myCode = store.myCode || '';
    if (!this.myCode) return;

    try {
      const res = await fetch(`https://orbitad.vercel.app/support/admin/check?userCode=${encodeURIComponent(this.myCode)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.isAdmin) {
          this.isAdmin = true;

          let storedToken = localStorage.getItem('orbita_admin_token');
          if (!storedToken) {
            const arr = new Uint8Array(24);
            globalThis.crypto.getRandomValues(arr);
            storedToken = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('orbita_admin_token', storedToken);
          }
          this.adminToken = storedToken;

          if (!data.hasToken) {
            await gatewayManager.fetch(/support/admin/register-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userCode: this.myCode, adminToken: this.adminToken }),
            }).catch(() => {});
          }

          store.updateChat(this.BOT_ID, {
            description: this.t ? this.t('support.admin_welcome_short', 'Панель администратора технической поддержки') : 'Панель администратора технической поддержки',
          });

          const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
          if (!existingMsgs.some((m) => m.id === 'support_admin_init')) {
            const adminInitMsg: Message = {
              id: 'support_admin_init',
              senderId: this.BOT_ID,
              sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
              isOutgoing: false,
              text: this.t ? this.t('support.admin_welcome') : 'Вы авторизованы как администратор службы поддержки Orbita.\n\nВходящие обращения пользователей поступают в этот чат в реальном времени. Чтобы ответить на тикет, нажмите кнопку «Ответить» под обращением или отправьте команду:\n/reply #T-XXXXX <текст ответа>',
              time: Date.now(),
              read: false,
              status: 'delivered',
            };
            store.addMessage(this.BOT_ID, adminInitMsg);
          }

          this.setupAdminPusher();
          this.fetchAdminTickets();
          this.startSync(15000);
          return;
        }
      }
    } catch {}

    this.isAdmin = false;
    this.setupUserPusher();
    this.startSync(35000);
  }

  private setupAdminPusher(): void {
    if (this.isSubscribed) return;
    try {
      const pusher = getPusher();
      const channel = pusher.subscribe('support-admin');
      channel.bind('new-ticket', (data: SupportTicketRecord) => {
        if (data) this.handleIncomingTicket(data);
      });
      channel.bind('ticket-updated', (data: any) => {
        if (data?.ticketNumber) this.updateTicketInChat(data.ticketNumber, data.adminReply, data.status);
      });
      this.isSubscribed = true;
    } catch {}
  }

  private setupUserPusher(): void {
    if (this.isSubscribed || !this.myCode) return;
    try {
      const pusher = getPusher();
      const channel = pusher.subscribe(`user-${this.myCode}`);
      channel.bind('ticket-reply', (data: { ticketNumber: string; adminReply: string; answeredAt: string }) => {
        if (data?.ticketNumber && data?.adminReply) {
          this.deliverUserReply(data.ticketNumber, data.adminReply, data.answeredAt);
        }
      });
      this.isSubscribed = true;
    } catch {}
  }

  public async fetchAdminTickets(): Promise<void> {
    if (!this.isAdmin || !this.myCode) return;

    try {
      const headers: Record<string, string> = {};
      if (this.adminToken) {
        headers['X-Admin-Token'] = this.adminToken;
      }
      const res = await fetch(`https://orbitad.vercel.app/support/admin/tickets?userCode=${encodeURIComponent(this.myCode)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const tickets: SupportTicketRecord[] = data.tickets || [];
        const reversed = [...tickets].reverse();
        for (const tk of reversed) {
          this.handleIncomingTicket(tk, false);
        }
      }
    } catch {}
  }

  private handleIncomingTicket(tk: SupportTicketRecord, updateChatHeader: boolean = true): void {
    const store = useChatStore.getState();
    const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
    const msgId = `ticket_${tk.ticket_number}`;
    const alreadyExists = existingMsgs.find((m) => m.id === msgId);

    const isAnswered = tk.status === 'answered';
    const statusText = isAnswered
      ? (this.t ? this.t('support.status_answered', 'Отвечено') : 'Отвечено')
      : (this.t ? this.t('support.status_pending', 'Ожидает ответа') : 'Ожидает ответа');

    const replySection = tk.admin_reply ? `\n\nОтвет: ${tk.admin_reply}` : '';
    const bodyText = `📩 Обращение ${tk.ticket_number}\nОт: ${tk.sender_nickname || 'Пользователь'} (ID: ${tk.user_code})\n\n«${tk.message_text}»\n\nСтатус: ${statusText}${replySection}`;

    const replyButton = isAnswered ? undefined : [
      {
        text: `Ответить на ${tk.ticket_number}`,
        action: 'reply_ticket',
        data: tk.ticket_number,
      },
    ];

    if (alreadyExists) {
      if (alreadyExists.text !== bodyText || Boolean(alreadyExists.buttons) !== Boolean(replyButton)) {
        useChatStore.setState((state) => ({
          messagesByChatId: {
            ...state.messagesByChatId,
            [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) =>
              m.id === msgId ? { ...m, text: bodyText, buttons: replyButton } : m
            ),
          },
        }));
      }
      return;
    }

    const ticketMsg: Message = {
      id: msgId,
      senderId: this.BOT_ID,
      sender: `${tk.sender_nickname || 'Пользователь'} (${tk.ticket_number})`,
      isOutgoing: false,
      text: bodyText,
      time: tk.created_at ? new Date(tk.created_at).getTime() : Date.now(),
      read: false,
      status: 'delivered',
      buttons: replyButton,
    };

    store.addMessage(this.BOT_ID, ticketMsg);
    if (updateChatHeader) {
      store.updateChat(this.BOT_ID, { lastMsg: `Новое обращение ${tk.ticket_number}` });
    }
  }

  private updateTicketInChat(ticketNumber: string, adminReply: string, status: string): void {
    const store = useChatStore.getState();
    const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
    const msgId = `ticket_${ticketNumber}`;
    const target = existingMsgs.find((m) => m.id === msgId);
    if (!target) return;

    const isAnswered = status === 'answered';
    const statusText = isAnswered
      ? (this.t ? this.t('support.status_answered', 'Отвечено') : 'Отвечено')
      : (this.t ? this.t('support.status_pending', 'Ожидает ответа') : 'Ожидает ответа');

    const lines = target.text.split('\n\nСтатус:');
    const baseText = lines[0] || target.text;
    const updatedText = `${baseText}\n\nСтатус: ${statusText}\n\nОтвет: ${adminReply}`;

    useChatStore.setState((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) =>
          m.id === msgId ? { ...m, text: updatedText, buttons: undefined } : m
        ),
      },
    }));
  }

  public async handleUserMessage(userText: string, t: any): Promise<void> {
    this.t = t;
    const raw = userText.trim();
    const lower = raw.toLowerCase();
    const store = useChatStore.getState();

    if (this.isAdmin) {
      if (lower.startsWith('/reply')) {
        const parts = raw.split(/\s+/);
        if (parts.length >= 3) {
          let ticketNum = parts[1].trim();
          if (!ticketNum.startsWith('#')) {
            ticketNum = ticketNum.startsWith('T-') ? `#${ticketNum}` : `#T-${ticketNum}`;
          }
          const replyContent = parts.slice(2).join(' ').trim();
          if (ticketNum && replyContent) {
            try {
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (this.adminToken) headers['X-Admin-Token'] = this.adminToken;

              const res = await gatewayManager.fetch(/support/reply', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  ticketNumber: ticketNum,
                  adminReply: replyContent,
                  adminCode: this.myCode,
                  adminToken: this.adminToken,
                }),
              });

              if (res.ok) {
                this.updateTicketInChat(ticketNum, replyContent, 'answered');
                const successMsg: Message = {
                  id: `admin_sent_${Date.now()}`,
                  senderId: this.BOT_ID,
                  sender: t('support.name', 'Техническая поддержка'),
                  isOutgoing: false,
                  text: t('support.admin_reply_sent', {
                    number: ticketNum,
                    reply: replyContent,
                    defaultValue: `Ответ на обращение ${ticketNum} успешно отправлен пользователю:\n\n«${replyContent}»`,
                  }),
                  time: Date.now(),
                  read: false,
                  status: 'delivered',
                };
                store.addMessage(this.BOT_ID, successMsg);
                store.updateChat(this.BOT_ID, { lastMsg: `Ответ на ${ticketNum} отправлен` });
                return;
              }
            } catch {}
          }
        }
        const errorMsg: Message = {
          id: `admin_err_${Date.now()}`,
          senderId: this.BOT_ID,
          sender: t('support.name', 'Техническая поддержка'),
          isOutgoing: false,
          text: t('support.admin_prompt_format', 'Чтобы отправить ответ пользователю, нажмите кнопку «Ответить» под тикетом или используйте формат:\n/reply #T-XXXXX <ваш ответ>'),
          time: Date.now(),
          read: false,
          status: 'delivered',
        };
        store.addMessage(this.BOT_ID, errorMsg);
        return;
      }

      if (lower === '/tickets' || lower === '/list') {
        await this.fetchAdminTickets();
        const currentMsgs = store.messagesByChatId[this.BOT_ID] || [];
        const openTickets = currentMsgs.filter((m) => Boolean(m.id && m.id.startsWith('ticket_')) && Boolean(m.buttons && m.buttons.length > 0));
        const text = openTickets.length === 0
          ? t('support.admin_no_open_tickets', 'Нет активных ожидающих обращений.')
          : t('support.admin_open_tickets_summary', {
              list: openTickets.map((m) => `• ${m.sender}`).join('\n'),
              defaultValue: `Ожидающие ответа обращения:\n\n${openTickets.map((m) => `• ${m.sender}`).join('\n')}`,
            });
        const summaryMsg: Message = {
          id: `admin_summary_${Date.now()}`,
          senderId: this.BOT_ID,
          sender: t('support.name', 'Техническая поддержка'),
          isOutgoing: false,
          text,
          time: Date.now(),
          read: false,
          status: 'delivered',
        };
        store.addMessage(this.BOT_ID, summaryMsg);
        return;
      }

      if (lower === '/help' || lower === '/start') {
        const helpMsg: Message = {
          id: `admin_help_${Date.now()}`,
          senderId: this.BOT_ID,
          sender: t('support.name', 'Техническая поддержка'),
          isOutgoing: false,
          text: t('support.admin_help', 'Команды администратора поддержки:\n\n/reply #T-XXXXX <текст> — ответить на обращение\n/tickets — обновить список обращений\n/check — проверить статус администратора'),
          time: Date.now(),
          read: false,
          status: 'delivered',
        };
        store.addMessage(this.BOT_ID, helpMsg);
        return;
      }

      const promptMsg: Message = {
        id: `admin_prompt_${Date.now()}`,
        senderId: this.BOT_ID,
        sender: t('support.name', 'Техническая поддержка'),
        isOutgoing: false,
        text: t('support.admin_prompt_format', 'Чтобы отправить ответ пользователю, нажмите кнопку «Ответить» под тикетом или используйте формат:\n/reply #T-XXXXX <ваш ответ>'),
        time: Date.now(),
        read: false,
        status: 'delivered',
      };
      store.addMessage(this.BOT_ID, promptMsg);
      return;
    }

    if (lower === '/start') {
      this.sendBotReply(t('support.welcome_msg'));
      return;
    }
    if (lower === '/help') {
      this.sendBotReply(t('support.help_reply'));
      return;
    }
    if (lower === '/faq') {
      this.sendBotReply(t('support.faq_reply'));
      return;
    }

    if (lower === '/ticket' || lower === '/tickets') {
      try {
        const res = await fetch(`https://orbitad.vercel.app/support/tickets?userCode=${encodeURIComponent(this.myCode)}`);
        if (res.ok) {
          const data = await res.json();
          const tickets = data.tickets || [];
          if (tickets.length === 0) {
            this.sendBotReply(t('support.ticket_status_none'));
          } else {
            const list = tickets
              .slice(0, 5)
              .map((tk: any) => `${tk.ticket_number} [${tk.status === 'answered' ? 'Отвечено' : 'В обработке'}]`)
              .join('\n');
            this.sendBotReply(`${list}\n\n${t('support.ticket_status_info')}`);
          }
        } else {
          this.sendBotReply(t('support.ticket_status_info'));
        }
      } catch {
        this.sendBotReply(t('support.ticket_status_info'));
      }
      return;
    }

    const ticketNumber = `#T-${Math.floor(10000 + Math.random() * 90000)}`;
    const myNickname = useAuthStore.getState().nickname || 'User';

    try {
      await gatewayManager.fetch(/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber,
          userCode: this.myCode,
          senderNickname: myNickname,
          messageText: userText,
        }),
      }).catch(() => {});
    } catch {}

    const replyText = t('support.ticket_created', {
      number: ticketNumber,
      defaultValue: `Обращение ${ticketNumber} зарегистрировано.\nСтатус: Отправлено (Sent).\n\nОператор ответит вам в этом чате.`,
    });
    this.sendBotReply(replyText);
  }

  private sendBotReply(text: string): void {
    const store = useChatStore.getState();
    const replyMsg: Message = {
      id: `support_reply_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: this.BOT_ID,
      sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
      isOutgoing: false,
      text,
      time: Date.now(),
      read: false,
      status: 'delivered',
    };
    store.addMessage(this.BOT_ID, replyMsg);
    store.updateChat(this.BOT_ID, { lastMsg: text });
  }

  public startSync(intervalMs: number = 30000): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.isAdmin) {
        this.fetchAdminTickets();
      } else {
        this.checkAdminReplies();
      }
    }, intervalMs);

    if (this.isAdmin) {
      this.fetchAdminTickets();
    } else {
      this.checkAdminReplies();
    }
  }

  private deliverUserReply(ticketNumber: string, adminReply: string, answeredAt?: string): void {
    const store = useChatStore.getState();
    const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];
    const replyId = `admin_reply_${ticketNumber}`;
    if (existingMsgs.some((m) => m.id === replyId)) return;

    const replyMsg: Message = {
      id: replyId,
      senderId: this.BOT_ID,
      sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
      isOutgoing: false,
      text: `Ответ по обращению ${ticketNumber}:\n\n${adminReply}`,
      time: answeredAt ? new Date(answeredAt).getTime() : Date.now(),
      read: false,
      status: 'delivered',
    };
    store.addMessage(this.BOT_ID, replyMsg);
    store.updateChat(this.BOT_ID, { lastMsg: replyMsg.text });
  }

  public async checkAdminReplies(): Promise<void> {
    if (!this.myCode) return;

    try {
      const res = await fetch(`https://orbitad.vercel.app/support/tickets?userCode=${encodeURIComponent(this.myCode)}`);
      if (res.ok) {
        const data = await res.json();
        const tickets = data.tickets || [];
        for (const tk of tickets) {
          if (tk.status === 'answered' && tk.admin_reply) {
            this.deliverUserReply(tk.ticket_number, tk.admin_reply, tk.answered_at);
          }
        }
      }
    } catch {}
  }
}

export const supportService = new SupportService();
