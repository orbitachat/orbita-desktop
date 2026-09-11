import { useChatStore, Chat, Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

class SupportService {
  public readonly BOT_ID = 'system_support';
  private syncInterval: any = null;

  public initSupportChat(t: any): void {
    const store = useChatStore.getState();
    const existing = store.chats.find((c) => c.id === this.BOT_ID);
    if (existing) return;

    const chatName = t('support.name', 'Техническая поддержка');
    const initialLastMsg = t('support.initial_last_msg', 'Служба поддержки Orbita');
    const now = Date.now();

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

    this.startSync();
  }

  public async handleUserMessage(userText: string, t: any): Promise<void> {
    const raw = userText.trim().toLowerCase();
    const store = useChatStore.getState();
    const myCode = store.myCode || 'ANON';
    const myNickname = useAuthStore.getState().nickname || 'User';

    let replyText = '';

    if (raw === '/start') {
      replyText = t('support.welcome_msg');
    } else if (raw === '/help') {
      replyText = t('support.help_reply');
    } else if (raw === '/faq') {
      replyText = t('support.faq_reply');
    } else if (raw === '/ticket' || raw === '/tickets') {
      try {
        const res = await fetch(`https://orbitad.vercel.app/support/tickets?userCode=${encodeURIComponent(myCode)}`);
        if (res.ok) {
          const data = await res.json();
          const tickets = data.tickets || [];
          if (tickets.length === 0) {
            replyText = t('support.ticket_status_none');
          } else {
            const list = tickets
              .slice(0, 5)
              .map((tk: any) => `${tk.ticket_number} [${tk.status === 'answered' ? 'Отвечено' : 'В обработке'}]`)
              .join('\n');
            replyText = `${list}\n\n${t('support.ticket_status_info')}`;
          }
        } else {
          replyText = t('support.ticket_status_info');
        }
      } catch {
        replyText = t('support.ticket_status_info');
      }
    } else {
      const ticketNumber = `#T-${Math.floor(10000 + Math.random() * 90000)}`;

      try {
        await fetch('https://orbitad.vercel.app/support/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber,
            userCode: myCode,
            senderNickname: myNickname,
            messageText: userText,
          }),
        }).catch(() => {});
      } catch {}

      replyText = t('support.ticket_created', {
        number: ticketNumber,
        defaultValue: `Обращение ${ticketNumber} зарегистрировано.\nСтатус: Отправлено (Sent).\n\nОператор ответит вам в этом чате.`,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const replyMsg: Message = {
      id: `support_reply_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: this.BOT_ID,
      sender: t('support.name', 'Техническая поддержка'),
      isOutgoing: false,
      text: replyText,
      time: Date.now(),
      read: false,
      status: 'delivered',
    };

    store.addMessage(this.BOT_ID, replyMsg);
    store.updateChat(this.BOT_ID, { lastMsg: replyText });
  }

  public startSync(): void {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => {
      this.checkAdminReplies();
    }, 45000);
    this.checkAdminReplies();
  }

  public async checkAdminReplies(): Promise<void> {
    const store = useChatStore.getState();
    const myCode = store.myCode;
    if (!myCode) return;

    try {
      const res = await fetch(`https://orbitad.vercel.app/support/tickets?userCode=${encodeURIComponent(myCode)}`);
      if (res.ok) {
        const data = await res.json();
        const tickets = data.tickets || [];
        const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];

        for (const t of tickets) {
          if (t.status === 'answered' && t.admin_reply) {
            const replyId = `admin_reply_${t.ticket_number}`;
            const alreadyAdded = existingMsgs.some((m) => m.id === replyId);
            if (!alreadyAdded) {
              const replyMsg: Message = {
                id: replyId,
                senderId: this.BOT_ID,
                sender: 'Техническая поддержка',
                isOutgoing: false,
                text: `Ответ по обращению ${t.ticket_number}:\n\n${t.admin_reply}`,
                time: t.answered_at ? new Date(t.answered_at).getTime() : Date.now(),
                read: false,
                status: 'delivered',
              };
              store.addMessage(this.BOT_ID, replyMsg);
              store.updateChat(this.BOT_ID, { lastMsg: replyMsg.text });
            }
          }
        }
      }
    } catch {}
  }
}

export const supportService = new SupportService();
