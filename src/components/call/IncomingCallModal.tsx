import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Video, X } from 'lucide-react';
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

  if (!incomingCall) return null;

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
              <X size={24} color="#000000" />
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
              {callType === 'video' ? <Video size={24} color="#ffffff" /> : <Phone size={24} color="#ffffff" />}
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