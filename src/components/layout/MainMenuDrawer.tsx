import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Users,
  Megaphone,
  UserPlus,
  Phone,
  Bookmark,
  Settings,
  Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { PillToggle } from '../common/PillToggle';
import { themePalettes } from '../../theme';

interface MainMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenCreateGroup: () => void;
  onOpenCreateChannel: () => void;
  onOpenCreateChat: () => void;
  onOpenCalls: () => void;
  onOpenSavedMessages: () => void;
  onOpenSettings: () => void;
}


export const MainMenuDrawer: React.FC<MainMenuDrawerProps> = ({
  isOpen,
  onClose,
  onOpenProfile,
  onOpenCreateGroup,
  onOpenCreateChannel,
  onOpenCreateChat,
  onOpenCalls,
  onOpenSavedMessages,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const nickname = useAuthStore((s) => s.nickname);
  const avatarUrl = useAuthStore((s) => s.avatarUrl);

  const currentTheme = useChatStore((s) => s.currentTheme);
  const setTheme = useChatStore((s) => s.setTheme);

  const isNightMode = !themePalettes[currentTheme]?.isLight;

  const toggleNightMode = useCallback(() => {
    if (isNightMode) {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  }, [isNightMode, setTheme]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-[30px] z-[150] flex"
          style={{
            userSelect: 'none',
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-x-0 bottom-0 top-[30px]"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            }}
          />

          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex flex-col h-full overflow-hidden shadow-2xl"
            style={{
              width: '280px',
              maxWidth: '85vw',
              backgroundColor: 'var(--bg-secondary)',
              borderRight: '1px solid var(--border-color)',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <div
              onClick={onOpenProfile}
              className="px-5 pt-5 pb-3 flex flex-col gap-3 cursor-pointer transition-colors hover:bg-[var(--surface-container-soft)]"
              style={{
                backgroundColor: 'transparent',
              }}
            >
              <Avatar
                src={avatarUrl}
                alt={nickname || '?'}
                className="w-12 h-12 rounded-full"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-[16px] text-[var(--text-main)] truncate">
                  {nickname || 'User'}
                </span>
              </div>
            </div>

            <div
              style={{
                height: '1px',
                backgroundColor: 'var(--border-color)',
                width: '100%',
                flexShrink: 0,
                marginTop: '6px',
                marginBottom: '6px',
              }}
            />

            <div className="flex-1 overflow-y-auto overflow-x-hidden py-0 px-0 flex flex-col custom-scrollbar">
              <button
                type="button"
                onClick={onOpenProfile}
                aria-label={t('mainMenu.my_profile', 'Мой профиль')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <User size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.my_profile', 'Мой профиль')}
                </span>
              </button>

              <div
                style={{
                  height: '1px',
                  backgroundColor: 'var(--border-color)',
                  width: '100%',
                  flexShrink: 0,
                  marginTop: '6px',
                  marginBottom: '6px',
                }}
              />

              <button
                type="button"
                onClick={onOpenCreateGroup}
                aria-label={t('mainMenu.create_group', 'Создать группу')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Users size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.create_group', 'Создать группу')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenCreateChannel}
                aria-label={t('mainMenu.create_channel', 'Создать канал')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Megaphone size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.create_channel', 'Создать канал')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenCreateChat}
                aria-label={t('mainMenu.add_friend', 'Добавить друга')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <UserPlus size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.add_friend', 'Добавить друга')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenCalls}
                aria-label={t('mainMenu.calls', 'Звонки')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Phone size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.calls', 'Звонки')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenSavedMessages}
                aria-label={t('mainMenu.saved_messages', 'Избранное')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Bookmark size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.saved_messages', 'Избранное')}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={t('mainMenu.settings', 'Настройки')}
                className="w-full flex items-center gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Settings size={20} className="text-[var(--text-dim)] shrink-0" />
                <span className="text-[14px] font-medium truncate">
                  {t('mainMenu.settings', 'Настройки')}
                </span>
              </button>

              <button
                type="button"
                onClick={toggleNightMode}
                aria-label={t('mainMenu.night_mode', 'Ночной режим')}
                className="w-full flex items-center justify-between gap-4 px-5 py-3 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  borderRadius: 0,
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <Moon size={20} className="text-[var(--text-dim)] shrink-0" />
                  <span className="text-[14px] font-medium truncate">
                    {t('mainMenu.night_mode', 'Ночной режим')}
                  </span>
                </div>
                <PillToggle checked={isNightMode} onChange={toggleNightMode} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
