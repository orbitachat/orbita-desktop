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
  ChevronDown,
  Plus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useAccountStore } from '../../services/accountManager';
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

  const [isAccountsOpen, setIsAccountsOpen] = React.useState(false);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const switchAccount = useAccountStore((s) => s.switchAccount);
  const prepareAddSecondAccount = useAccountStore((s) => s.prepareAddSecondAccount);

  const otherAccount = accounts.find((a) => a.id !== activeAccountId && a.isRegistered);

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
          className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height,0px)] z-[150] flex"
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
            className="fixed inset-x-0 bottom-0 top-[var(--titlebar-height,0px)]"
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
              className="px-5 pt-5 pb-3 flex flex-col gap-3 transition-colors hover:bg-[var(--surface-container-soft)]"
              style={{
                backgroundColor: 'transparent',
              }}
            >
              <div
                onClick={onOpenProfile}
                className="cursor-pointer inline-block"
              >
                <Avatar
                  src={avatarUrl}
                  alt={nickname || '?'}
                  className="w-14 h-14 rounded-full"
                />
              </div>
              <div className="flex items-center justify-between min-w-0">
                <div
                  onClick={onOpenProfile}
                  className="flex flex-col min-w-0 cursor-pointer flex-1"
                >
                  <span className="font-bold text-[16px] text-[var(--text-main)] truncate">
                    {nickname || 'User'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAccountsOpen((prev) => !prev);
                  }}
                  aria-label={isAccountsOpen ? t('mainMenu.hide_accounts', 'Скрыть аккаунты') : t('mainMenu.show_accounts', 'Показать аккаунты')}
                  className="p-1 rounded-full hover:bg-[var(--surface-container-strong)] transition-colors text-[var(--text-dim)] hover:text-[var(--text-main)] flex items-center justify-center shrink-0"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <ChevronDown
                    size={20}
                    style={{
                      transform: isAccountsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {isAccountsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="overflow-hidden flex flex-col"
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                  }}
                >
                  {otherAccount ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        switchAccount(otherAccount.id);
                      }}
                      aria-label={t('mainMenu.switch_account', 'Переключить аккаунт')}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <Avatar
                        src={otherAccount.avatarUrl}
                        alt={otherAccount.nickname || '?'}
                        className="w-9 h-9 rounded-full"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-[14px] text-[var(--text-main)] truncate">
                          {otherAccount.nickname || 'User'}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        prepareAddSecondAccount();
                      }}
                      aria-label={t('mainMenu.add_account', 'Добавить аккаунт')}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors cursor-pointer text-[var(--text-main)]"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-container-strong)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--accent-color, #7c3aed)',
                          color: '#ffffff',
                        }}
                      >
                        <Plus size={16} />
                      </div>
                      <span className="font-medium text-[14px] text-[var(--text-main)] truncate">
                        {t('mainMenu.add_account', 'Добавить аккаунт')}
                      </span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

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
                aria-label={t('mainMenu.saved_messages', 'Заметки для себя')}
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
                  {t('mainMenu.saved_messages', 'Заметки для себя')}
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
