import { useChatStore, Chat, Message } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { getPusher } from '../utils/pusher';
import { gatewayManager } from './gatewayManager';
import { ablyService } from './ablyService';
import { parseReplyChain } from '../utils/messageUtils';
import { deriveTicketKey, encryptMessage, decryptMessage } from '../lib/crypto';

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
  decrypted_message_text?: string;
}

export type SupportTicketsListener = (tickets: SupportTicketRecord[]) => void;

class SupportService {
  public readonly BOT_ID = 'system_support';
  public isAdmin: boolean = false;
  public activeTicketNumber: string | null = null;
  private adminToken: string = '';
  private myCode: string = '';
  private t: any = null;
  private syncInterval: any = null;
  private isAdminSubscribed: boolean = false;
  private isUserSubscribed: boolean = false;
  private cachedTickets: SupportTicketRecord[] = [];
  private ticketsListeners: Set<SupportTicketsListener> = new Set();

  public subscribeToTickets(listener: SupportTicketsListener): () => void {
    this.ticketsListeners.add(listener);
    listener(this.cachedTickets);
    return () => {
      this.ticketsListeners.delete(listener);
    };
  }

  public getCachedTickets(): SupportTicketRecord[] {
    return this.cachedTickets;
  }

  private notifyTicketsListeners(): void {
    this.ticketsListeners.forEach((fn) => fn(this.cachedTickets));
  }

  public restoreSupportChat(): void {
    const store = useChatStore.getState();
    if (store.chats.some((c) => c.id === this.BOT_ID)) return;
    const chatName = this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка';
    const now = Date.now();
    const botChat: Chat = {
      id: this.BOT_ID,
      type: 'bot',
      name: chatName,
      lastMsg: '',
      online: true,
      description: this.t ? this.t('support.description', 'Официальная служба технической поддержки мессенджера Orbita') : 'Официальная служба технической поддержки мессенджера Orbita',
      createdAt: now,
      updatedAt: now,
      unreadCount: 1,
    };
    store.addChat(botChat);
  }

  public initSupportChat(t: any, userCode?: string): void {
    this.t = t;
    const store = useChatStore.getState();
    this.myCode = userCode || store.myCode || this.myCode || '';
    this.activeTicketNumber = localStorage.getItem('orbita_user_active_ticket');

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

    if (!this.myCode) {
      const unsub = useChatStore.subscribe((state) => {
        if (state.myCode && state.myCode !== this.myCode) {
          this.myCode = state.myCode;
          this.checkAdminStatus();
          unsub();
        }
      });
    } else {
      this.checkAdminStatus();
    }
  }

