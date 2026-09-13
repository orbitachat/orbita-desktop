import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Avatar } from '../common/Avatar';
import { type Chat, useChatStore } from '../../store/useChatStore';
import { channelService } from '../../services/channelService';

interface ChannelEmptyCardProps {
  chat: Chat;
}

export const ChannelEmptyCard: React.FC<ChannelEmptyCardProps> = ({ chat }) => {
  const { t } = useTranslation();
  const [description, setDescription] = useState<string>(chat.description || '');

  useEffect(() => {
    if (chat.description) {
      setDescription(chat.description);
      return;
    }

    let isMounted = true;
    channelService
      .getChannel(chat.id)
      .then((info) => {
        if (!isMounted || !info) return;
        if (info.description) {
          setDescription(info.description);
          useChatStore.getState().updateChat(chat.id, {
            description: info.description,
            avatarUrl: info.avatarUrl || chat.avatarUrl,
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [chat.id, chat.description]);

  const displayDescription =
    description ||
    chat.description ||
    (chat.name === 'Orbita Updates'
      ? t('channel.orbita_updates_desc')
      : t('channel.empty_description'));

  return (
    <div className="flex-1 w-full h-full flex items-center justify-center p-4 select-none pointer-events-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="pointer-events-auto flex flex-col items-center justify-center text-center max-w-[340px] w-full px-6 py-6"
        style={{
          borderRadius: '16px',
          backgroundColor: 'var(--surface-container, rgba(255, 255, 255, 0.05))',
          border: 'none',
          boxShadow: 'none',
        }}
      >
        <div className="w-[72px] h-[72px] mb-3 flex items-center justify-center flex-shrink-0">
          <Avatar
            src={chat.avatarUrl}
            alt={chat.name}
            className="w-[72px] h-[72px] rounded-full object-cover shadow-sm"
            style={{ borderRadius: '50%', width: 72, height: 72 }}
          />
        </div>

        <h3
          className="text-[16px] font-semibold mb-2 leading-snug break-words px-2"
          style={{ color: 'var(--text-main, #ffffff)' }}
        >
          {chat.name}
        </h3>

        <p
          className="text-[13px] leading-relaxed break-words whitespace-pre-wrap px-2"
          style={{ color: 'var(--text-dim, #8e8e93)' }}
        >
          {displayDescription}
        </p>
      </motion.div>
    </div>
  );
};
