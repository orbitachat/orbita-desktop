import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';
import { DoubleRatchet } from '../lib/double-ratchet';
import { supabaseService } from './supabaseService';

export async function sendEncryptedReadReceipt(chatId: string, messageIds: string[], lastTime?: number): Promise<void> {
  try {
    const state = useChatStore.getState();
    if (!state.readReceiptsEnabled || !chatId || chatId === 'notes') return;

    const chat = state.chats.find((c) => c.id === chatId);
    if (!chat || !chat.ratchetState || chat.type !== 'private') return;

    const myNickname = useAuthStore.getState().nickname || 'User';
    const myCode = state.myCode || '';

    const ratchet = DoubleRatchet.fromState(chat.ratchetState);
    if (!ratchet.canSend()) return;

    const receiptPayload = {
      type: 'receipt',
      receiptType: 'read',
      chatId,
      messageIds,
      time: lastTime || Date.now(),
      sender: myNickname,
      senderId: myCode,
    };

    const plaintext = JSON.stringify(receiptPayload);
    const { ciphertext, index, dhPublicKey } = await ratchet.encrypt(plaintext);

    state.updateChat(chatId, { ratchetState: ratchet.getState() });

    const recipientTargets = Array.from(new Set([chat.peerCode, chat.name].filter(Boolean))) as string[];
    for (const recipientId of recipientTargets) {
      await supabaseService.sendOfflineMessage(
        chatId,
        myNickname,
        recipientId,
        ciphertext,
        index,
        dhPublicKey
      ).catch((err) => console.warn('[ReadReceipt] Offline receipt dispatch error:', err));
    }
  } catch (err) {
    console.warn('[ReadReceipt] Failed to send encrypted receipt:', err);
  }
}
