// src/components/auth/AppLockScreen.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { securityService } from '../../services/securityService';

interface AppLockScreenProps {
  onUnlocked: () => void;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password || isSubmitting || isDecrypting) return;

    setIsSubmitting(true);
    setErrorMsg('');

    const isValid = await securityService.verifyPassword(password);
    setIsSubmitting(false);

    if (isValid) {
      setIsDecrypting(true);
      setTimeout(() => {
        onUnlocked();
      }, 1000);
    } else {
      setErrorMsg(t('appLock.wrong_password', 'Неверный пароль. Попробуйте еще раз.'));
      setPassword('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center select-none"
      style={{
        backgroundColor: 'var(--bg-primary, #17212b)',
        color: 'var(--text-main, #ffffff)',
      }}
    >
      <AnimatePresence mode="wait">
        {isDecrypting ? (
          <motion.div
            key="decrypting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center relative z-10"
          >
            {/* 3 Balls Loading Animation - Minimalist & Low CPU */}
            <div className="flex items-center justify-center gap-3.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-5 h-5 rounded-full"
                  style={{
                    backgroundColor: 'var(--accent-color)',
                  }}
                  animate={{
                    scale: [0.6, 1.2, 0.6],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 0.85,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.18,
                  }}
                />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="lock-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center p-8 max-w-sm w-full relative z-10"
          >
            <form onSubmit={handleUnlock} className="w-full flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-base font-bold text-[var(--text-main)] text-left pl-1 mb-0.5">
                  {t('appLock.enter_password_label', 'Введите пароль')}
                </label>
                <div className="relative flex items-center w-full">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder={t('appLock.placeholder', 'Пароль')}
                    autoFocus
                    className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-10"
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${errorMsg ? '#ef4444' : 'var(--border-color, rgba(255,255,255,0.15))'}`,
                      borderRadius: '0px',
                      color: 'var(--text-main, #ffffff)',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = errorMsg ? '#ef4444' : 'var(--accent-color, #7C3AED)')}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = errorMsg ? '#ef4444' : 'var(--border-color, rgba(255,255,255,0.15))')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 text-center font-medium"
                >
                  {errorMsg}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={!password || isSubmitting}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                style={{
                  backgroundColor: 'var(--accent-color)',
                  color: '#ffffff',
                  opacity: !password || isSubmitting ? 0.6 : 1,
                }}
              >
                {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                <span>{t('appLock.done_button', 'Готово')}</span>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
