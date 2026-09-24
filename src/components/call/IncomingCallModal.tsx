import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../../store/useCallStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../common/Avatar';

const accentButtonStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent-color), var(--accent-dark))',
  color: 'var(--settings-on-primary, #ffffff)',
};

const StaticBackground = () => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 0,
      backgroundColor: 'var(--bg-primary)',
    }}
  />
);

export const IncomingCallModal = () => {
  const { t } = useTranslation();
  const incomingCall = useCallStore((state) => state.incomingCall);
  const answerCall = useCallStore((state) => state.answerCall);
  const rejectCall = useCallStore((state) => state.rejectCall);
  const nickname = useAuthStore((s) => s.nickname) || 'YOU';

  const chat = useChatStore((state) =>
    incomingCall ? state.chats.find((c) => c.id === incomingCall.chatId) : null
  );
  const from = chat?.name || incomingCall?.from || '';
  const avatarUrl = chat?.avatarUrl || null;

  if (!incomingCall || chat?.type === 'group') return null;

  const { callType } = incomingCall;

  const handleAnswer = () => {
    answerCall(nickname);
  };

  const handleReject = () => {
    rejectCall();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex flex-col justify-between overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-primary)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <StaticBackground />

        <div style={{ height: '30px' }} className="w-full flex-shrink-0" />

        <div className="flex flex-col items-center justify-center flex-1 relative z-10 p-6">
          <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center select-none shadow-lg pointer-events-none">
            <Avatar src={avatarUrl} alt={from} className="w-full h-full object-cover pointer-events-none" style={{ fontSize: '48px' }} />
          </div>

          <h2 className="mt-4 text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
            {from}
          </h2>
        </div>

        <div className="flex items-center justify-center gap-6 pb-8 pt-2 relative z-10">
          <button
            type="button"
            onClick={handleReject}
            aria-label={t('call.reject')}
            className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" className="w-6 h-6 text-black">
                <path fill="currentColor" d="m4.51 15.48l2-1.59c.48-.38.76-.96.76-1.57v-2.6c3.02-.98 6.29-.99 9.32 0v2.61c0 .61.28 1.19.76 1.57l1.99 1.58c.8.63 1.94.57 2.66-.15l1.22-1.22c.8-.8.8-2.13-.05-2.88c-6.41-5.66-16.07-5.66-22.48 0c-.85.75-.85 2.08-.05 2.88l1.22 1.22c.71.72 1.85.78 2.65.15" />
              </svg>
            </div>
            <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
              {t('call.reject') || 'Отклонить'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleAnswer}
            aria-label={t('call.answer')}
            className="flex flex-col items-center gap-2 select-none bg-transparent border-0 p-0 outline-none cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md" style={accentButtonStyle}>
              {callType === 'video' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" className="w-6 h-6 text-white">
                  <path fill="currentColor" fillRule="evenodd" d="M0 5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.983 1.738l3.11-1.382A1 1 0 0 1 16 4.269v7.462a1 1 0 0 1-1.406.913l-3.111-1.382A2 2 0 0 1 9.5 13H2a2 2 0 0 1-2-2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" className="w-6 h-6 text-white">
                  <path fill="currentColor" d="m19.23 15.26l-2.54-.29a1.99 1.99 0 0 0-1.64.57l-1.84 1.84a15.05 15.05 0 0 1-6.59-6.59l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52a2 2 0 0 0-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07c.53 8.54 7.36 15.36 15.89 15.89c1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98" />
                </svg>
              )}
            </div>
            <span style={{ color: 'var(--text-dim)', fontSize: '12px', fontWeight: 500 }}>
              {t('call.answer') || 'Принять'}
            </span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};