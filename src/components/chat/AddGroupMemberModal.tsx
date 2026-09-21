import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Search, UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../common/Avatar';
import { type Chat, useChatStore } from '../../store/useChatStore';
import { groupService } from '../../services/groupService';
import { buildGroupInviteLink } from '../../lib/groupCrypto';

interface AddGroupMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Chat;
}

export const AddGroupMemberModal: React.FC<AddGroupMemberModalProps> = ({
  isOpen,
  onClose,
  group,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [addingContactIds, setAddingContactIds] = useState<Record<string, boolean>>({});
  const [addedContactIds, setAddedContactIds] = useState<Record<string, boolean>>({});

  const chats = useChatStore((s) => s.chats);
  const updateChat = useChatStore((s) => s.updateChat);

  const currentChat = useMemo(() => {
    return chats.find((c) => c.id === group.id) || group;
  }, [chats, group]);

  const currentMembers = useMemo(() => {
    return currentChat.members || [];
  }, [currentChat.members]);

  const currentMemberCount = currentChat.membersCount || currentMembers.length || 1;
  const isGroupFull = currentMemberCount >= 10;

  const inviteCode = currentChat.inviteCode || currentChat.id;
  const inviteLink = buildGroupInviteLink(inviteCode, currentChat.name, currentChat.creatorNickname, currentChat.avatarUrl);

  const existingMemberIds = useMemo(() => {
    const set = new Set<string>();
    currentMembers.forEach((m: any) => {
      const code = m.userId || m.userCode;
      if (code) {
        set.add(String(code).trim().toLowerCase());
      }
    });
    if (currentChat.creatorCode) {
      set.add(String(currentChat.creatorCode).trim().toLowerCase());
    }
    if (currentChat.creatorId) {
      set.add(String(currentChat.creatorId).trim().toLowerCase());
    }
    return set;
  }, [currentMembers, currentChat.creatorCode, currentChat.creatorId]);

  const isContactInGroup = useCallback(
    (contact: Chat) => {
      const peerCode = contact.peerCode ? String(contact.peerCode).trim().toLowerCase() : null;
      const chatId = contact.id ? String(contact.id).trim().toLowerCase() : null;
      const nameIsCode = contact.name && contact.name.length === 36 ? contact.name.trim().toLowerCase() : null;

      if (peerCode && existingMemberIds.has(peerCode)) return true;
      if (chatId && existingMemberIds.has(chatId)) return true;
      if (nameIsCode && existingMemberIds.has(nameIsCode)) return true;
      return false;
    },
    [existingMemberIds]
  );

  const contacts = useMemo(() => {
    return chats.filter(
      (c) =>
        c.type === 'private' &&
        c.id !== 'notes' &&
        c.id !== 'system_support' &&
        c.name
    );
  }, [chats]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [contacts, searchQuery]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [inviteLink]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [inviteCode]);

  const handleAddContact = useCallback(
    async (contact: Chat) => {
      if (isGroupFull || addingContactIds[contact.id]) return;

      setAddingContactIds((prev) => ({ ...prev, [contact.id]: true }));
      try {
        const userCode = contact.peerCode || (contact.name && contact.name.length === 36 ? contact.name : undefined) || contact.id;
        const updatedGroup = await groupService.addMember(
          currentChat.id,
          inviteCode,
          contact.name,
          userCode,
          contact.avatarUrl || null
        );

        const newMember = {
          nickname: contact.name,
          userId: userCode,
          userCode: userCode,
          role: 'member' as const,
          lastSeen: Date.now(),
          avatarUrl: contact.avatarUrl || null,
        };

        const nextMembers = [...currentMembers, newMember];
        updateChat(currentChat.id, {
          members: nextMembers,
          membersCount: (currentChat.membersCount || currentMembers.length) + 1,
        });

        const payloadGroup: any = updatedGroup || {
          id: currentChat.id,
          code: inviteCode,
          name: currentChat.name,
          description: currentChat.description || '',
          avatarUrl: currentChat.avatarUrl || null,
          creatorNickname: currentChat.creatorNickname || '',
          creatorCode: currentChat.creatorCode,
          membersCount: (currentChat.membersCount || currentMembers.length) + 1,
          maxMembers: 10,
          members: nextMembers,
          createdAt: currentChat.createdAt || Date.now(),
          sharedSecret: currentChat.sharedSecret,
        };

        await groupService.notifyMember(
          userCode || contact.name,
          {
            ...payloadGroup,
            sharedSecret: currentChat.sharedSecret,
          },
          contact.name
        );

        setAddedContactIds((prev) => ({ ...prev, [contact.id]: true }));
      } catch {} finally {
        setAddingContactIds((prev) => ({ ...prev, [contact.id]: false }));
      }
    },
    [
      isGroupFull,
      addingContactIds,
      currentChat.id,
      currentChat.name,
      currentChat.description,
      currentChat.avatarUrl,
      currentChat.creatorNickname,
      currentChat.creatorCode,
      currentChat.createdAt,
      currentChat.membersCount,
      currentChat.sharedSecret,
      inviteCode,
      currentMembers,
      updateChat,
    ]
  );


  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center p-4 select-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 10 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-full max-w-[440px] flex flex-col rounded-[12px] shadow-2xl overflow-hidden relative max-h-[85vh]"
          style={{
            backgroundColor: 'var(--settings-bg, var(--bg-secondary, #1e1b2e))',
            color: 'var(--text-main, #ffffff)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
            style={{
              borderBottom: '1px solid var(--surface-border, rgba(255,255,255,0.06))',
            }}
          >
            <div className="flex items-center gap-2.5">
              <Users size={20} className="text-[var(--accent-color, #7C3AED)]" />
              <h2 className="text-[16px] font-semibold">
                {t('groupSettings.add_member', 'Добавить участников')}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Закрыть')}
              className="p-1 rounded-full text-[var(--text-dim)] hover:text-[var(--text-main)] hover:bg-white/10 transition-colors"
            >
              <X size={19} />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-3 overflow-y-auto chat-list-scrollbar flex-1 min-h-0">
            <div
              className="p-3 rounded-lg flex flex-col gap-2"
              style={{
                backgroundColor: 'var(--surface-container, rgba(255,255,255,0.04))',
                border: '1px solid var(--surface-border, rgba(255,255,255,0.06))',
              }}
            >
              <span className="text-[11.5px] font-medium text-[var(--text-dim)]">
                {t('groupSettings.invite_link', 'Ссылка-приглашение')}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-mono truncate text-[var(--accent-color)] select-all">
                  {inviteLink}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  aria-label={t('groupSettings.copy_link', 'Скопировать ссылку')}
                  className="flex-shrink-0 px-2.5 py-1 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: copiedLink ? 'rgba(34, 197, 94, 0.15)' : 'var(--accent-color)',
                    color: copiedLink ? '#4ade80' : '#ffffff',
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedLink ? t('groupSettings.copied_link', 'Скопировано') : t('common.copy', 'Копировать')}</span>
                </button>
              </div>
            </div>

            <div
              className="p-3 rounded-lg flex flex-col gap-2"
              style={{
                backgroundColor: 'var(--surface-container, rgba(255,255,255,0.04))',
                border: '1px solid var(--surface-border, rgba(255,255,255,0.06))',
              }}
            >
              <span className="text-[11.5px] font-medium text-[var(--text-dim)]">
                {t('groupSettings.group_code', 'Код группы')}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-bold font-mono tracking-wider select-all">
                  {inviteCode}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  aria-label={t('common.copy', 'Копировать')}
                  className="flex-shrink-0 px-2.5 py-1 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-[var(--text-dim)] hover:text-white bg-white/5 hover:bg-white/10"
                >
                  {copiedCode ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                  <span>{copiedCode ? t('profile.copied', 'Скопирован') : t('common.copy', 'Копировать')}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mt-1 pt-2">
              <span className="text-[13px] font-semibold text-[var(--text-main)]">
                {t('groupSettings.select_friends', 'Выберите из контактов')}
              </span>
              <span className="text-[12px] text-[var(--text-dim)] font-medium">
                {currentMemberCount} / 10
              </span>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('groupSettings.search_contacts', 'Поиск среди контактов...')}
                aria-label={t('groupSettings.search_contacts', 'Поиск среди контактов...')}
                className="w-full bg-white/5 outline-none rounded-lg pl-9 pr-3 py-2 text-[13.5px] text-[var(--text-main)] placeholder:text-[var(--text-dim)] transition-colors border border-white/5 focus:border-[var(--accent-color)]"
              />
            </div>

            {isGroupFull && (
              <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[12.5px] font-medium text-center">
                {t('groupSettings.max_members_reached', 'Группа заполнена (макс. 10 участников)')}
              </div>
            )}

            <div className="flex flex-col gap-1 mt-1">
              {filteredContacts.length === 0 ? (
                <div className="py-8 text-center text-[13px] text-[var(--text-dim)]">
                  {contacts.length === 0
                    ? t('groupSettings.add_friend_hint', 'Добавьте друзей в личные чаты, чтобы приглашать их сюда')
                    : t('groupSettings.no_contacts_found', 'Контакты не найдены')}
                </div>
              ) : (
                filteredContacts.map((contact) => {
                  const alreadyMember = isContactInGroup(contact);
                  const isAdded = Boolean(addedContactIds[contact.id]);
                  const isAdding = Boolean(addingContactIds[contact.id]);

                  return (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar
                          src={contact.avatarUrl}
                          alt={contact.name}
                          className="w-9 h-9 rounded-full flex-shrink-0 object-cover"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13.5px] font-medium text-[var(--text-main)] truncate">
                            {contact.name}
                          </span>
                          <span className="text-[11px] text-[var(--text-dim)] truncate">
                            {contact.online ? t('chatWindow.online', 'в сети') : t('chatWindow.offline', 'не в сети')}
                          </span>
                        </div>
                      </div>

                      <div className="flex-shrink-0 ml-2">
                        {alreadyMember || isAdded ? (
                          <span className="px-2.5 py-1 rounded text-[12px] font-medium text-green-400 bg-green-500/10 flex items-center gap-1">
                            <Check size={14} />
                            <span>{t('groupSettings.already_member', 'Уже в группе')}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isGroupFull || isAdding}
                            onClick={() => handleAddContact(contact)}
                            aria-label={t('groupSettings.add_to_group', 'Добавить в группу')}
                            className="px-3 py-1 rounded-md text-[12.5px] font-medium text-white bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <UserPlus size={14} />
                            <span>{isAdding ? '...' : t('common.add', 'Добавить')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
