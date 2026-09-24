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
                <path fill="currentColor" d="M12 8q2.95 0 5.813 1.188T22.9 12.75q.3.3.3.7t-.3.7l-2.3 2.25q-.275.275-.638.3t-.662-.2l-2.9-2.2q-.2-.15-.3-.35t-.1-.45v-2.85q-.95-.3-1.95-.475T12 10t-2.05.175T8 10.65v2.85q0 .25-.1.45t-.3.35l-2.9 2.2q-.3.225-.663.2t-.637-.3l-2.3-2.25q-.3-.3-.3-.7t.3-.7q2.2-2.375 5.075-3.562T12 8" />
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
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="24" height="24" className="w-6 h-6 text-white">
                  <path fill="currentColor" fillRule="evenodd" d="M14.031 11.852c-.428-.539-1.123-1.32-1.718-1.394c-.362-.045-.778.255-1.188.538c-.08.04-.698.408-.773.43c-.396.113-1.241.146-1.752-.32c-.492-.45-1.27-1.283-1.898-2.046c-.6-.786-1.229-1.731-1.551-2.311c-.336-.601-.094-1.396.114-1.746c.038-.063.498-.536.601-.646l.015.018c.381-.32.78-.645.825-.997c.074-.586-.525-1.439-.953-1.979C5.325.858 4.662-.089 3.759.045c-.34.05-.633.169-.922.34L2.829.376l-.048.037l-.025.013l.003.004c-.166.128-.64.482-.694.53c-.586.521-1.468 1.748-.786 3.955c.506 1.64 1.585 3.566 3.055 5.514l-.008.007c.072.094.146.179.221.27q.104.14.211.277l.01-.007c1.56 1.879 3.196 3.381 4.689 4.267c2.01 1.192 3.439.655 4.099.228c.062-.041.534-.408.694-.529l.004.004l.018-.02l.043-.033l-.006-.008c.242-.234.436-.484.57-.799c.351-.829-.42-1.693-.848-2.234" />
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