  public async checkAdminStatus(): Promise<void> {
    const store = useChatStore.getState();
    this.myCode = store.myCode || this.myCode || '';
    if (!this.myCode) return;

    try {
      const res = await gatewayManager.fetch(`/support/admin/check?userCode=${encodeURIComponent(this.myCode)}`);
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

          await gatewayManager.fetch('/support/admin/register-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userCode: this.myCode, adminToken: this.adminToken }),
          }).catch(() => {});

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

          this.setupAdminRealtime();
          this.fetchAdminTickets();
          this.startSync(60000);
          return;
        }
      }
    } catch {}

    this.isAdmin = false;
    this.setupUserRealtime();
    this.startSync(120000);
  }

  private setupAdminRealtime(): void {
    if (this.isAdminSubscribed) return;
    try {
      const pusher = getPusher();
      const channel = pusher.subscribe('support-admin');
      channel.bind('new-ticket', (data: SupportTicketRecord) => {
        if (data) this.handleIncomingTicket(data);
      });
      channel.bind('ticket-updated', (data: any) => {
        if (data) this.handleIncomingTicket(data);
      });
      channel.bind('ticket-closed', (data: any) => {
        const tNum = data?.ticket_number || data?.ticketNumber;
        if (tNum) this.handleTicketClosedLocally(tNum);
      });
    } catch {}

    try {
      ablyService.subscribeToChatMessages('support-admin', (data: any) => {
        if (!data) return;
        if (data.type === 'ticket-closed' || data.event === 'ticket-closed') {
          const tNum = data.ticket_number || data.ticketNumber;
          if (tNum) this.handleTicketClosedLocally(tNum);
        } else if (data.type === 'new-ticket' && data.ticket) {
          this.handleIncomingTicket(data.ticket);
        } else if (data.ticket_number || data.ticketNumber) {
          this.handleIncomingTicket(data);
        }
      });
      ablyService.subscribeToChatMessages('chat:support-admin', (data: any) => {
        if (!data) return;
        if (data.type === 'ticket-closed' || data.event === 'ticket-closed') {
          const tNum = data.ticket_number || data.ticketNumber;
          if (tNum) this.handleTicketClosedLocally(tNum);
        } else if (data.type === 'new-ticket' && data.ticket) {
          this.handleIncomingTicket(data.ticket);
        } else if (data.ticket_number || data.ticketNumber) {
          this.handleIncomingTicket(data);
        }
      });
    } catch {}

    this.isAdminSubscribed = true;
  }

  private setupUserRealtime(): void {
    if (this.isUserSubscribed || !this.myCode) return;
    try {
      const pusher = getPusher();
      const channel = pusher.subscribe(`user-${this.myCode}`);
      channel.bind('ticket-reply', (data: { ticketNumber: string; adminReply: string; answeredAt: string }) => {
        if (data?.ticketNumber && data?.adminReply) {
          this.deliverUserReply(data.ticketNumber, data.adminReply, data.answeredAt);
        }
      });
      channel.bind('ticket-closed', (data: { ticketNumber: string }) => {
        if (data?.ticketNumber) this.handleTicketClosedForUser(data.ticketNumber);
      });
    } catch {}

    try {
      ablyService.subscribeToChatMessages(`user-${this.myCode}`, (data: any) => {
        if (data?.type === 'ticket-reply' || (data?.ticketNumber && data?.adminReply)) {
          this.deliverUserReply(data.ticketNumber, data.adminReply, data.answeredAt);
        } else if (data?.type === 'ticket-closed' || data?.event === 'ticket-closed') {
          this.handleTicketClosedForUser(data.ticketNumber);
        }
      });
      ablyService.subscribeToChatMessages(`chat:user-${this.myCode}`, (data: any) => {
        if (data?.type === 'ticket-reply' || (data?.ticketNumber && data?.adminReply)) {
          this.deliverUserReply(data.ticketNumber, data.adminReply, data.answeredAt);
        } else if (data?.type === 'ticket-closed') {
          this.handleTicketClosedForUser(data.ticketNumber);
        }
      });
    } catch {}

    this.isUserSubscribed = true;
  }

  public async fetchAdminTickets(): Promise<void> {
    if (!this.isAdmin || !this.myCode) return;

    try {
      const headers: Record<string, string> = {};
      if (this.adminToken) {
        headers['X-Admin-Token'] = this.adminToken;
      }
      const tokenQuery = this.adminToken ? `&adminToken=${encodeURIComponent(this.adminToken)}` : '';
      const res = await gatewayManager.fetch(`/support/admin/tickets?userCode=${encodeURIComponent(this.myCode)}${tokenQuery}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const tickets: SupportTicketRecord[] = data.tickets || [];
        const decryptedList = await Promise.all(
          tickets.map(async (tk) => {
            const dec = await this.decryptTicketPayload(tk);
            return {
              ...tk,
              decrypted_message_text: dec.messageText,
              admin_reply: dec.adminReply || tk.admin_reply,
            };
          })
        );
        this.cachedTickets = decryptedList;
        this.notifyTicketsListeners();
        const reversed = [...decryptedList].reverse();
        for (const tk of reversed) {
          await this.handleIncomingTicket(tk, false);
        }
      }
    } catch {}
  }

  private async decryptTicketPayload(tk: SupportTicketRecord): Promise<{ messageText: string; adminReply?: string; parts: string[] }> {
    const ticketNum = tk.ticket_number || (tk as any).ticketNumber;
    const ticketKey = deriveTicketKey(ticketNum);
    const rawText = tk.message_text || (tk as any).messageText || '';
    const rawParts = rawText.split('\n\n---\n\n');
    const decryptedParts = await Promise.all(
      rawParts.map(async (part: string) => {
        const trimmed = part.trim();
        if (trimmed.startsWith('orb_e2e:')) {
          const dec = await decryptMessage(trimmed.slice(8), ticketKey);
          return (dec && dec !== '[ENCRYPTED MESSAGE]') ? dec : trimmed;
        }
        return trimmed;
      })
    );
    const messageText = decryptedParts.join('\n\n---\n\n');

    let adminReply = tk.admin_reply || (tk as any).adminReply;
    if (adminReply && adminReply.startsWith('orb_e2e:')) {
      const dec = await decryptMessage(adminReply.slice(8), ticketKey);
      if (dec && dec !== '[ENCRYPTED MESSAGE]') adminReply = dec;
    }

    return { messageText, adminReply, parts: decryptedParts };
  }

  private async handleIncomingTicket(tk: SupportTicketRecord, updateChatHeader: boolean = true): Promise<void> {
    this.restoreSupportChat();
    const ticketNum = tk.ticket_number || (tk as any).ticketNumber;
    if (!ticketNum) return;

    const { adminReply, parts } = await this.decryptTicketPayload(tk);
    const store = useChatStore.getState();
    const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];

    const isAnswered = tk.status === 'answered';

    const replyButtons = [
      ...(!isAnswered ? [{
        text: `Ответить на ${ticketNum}`,
        action: 'reply_ticket',
        data: ticketNum,
      }] : []),
      {
        text: `Закрыть ${ticketNum}`,
        action: 'close_ticket',
        data: ticketNum,
      },
    ];

    let hasNewQuestions = false;
    let latestQuestionText = '';

    for (let i = 0; i < parts.length; i++) {
      const partText = parts[i].trim();
      if (!partText) continue;

      const msgId = i === 0 ? `ticket_${ticketNum}` : `ticket_${ticketNum}_part_${i}`;
      const existing = existingMsgs.find((m) => m.id === msgId || (i === 0 && m.id === `ticket_${ticketNum}_part_0`));

      if (existing) {
        if (existing.text && (existing.text.includes('\n\nСтатус:') || existing.text.includes('\n\nОтвет:'))) {
          const cleanedText = existing.text.split('\n\nСтатус:')[0].split('\n\nОтвет:')[0].trim();
          if (cleanedText && cleanedText !== existing.text) {
            useChatStore.setState((state) => ({
              messagesByChatId: {
                ...state.messagesByChatId,
                [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) =>
                  m.id === existing.id ? { ...m, text: cleanedText } : m
                ),
              },
            }));
          }
        }
        continue;
      }

      hasNewQuestions = true;
      latestQuestionText = partText;
      const titlePrefix = i === 0
        ? `📩 Обращение ${ticketNum}`
        : `📩 Новый вопрос в обращении ${ticketNum} (#${i + 1})`;
      const senderNick = tk.sender_nickname || (tk as any).senderNickname || 'Пользователь';
      const uCode = tk.user_code || (tk as any).userCode || 'ANON';
      const bodyText = `${titlePrefix}\nОт: ${senderNick} (ID: ${uCode})\n\n«${partText}»`;

      const ticketMsg: Message = {
        id: msgId,
        senderId: this.BOT_ID,
        sender: `${senderNick} (${ticketNum})`,
        isOutgoing: false,
        text: bodyText,
        time: tk.created_at ? (new Date(tk.created_at).getTime() + i * 1000) : (Date.now() + i * 1000),
        read: false,
        status: 'delivered',
        buttons: replyButtons,
      };
      store.addMessage(this.BOT_ID, ticketMsg);
    }

    if (adminReply) {
      const replyParts = adminReply.split('\n\n---\n\n');
      for (let r = 0; r < replyParts.length; r++) {
        const rPart = replyParts[r].trim();
        if (!rPart) continue;
        const sentId = `admin_sent_${ticketNum}_${r}`;
        const alreadySent = existingMsgs.some((m) => m.id === sentId || (m.text && m.text.includes(rPart)));
        if (!alreadySent) {
          const replyMsg: Message = {
            id: sentId,
            senderId: this.BOT_ID,
            sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
            isOutgoing: false,
            text: this.t ? this.t('support.admin_reply_sent', {
              number: ticketNum,
              reply: rPart,
              defaultValue: `Ответ на обращение ${ticketNum} успешно отправлен пользователю:\n\n«${rPart}»`,
            }) : `Ответ на обращение ${ticketNum} успешно отправлен пользователю:\n\n«${rPart}»`,
            time: tk.answered_at ? (new Date(tk.answered_at).getTime() + r * 1000) : Date.now(),
            read: false,
            status: 'delivered',
          };
          store.addMessage(this.BOT_ID, replyMsg);
        }
      }
    }

    if (hasNewQuestions && updateChatHeader) {
      const headerMsg = parts.length > 1
        ? `Новый вопрос в ${ticketNum}: «${latestQuestionText}»`
        : `Новое обращение ${ticketNum}: «${latestQuestionText}»`;
      store.updateChat(this.BOT_ID, { lastMsg: headerMsg });
    }
  }

  private async updateTicketInChat(ticketNumber: string, adminReply: string, status: 'sent' | 'answered' = 'answered'): Promise<void> {
    this.cachedTickets = this.cachedTickets.map((t) =>
      t.ticket_number === ticketNumber ? { ...t, status, admin_reply: adminReply } : t
    );
    this.notifyTicketsListeners();
  }

  private handleTicketClosedLocally(ticketNumber: string): void {
    const store = useChatStore.getState();
    useChatStore.setState((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [this.BOT_ID]: (state.messagesByChatId[this.BOT_ID] || []).map((m) => {
          if (m.id && (m.id === `ticket_${ticketNumber}` || m.id.startsWith(`ticket_${ticketNumber}_`))) {
            return {
              ...m,
              buttons: undefined,
            };
          }
          return m;
        }),
      },
    }));

    this.cachedTickets = this.cachedTickets.filter((t) => t.ticket_number !== ticketNumber);
    this.notifyTicketsListeners();
    store.updateChat(this.BOT_ID, { lastMsg: `Обращение ${ticketNumber} закрыто` });
  }

  private handleTicketClosedForUser(ticketNumber: string): void {
    if (this.activeTicketNumber === ticketNumber) {
      this.activeTicketNumber = null;
      localStorage.removeItem('orbita_user_active_ticket');
    }
    const store = useChatStore.getState();
    const closedMsg: Message = {
      id: `user_closed_${ticketNumber}_${Date.now()}`,
      senderId: this.BOT_ID,
      sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
      isOutgoing: false,
      text: this.t ? this.t('support.ticket_closed_by_admin', { number: ticketNumber, defaultValue: `Обращение ${ticketNumber} закрыто администратором службы поддержки.` }) : `Обращение ${ticketNumber} закрыто администратором службы поддержки.`,
      time: Date.now(),
      read: false,
      status: 'delivered',
    };
    store.addMessage(this.BOT_ID, closedMsg);
    store.updateChat(this.BOT_ID, { lastMsg: closedMsg.text });
  }

  public async closeTicket(ticketNumber: string): Promise<boolean> {
    if (!this.isAdmin || !this.myCode) return false;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.adminToken) headers['X-Admin-Token'] = this.adminToken;

      const res = await gatewayManager.fetch('/support/close', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ticketNumber,
          adminCode: this.myCode,
          adminToken: this.adminToken,
        }),
      });

      if (res.ok) {
        this.handleTicketClosedLocally(ticketNumber);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async replyToTicket(ticketNum: string, replyContent: string): Promise<boolean> {
    if (!this.isAdmin || !this.myCode) return false;
    try {
      const ticketKey = deriveTicketKey(ticketNum);
      const encryptedReply = `orb_e2e:${await encryptMessage(replyContent, ticketKey)}`;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.adminToken) headers['X-Admin-Token'] = this.adminToken;

      const res = await gatewayManager.fetch('/support/reply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ticketNumber: ticketNum,
          adminReply: encryptedReply,
          adminCode: this.myCode,
          adminToken: this.adminToken,
        }),
      });

      if (res.ok) {
        await this.updateTicketInChat(ticketNum, replyContent, 'answered');
        const store = useChatStore.getState();
        const successMsg: Message = {
          id: `admin_sent_${Date.now()}`,
          senderId: this.BOT_ID,
          sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
          isOutgoing: false,
          text: this.t ? this.t('support.admin_reply_sent', {
            number: ticketNum,
            reply: replyContent,
            defaultValue: `Ответ на обращение ${ticketNum} успешно отправлен пользователю:\n\n«${replyContent}»`,
          }) : `Ответ на обращение ${ticketNum} успешно отправлен пользователю:\n\n«${replyContent}»`,
          time: Date.now(),
          read: false,
          status: 'delivered',
        };
        store.addMessage(this.BOT_ID, successMsg);
        store.updateChat(this.BOT_ID, { lastMsg: `Ответ на ${ticketNum} отправлен` });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public async handleUserMessage(userText: string, t: any, mediaUrl?: string, mediaType?: string): Promise<void> {
    this.restoreSupportChat();
    this.t = t;
    const raw = userText.trim();
    const lower = raw.toLowerCase();
    const store = useChatStore.getState();

    if (this.isAdmin) {
      let ticketNum = '';
      let replyContent = '';

      const replyMatch = raw.match(/^\/reply\s+(?:#?T-?)?(\d+)\s+([\s\S]+)$/i);
      if (replyMatch) {
        ticketNum = `#T-${replyMatch[1]}`;
        replyContent = replyMatch[2].trim().replace(/^<([\s\S]+)>$/, '$1').trim();
      } else {
        const parsedReply = parseReplyChain(raw);
        const quotedTicketMatch = raw.match(/#T-(\d+)/i);
        if (quotedTicketMatch && parsedReply.quotes.length > 0 && parsedReply.body.trim()) {
          ticketNum = `#T-${quotedTicketMatch[1]}`;
          replyContent = parsedReply.body.trim();
        }
      }

      if (ticketNum && replyContent) {
        const finalReplyContent = mediaUrl
          ? [replyContent, `[${mediaType || 'вложение'}] ${mediaUrl}`].filter(Boolean).join('\n')
          : replyContent;
        const ok = await this.replyToTicket(ticketNum, finalReplyContent);
        if (!ok) {
          const errorMsg: Message = {
            id: `admin_err_${Date.now()}`,
            senderId: this.BOT_ID,
            sender: t('support.name', 'Техническая поддержка'),
            isOutgoing: false,
            text: `${t('support.admin_reply_error')}`,
            time: Date.now(),
            read: false,
            status: 'delivered',
          };
          store.addMessage(this.BOT_ID, errorMsg);
        }
        return;
      }

      const closeMatch = raw.match(/^\/close\s+(?:#?T-?)?(\d+)$/i);
      if (closeMatch) {
        const closeTicketNum = `#T-${closeMatch[1]}`;
        const closed = await this.closeTicket(closeTicketNum);
        const feedbackMsg: Message = {
          id: `admin_close_${Date.now()}`,
          senderId: this.BOT_ID,
          sender: t('support.name', 'Техническая поддержка'),
          isOutgoing: false,
          text: closed
            ? t('support.ticket_closed_success', { number: closeTicketNum, defaultValue: `Обращение ${closeTicketNum} успешно закрыто.` })
            : t('support.ticket_closed_error', 'Не удалось закрыть обращение.'),
          time: Date.now(),
          read: false,
          status: 'delivered',
        };
        store.addMessage(this.BOT_ID, feedbackMsg);
        return;
      }

      if (lower.startsWith('/reply')) {
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
          text: t('support.admin_help', 'Команды администратора поддержки:\n\n/reply #T-XXXXX <текст> — ответить на обращение\n/close #T-XXXXX — закрыть обращение\n/tickets — обновить список обращений\n/check — проверить статус администратора'),
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
        const res = await gatewayManager.fetch(`/support/tickets?userCode=${encodeURIComponent(this.myCode)}`);
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

    let ticketNumber = this.activeTicketNumber;
    let isContinuation = false;

    if (!ticketNumber) {
      ticketNumber = `#T-${Math.floor(10000 + Math.random() * 90000)}`;
      this.activeTicketNumber = ticketNumber;
      localStorage.setItem('orbita_user_active_ticket', ticketNumber);
    } else {
      isContinuation = true;
    }

    const myNickname = useAuthStore.getState().nickname || 'User';
    const finalUserText = mediaUrl
      ? [userText, `[${mediaType || 'вложение'}] ${mediaUrl}`].filter(Boolean).join('\n')
      : userText;
    const ticketKey = deriveTicketKey(ticketNumber);
    const encryptedText = `orb_e2e:${await encryptMessage(finalUserText, ticketKey)}`;

    try {
      await gatewayManager.fetch('/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber,
          userCode: this.myCode,
          senderNickname: myNickname,
          messageText: encryptedText,
        }),
      }).catch(() => {});
    } catch {}

    if (!isContinuation) {
      const replyText = t('support.ticket_created', {
        number: ticketNumber,
        defaultValue: `Обращение ${ticketNumber} зарегистрировано.\nСтатус: Отправлено (Sent).\n\nОператор ответит вам в этом чате.`,
      });
      this.sendBotReply(replyText);
    } else {
      const replyText = t('support.ticket_message_added', {
        number: ticketNumber,
        defaultValue: `Сообщение добавлено к обращению ${ticketNumber}.\nСтатус: Передано оператору.`,
      });
      this.sendBotReply(replyText);
    }
  }

  private sendBotReply(text: string): void {
    this.restoreSupportChat();
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

  public startSync(intervalMs: number = 120000): void {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => {
      if (this.isAdmin) {
        this.fetchAdminTickets();
      } else if (this.activeTicketNumber) {
        this.checkAdminReplies();
      }
    }, intervalMs);

    if (this.isAdmin) {
      this.fetchAdminTickets();
    } else if (this.activeTicketNumber) {
      this.checkAdminReplies();
    }
  }

  private async deliverUserReply(ticketNumber: string, adminReply: string, answeredAt?: string): Promise<void> {
    this.restoreSupportChat();
    const ticketKey = deriveTicketKey(ticketNumber);
    const rawParts = (adminReply || '').split('\n\n---\n\n');

    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i].trim();
      if (!part) continue;

      let cleanPart = part;
      if (cleanPart.startsWith('orb_e2e:')) {
        const dec = await decryptMessage(cleanPart.slice(8), ticketKey);
        if (dec && dec !== '[ENCRYPTED MESSAGE]') cleanPart = dec;
      }

      const store = useChatStore.getState();
      const existingMsgs = store.messagesByChatId[this.BOT_ID] || [];

      if (existingMsgs.some((m) => m.text && m.text.includes(cleanPart))) {
        continue;
      }

      let replyId = i === 0 ? `admin_reply_${ticketNumber}` : `admin_reply_${ticketNumber}_part_${i}`;
      if (existingMsgs.some((m) => m.id === replyId)) {
        let counter = 1;
        while (existingMsgs.some((m) => m.id === `admin_reply_${ticketNumber}_part_${counter}`)) {
          counter++;
        }
        replyId = `admin_reply_${ticketNumber}_part_${counter}`;
      }

      const replyMsg: Message = {
        id: replyId,
        senderId: this.BOT_ID,
        sender: this.t ? this.t('support.name', 'Техническая поддержка') : 'Техническая поддержка',
        isOutgoing: false,
        text: `Ответ по обращению ${ticketNumber}:\n\n${cleanPart}`,
        time: answeredAt ? (new Date(answeredAt).getTime() + i * 1000) : (Date.now() + i * 1000),
        read: false,
        status: 'delivered',
      };
      store.addMessage(this.BOT_ID, replyMsg);
      store.updateChat(this.BOT_ID, { lastMsg: replyMsg.text });
    }
  }

  public async checkAdminReplies(): Promise<void> {
    if (!this.myCode || !this.activeTicketNumber) return;

    try {
      const res = await gatewayManager.fetch(`/support/tickets?userCode=${encodeURIComponent(this.myCode)}`);
      if (res.ok) {
        const data = await res.json();
        const tickets = data.tickets || [];
        for (const tk of tickets) {
          if (tk.status === 'answered' && tk.admin_reply) {
            await this.deliverUserReply(tk.ticket_number, tk.admin_reply, tk.answered_at);
          }
        }
      }
    } catch {}
  }
}

export const supportService = new SupportService();

