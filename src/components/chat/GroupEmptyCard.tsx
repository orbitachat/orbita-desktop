import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../common/Avatar';
import { type Chat } from '../../store/useChatStore';
import { GroupUsersIcon } from '../common/GroupUsersIcon';
import { AddGroupMemberModal } from './AddGroupMemberModal';

interface GroupEmptyCardProps {
  chat: Chat;
}

export const GroupEmptyCard: React.FC<GroupEmptyCardProps> = ({ chat }) => {
  const { t } = useTranslation();
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const inviteCode = chat.inviteCode || chat.id;
  const inviteLink = `https://orbita-chess-network.alwaysdata.net/g/${inviteCode}`;

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, [inviteLink]);

  return (
    <>
      <div className="flex-1 w-full h-full flex items-center justify-center p-4 select-none pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="pointer-events-auto flex flex-col items-center justify-center text-center max-w-[360px] w-full px-6 py-6 rounded-2xl shadow-lg"
          style={{
            backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
            border: '1px solid var(--surface-border, rgba(255, 255, 255, 0.06))',
          }}
        >
          <div className="w-[72px] h-[72px] mb-3 flex items-center justify-center flex-shrink-0 relative">
            <Avatar
              src={chat.avatarUrl}
              alt={chat.name}
              className="w-[72px] h-[72px] rounded-full object-cover shadow-sm"
              style={{ borderRadius: '50%', width: 72, height: 72 }}
            />
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center bg-[var(--accent-color, #7C3AED)] text-white shadow"
            >
              <GroupUsersIcon size={13} />
            </div>
          </div>

          <h3
            className="text-[17px] font-bold mb-1 leading-snug break-words px-2"
            style={{ color: 'var(--text-main, #ffffff)' }}
          >
            {chat.name}
          </h3>

          <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-dim)] mb-3">
            <span>{t('groupSettings.empty_invite_title', 'Пригласите друзей в группу')}</span>
          </div>

          {chat.description ? (
            <div
              className="w-full text-center text-[13px] leading-relaxed break-words whitespace-pre-wrap px-2 mb-4"
              style={{ color: 'var(--text-dim, #8e8e93)' }}
            >
              {chat.description}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-dim)] leading-relaxed px-2 mb-4">
              {t('groupSettings.empty_invite_desc', 'В группе может быть до 10 человек. Обменивайтесь сообщениями, медиа и звоните со сквозным шифрованием.')}
            </p>
          )}

          <div className="flex flex-col w-full gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              aria-label={t('groupSettings.add_member', 'Добавить участников')}
              className="w-full py-2.5 px-4 rounded-xl text-[13.5px] font-semibold text-white bg-[var(--accent-color)] hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <UserPlus size={16} />
              <span>{t('groupSettings.add_member', 'Добавить участников')}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              aria-label={t('groupSettings.copy_link', 'Скопировать ссылку')}
              className="w-full py-2.5 px-4 rounded-xl text-[13px] font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 text-[var(--text-main)]"
            >
              {copiedLink ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              <span>{copiedLink ? t('groupSettings.copied_link', 'Ссылка скопирована') : t('groupSettings.copy_link', 'Скопировать ссылку')}</span>
            </button>
          </div>
        </motion.div>
      </div>

      <AddGroupMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        group={chat}
      />
    </>
  );
};
