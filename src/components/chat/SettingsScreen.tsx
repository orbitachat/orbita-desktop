import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Trash2, Database, ChevronRight, ChevronDown, Check, Eye, EyeOff, CheckCircle2, XCircle, Bell, RefreshCw, Download, ShieldCheck } from 'lucide-react';
import { securityService } from '../../services/securityService';
import { useState, useRef, type ReactNode, useEffect, useCallback, memo } from 'react';
import {
  useChatStore,
  FONT_MAP,
  type FontFamily,
  type Language,
} from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useDeviceStore } from '../../store/useDeviceStore';
import { useTranslation } from 'react-i18next';
import { NotificationMonitor, NotificationCountSelector } from '../settings/NotificationPreview';
import { MessageStatus } from '../MessageStatus';
import { generateRandomCode } from '../../lib/codes';
import { getPusher } from '../../utils/pusher';
import { Avatar } from '../common/Avatar';
import { ablyService } from '../../services/ablyService';
import { liveKitService } from '../../services/livekitService';
import { supabaseService } from '../../services/supabaseService';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { DeleteAccountModal } from '../common/DeleteAccountModal';
import { AccountBackupScreen } from '../settings/AccountBackupScreen';
import { ConnectionSettingsScreen } from '../settings/ConnectionSettingsScreen';
import { DataMemorySettings } from '../settings/DataMemorySettings';
import { useConnectionStore } from '../../store/useConnectionStore';
import { useDevicePermissionStore } from '../../store/useDevicePermissionStore';
import { DeveloperBadge, DeveloperToast } from '../ui/DeveloperBadge';
import { LinkCopiedToast } from '../common/LinkCopiedToast';
import { QrCodeView } from './QrCodeView';
import { getInviteLink } from '../../utils/inviteLink';
import { CHAT_COLOR_PRESETS, DEFAULT_CHAT_COLOR, type ThemeId } from '../../theme';

const QrCodeMiniIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
    <path fill={color} d="M5 11h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm0 16h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm8-10v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2m6 4h-4V5h4zm2 11.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5m-8-7v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m3.5 1.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5M13 17.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m2.5 3.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m2-2h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m1-6h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5m1 4h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5"/>
  </svg>
);

export const MD3 = {
  bg:            'var(--md-bg,            #211d2f)',
  surface:       'var(--md-surface,       #2a253b)',
  surfaceVar:    'var(--md-surface-var,   #342e47)',
  outline:       'var(--md-outline,       rgba(255,255,255,0.12))',
  outlineMed:    'var(--md-outline-med,   rgba(255,255,255,0.20))',
  onSurface:     'var(--md-on-surface,    #ffffff)',
  onSurfaceVar:  'var(--md-on-surface-var,#9f96b3)',
  primary:       'var(--md-primary,       #9b7dd4)',
  onPrimary:     'var(--md-on-primary,    #ffffff)',
  primaryCont:   'var(--md-primary-cont,  #42345e)',
  error:         'var(--md-error,         #ff595a)',
  errorCont:    'var(--md-error-cont,    rgba(255,89,90,0.12))',
};

const GLOBAL_CSS = `
  .m3-switch-root {
    position: relative; display: inline-flex;
    align-items: center; width: 52px; height: 32px;
    cursor: pointer; user-select: none;
    -webkit-tap-highlight-color: transparent !important;
    outline: none; flex-shrink: 0;
  }
  .m3-switch-root * {
    -webkit-tap-highlight-color: transparent !important;
  }
  .m3-switch-root input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }

  .m3-track {
    position: absolute; inset: 0; border-radius: 16px;
    background: var(--switch-bg, rgba(255, 255, 255, 0.12));
    border: 2px solid var(--switch-border, rgba(255, 255, 255, 0.25));
    transition: background 200ms cubic-bezier(0.2, 0, 0, 1), border-color 200ms cubic-bezier(0.2, 0, 0, 1);
    box-sizing: border-box; will-change: background, border-color;
  }
  .m3-switch-root input:checked ~ .m3-track {
    background: var(--accent-color, var(--md-primary, #c5b4e3));
    border-color: var(--accent-color, var(--md-primary, #c5b4e3));
  }

  .m3-thumb-wrap {
    position: absolute; left: 0; top: 4px;
    width: 24px; height: 24px;
    transform: translateX(4px);
    transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
    display: flex; align-items: center; justify-content: center; z-index: 1;
    will-change: transform;
  }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap { transform: translateX(24px); }

  .m3-thumb {
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--md-on-surface-var, #cac4d0);
    transform: scale(0.6666);
    transition: transform 200ms cubic-bezier(0.2, 0, 0, 1), background 200ms cubic-bezier(0.2, 0, 0, 1);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.35); will-change: transform, background;
  }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap .m3-thumb {
    transform: scale(1); background: var(--bg-primary, #1c1b1f);
  }
  .m3-switch-root:active .m3-thumb { transform: scale(1.1666); }

  .m3-thumb svg { opacity: 0; transform: scale(0.5); transition: opacity 150ms ease, transform 150ms ease; width: 14px; height: 14px; stroke: var(--accent-color, var(--md-primary, #c5b4e3)); will-change: opacity, transform; }
  .m3-switch-root input:checked ~ .m3-track ~ .m3-thumb-wrap .m3-thumb svg { opacity: 1; transform: scale(1); }

  .m3-switch-root input:focus-visible ~ .m3-track { outline: 2px solid var(--accent-color, #c5b4e3); outline-offset: 2px; }
  .m3-switch-root input:disabled ~ * { opacity: .38; }

  input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--md-primary); cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.4); margin-top: -8px; }
  input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: transparent; }
  input[type=range]::-moz-range-thumb { width: 20px; height: 20px; border: none; border-radius: 50%; background: var(--md-primary); cursor: pointer; }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse-dot { 0%,100% { opacity:1 } 50% { opacity:.35 } }
  @keyframes qr-glow { 0%,100% { box-shadow: 0 0 20px var(--qr-glow-color, rgba(197,180,227,0.3)); } 50% { box-shadow: 0 0 40px var(--qr-glow-color, rgba(197,180,227,0.5)), 0 0 80px var(--qr-glow-color, rgba(197,180,227,0.15)); } }
  @keyframes badge-in { 0% { opacity:0; transform: scale(0.6) translateY(4px); } 100% { opacity:1; transform: scale(1) translateY(0); } }
  .spin { animation: spin 1s linear infinite; }
  .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
  .qr-glow-anim { animation: qr-glow 3s ease-in-out infinite; }

  .pill-btn {
    transition: background 150ms, border-color 150ms, color 150ms;
  }
`;

const TuxAvatar = () => (
  <div
    style={{
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000000',
    }}
  >
    <img
      src="./tux.png"
      alt="Tux"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '50%',
        display: 'block',
      }}
    />
  </div>
);

const OrbitaLogoAvatar = () => (
  <img
    src="./orbita1.png"
    alt="Orbita"
    style={{
      width: '60px',
      height: '60px',
      objectFit: 'contain',
      flexShrink: 0,
      display: 'block',
    }}
  />
);

const TaskbarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="16" height="14" rx="2" />
    <line x1="2" y1="13" x2="18" y2="13" />
    <line x1="6" y1="15" x2="8" y2="15" />
    <line x1="10" y1="15" x2="14" y2="15" />
  </svg>
);

const TogglePill = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 18px',
      borderRadius: '20px',
      backgroundColor: 'var(--surface-container, #231e34)',
      border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
      color: active ? 'var(--text-main, #ffffff)' : 'var(--text-dim, #8a82a2)',
      fontSize: '13.5px',
      fontWeight: 500,
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'all 150ms ease',
    }}
  >
    <div
      style={{
        width: '17px',
        height: '17px',
        borderRadius: '50%',
        backgroundColor: active ? 'var(--text-main, #ffffff)' : 'transparent',
        border: active ? 'none' : '1.5px solid var(--text-dim, #6b6385)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease',
      }}
    >
      {active && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--bg-secondary, #231e34)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 6 5 8.5 9.5 3.5" />
        </svg>
      )}
    </div>
    <span>{label}</span>
  </button>
);

const SectionHeader = ({ title }: { title: string }) => (
  <div
    style={{
      fontSize: '13px',
      fontWeight: 600,
      color: 'var(--accent-color, #9b7dd4)',
      padding: '16px 20px 8px 20px',
      userSelect: 'none',
      letterSpacing: '0.01em',
    }}
  >
    {title}
  </div>
);

export const Block = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <div
    style={{
      backgroundColor: MD3.surface,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 0,
      margin: 0,
      padding: '4px 0',
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

const Surface = ({ children, style }: { children: ReactNode; style?: React.CSSProperties }) => (
  <div style={{
    backgroundColor: 'transparent',
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...style,
  }}>
    {children}
  </div>
);

const SettingsRow = ({
  label,
  right,
  onClick,
  icon,
}: {
  label: string;
  right?: ReactNode;
  onClick?: () => void;
  icon?: ReactNode;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 20px',
      borderRadius: 0,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 150ms',
      backgroundColor: 'transparent',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}
    onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)')}
    onMouseLeave={e => onClick && ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
      {icon && (
        <div style={{
          width: 20,
          height: 20,
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: MD3.onSurface,
          flexShrink: 0,
          backgroundColor: 'transparent',
        }}>
          {icon}
        </div>
      )}
      <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: 0, lineHeight: 1.4 }}>{label}</p>
    </div>
    {right}
  </div>
);

export const M3Switch = memo(({
  checked, onChange, disabled,
}: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
  <div
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onChange(); }}
    style={{
      width: '42px',
      height: '24px',
      borderRadius: '12px',
      backgroundColor: checked ? 'var(--accent-color, #7C3AED)' : 'var(--switch-bg, rgba(255,255,255,0.14))',
      boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px var(--switch-border, rgba(255,255,255,0.22))',
      position: 'relative',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 200ms ease, box-shadow 200ms ease',
      flexShrink: 0,
      boxSizing: 'border-box',
      opacity: disabled ? 0.38 : 1,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        transition: 'left 200ms cubic-bezier(0.2,0,0,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }}
    />
  </div>
));

const MenuItem = ({
  icon, label, onClick, rightElement, badge,
}: {
  icon: ReactNode; label: string;
  onClick: () => void; rightElement?: ReactNode; badge?: ReactNode;
}) => (
  <div
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '12px 20px',
      borderRadius: 0,
      cursor: 'pointer',
      transition: 'background 150ms',
      backgroundColor: 'transparent',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
    }}
    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(202,196,208,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
  >
    <div style={{ width: 20, height: 20, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MD3.onSurface, flexShrink: 0, backgroundColor: 'transparent' }}>
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: 0 }}>{label}</p>
        {badge}
      </div>
    </div>
    {rightElement}
  </div>
);

interface NicknameEditModalProps {
  open: boolean;
  onClose: () => void;
  currentNickname: string;
  onSave: (newNickname: string) => void;
}

export const NicknameEditModal = ({ open, onClose, currentNickname, onSave }: NicknameEditModalProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentNickname);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed.length < 2 || trimmed.length > 24) {
      setError(t('settings.nickname_length_error'));
      return;
    }
    onSave(trimmed);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
              {t('settings.edit_nickname_title')}
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-dim)', marginBottom: '16px' }}>
              {t('settings.edit_nickname_desc')}
            </p>

            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('settings.nickname_placeholder')}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 4px',
                borderRadius: '0px',
                border: 'none',
                borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                backgroundColor: 'transparent',
                color: 'var(--text-main, #ffffff)',
                fontSize: '16px',
                outline: 'none',
                marginBottom: '12px',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
              onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255,255,255,0.15))')}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '12px', marginBottom: '8px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {t('common.save')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const broadcastProfileUpdate = (updates: { avatarUrl?: string | null; nickname?: string; hideProfileId?: boolean }) => {
  const currentNickname = useAuthStore.getState().nickname;
  const currentAvatar = useAuthStore.getState().avatarUrl;
  const myCode = useChatStore.getState().myCode;
  const currentHideProfileId = useChatStore.getState().hideProfileId;
  const finalNickname = updates.nickname !== undefined ? updates.nickname : currentNickname;
  const finalAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : currentAvatar;
  const finalHideProfileId = updates.hideProfileId !== undefined ? updates.hideProfileId : currentHideProfileId;

  const payload = {
    type: 'profile-update',
    sender: finalNickname,
    senderCode: myCode,
    senderId: myCode,
    avatarUrl: finalAvatar,
    nickname: finalNickname,
    hideProfileId: finalHideProfileId,
  };

  if (myCode) {
    supabaseService.publishPublicProfile(myCode, finalNickname, finalAvatar, null, finalHideProfileId).catch(() => {});
  }

  const chats = useChatStore.getState().chats;
  chats.forEach((chat) => {
    if (chat.type === 'private' && chat.id !== 'notes') {
      supabaseService.saveProfileUpdate(chat.id, finalNickname, finalAvatar, myCode, finalHideProfileId).catch(() => {});
      ablyService.sendMessage(chat.id, payload).catch(() => {});
      const pusher = getPusher();
      const channel = pusher.subscribe(`private-chat-${chat.id}`);
      const send = () => {
        channel.trigger('client-message', payload);
      };
      if (channel.subscribed) send();
      else channel.bind('pusher:subscription_succeeded', send);

      const recipientTargets = Array.from(new Set([
        chat.peerCode,
        chat.name && chat.name.length === 36 ? chat.name : undefined,
      ].filter((t): t is string => Boolean(t && t !== myCode))));

      for (const target of recipientTargets) {
        supabaseService.saveNonMessage(
          chat.id,
          myCode || 'user',
          target,
          JSON.stringify(payload),
          `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        ).catch(() => {});
      }
    }
  });
};

const PrivacySettingsScreen = ({ onOpenPassword, onOpenBackup }: { onOpenPassword: () => void; onOpenBackup?: () => void }) => {
  const { t } = useTranslation();
  const {
    voiceCallsEnabled,
    setVoiceCallsEnabled,
    readReceiptsEnabled,
    setReadReceiptsEnabled,
    typingIndicatorsEnabled,
    setTypingIndicatorsEnabled,
    linkPreviewsEnabled,
    setLinkPreviewsEnabled,
    screenProtectionEnabled,
    setScreenProtectionEnabled,
    hideProfileId,
    setHideProfileId,
  } = useChatStore();

  const [isPasswordSet, setIsPasswordSet] = useState(() => securityService.isPasswordSet());

  useEffect(() => {
    setIsPasswordSet(securityService.isPasswordSet());
  }, []);

  const handleToggleHideProfileId = () => {
    const nextVal = !hideProfileId;
    setHideProfileId(nextVal);
    broadcastProfileUpdate({ hideProfileId: nextVal });
  };

  const handleToggleScreenProtection = async () => {
    const nextVal = !screenProtectionEnabled;
    setScreenProtectionEnabled(nextVal);
    if (typeof window !== 'undefined' && window.orbita?.setScreenProtection) {
      await window.orbita.setScreenProtection(nextVal);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.voice_calls_beta')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.voice_calls')}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.voice_calls_desc')}</div>
          </div>
          <M3Switch checked={voiceCallsEnabled} onChange={() => setVoiceCallsEnabled(!voiceCallsEnabled)} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.read_receipts_group')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.read_receipts_title')}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.read_receipts_desc')}</div>
          </div>
          <M3Switch checked={readReceiptsEnabled} onChange={() => setReadReceiptsEnabled(!readReceiptsEnabled)} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.typing_indicators_group')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.typing_indicators_title')}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.typing_indicators_desc')}</div>
          </div>
          <M3Switch checked={typingIndicatorsEnabled} onChange={() => setTypingIndicatorsEnabled(!typingIndicatorsEnabled)} />
        </div>
      </div>

      {/* Link Previews */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.link_previews_group', 'ПРЕДПРОСМОТР ССЫЛОК')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.link_previews_title', 'Предпросмотр ссылок')}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.link_previews_desc', 'Генерировать предпросмотр для отправляемых ссылок (анонимно на стороне отправителя)')}</div>
          </div>
          <M3Switch checked={linkPreviewsEnabled} onChange={() => setLinkPreviewsEnabled(!linkPreviewsEnabled)} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.profile_id_group', 'ID ПРОФИЛЯ')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{t('settings.hide_profile_id', 'Скрывать ID профиля')}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{t('settings.hide_profile_id_desc', 'Скрывать среднюю часть вашего ID в профиле')}</div>
          </div>
          <M3Switch checked={hideProfileId} onChange={handleToggleHideProfileId} />
        </div>
      </div>

      {/* Security Block / "Безопасность" */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('security.group_title', 'Безопасность')}
        </div>
        <div
          onClick={onOpenPassword}
          className="cursor-pointer transition-colors hover:brightness-110"
          style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '16px 20px',
            margin: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
              {isPasswordSet ? t('security.change_password', 'Изменить пароль') : t('security.set_password', 'Поставить пароль')}
            </div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
              {t('security.password_subtitle', 'Поставить пароль для разблокировки Orbita.')}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: MD3.onSurfaceVar }} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('backup.group_title', 'РЕЗЕРВНОЕ КОПИРОВАНИЕ')}
        </div>
        <div
          onClick={onOpenBackup}
          className="cursor-pointer transition-colors hover:brightness-110"
          style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '16px 20px',
            margin: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
              {t('backup.create_title', 'Создать резервную копию')}
            </div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
              {t('backup.create_desc', 'Зашифровать аккаунт, настройки и список чатов секретной фразой из 12 слов.')}
            </div>
          </div>
          <ChevronRight size={20} style={{ color: MD3.onSurfaceVar }} />
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: MD3.onSurfaceVar,
          letterSpacing: '0.05em',
          padding: '0 20px',
          marginBottom: 8,
        }}>
          {t('settings.app_section')}
        </div>
        <div style={{
          backgroundColor: MD3.surface,
          borderRadius: 0,
          padding: '16px 20px',
          margin: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
              {t('settings.screen_protection')}
            </div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>
              {t('settings.screen_protection_desc')}
            </div>
          </div>
          <M3Switch checked={screenProtectionEnabled} onChange={handleToggleScreenProtection} />
        </div>
      </div>
    </motion.div>
  );
};

const PasswordSettingsScreen = ({ onSaved }: { onSaved?: () => void }) => {
  const { t } = useTranslation();
  const [isAlreadySet, setIsAlreadySet] = useState(() => securityService.isPasswordSet());

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Requirements checks
  const isLength12 = newPassword.length >= 12;
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSymbol = /[^a-zA-Z0-9]/.test(newPassword);
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (isAlreadySet) {
      if (!currentPassword) {
        setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
        return;
      }
      setIsSubmitting(true);
      const isCurrentValid = await securityService.verifyPassword(currentPassword);
      setIsSubmitting(false);
      if (!isCurrentValid) {
        setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
        return;
      }
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg(t('security.err_too_short', 'Пароль должен содержать минимум 6 символов'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg(t('security.err_mismatch', 'Пароли не совпадают'));
      return;
    }

    setIsSubmitting(true);
    const success = await securityService.setPassword(newPassword);
    setIsSubmitting(false);

    if (success) {
      setSuccessMsg(t('security.password_saved', 'Пароль успешно сохранен!'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsAlreadySet(true);
      onSaved?.();
    } else {
      setErrorMsg(t('common.error', 'Ошибка'));
    }
  };

  const handleRemove = async () => {
    if (!currentPassword) {
      setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
      return;
    }
    setIsSubmitting(true);
    const isCurrentValid = await securityService.verifyPassword(currentPassword);
    setIsSubmitting(false);
    if (!isCurrentValid) {
      setErrorMsg(t('security.err_wrong_current', 'Неверный текущий пароль'));
      return;
    }
    securityService.removePassword();
    setSuccessMsg(t('security.password_removed', 'Пароль удален'));
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsAlreadySet(false);
    onSaved?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ padding: '0 0 32px' }}
    >
      <form onSubmit={handleSubmit}>
        {/* Block 1: Password Group */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: MD3.onSurfaceVar,
            letterSpacing: '0.05em',
            padding: '0 20px',
            marginBottom: 8,
          }}>
            {t('security.password_group', 'Пароль')}
          </div>

          <div style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '20px',
            margin: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface, margin: 0 }}>
              {isAlreadySet ? t('security.modal_title_change', 'Изменить пароль') : t('security.modal_title_set', 'Поставить пароль')}
            </h3>
            <p style={{ fontSize: 13, color: MD3.onSurfaceVar, lineHeight: 1.45, margin: 0 }}>
              {isAlreadySet
                ? t('security.modal_desc_change', 'Измените пароль для Orbita. Локально сохранённые данные будут повторно зашифрованы с использованием нового пароля.')
                : t('security.modal_desc_set', 'Поставьте пароль для Orbita. Локально сохранённые данные будут зашифрованы с использованием пароля. Если вы забудете пароль, то восстановить аккаунт не получится.')}
            </p>

            {/* Inputs Container */}
            <div className="flex flex-col gap-3 mt-1">
              {isAlreadySet && (
                <div className="relative flex items-center">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('security.current_password', 'Текущий пароль')}
                    className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                      borderRadius: '0px',
                      color: 'var(--text-main, #ffffff)',
                    }}
                    onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                    onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                  >
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              )}

              <div className="relative flex items-center">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('security.new_password', 'Новый пароль')}
                  className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                    borderRadius: '0px',
                    color: 'var(--text-main, #ffffff)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="relative flex items-center">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('security.confirm_password', 'Подтвердить пароль')}
                  className="w-full px-1 py-2.5 outline-none text-sm transition-all pr-8"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.15))',
                    borderRadius: '0px',
                    color: 'var(--text-main, #ffffff)',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderBottomColor = 'var(--accent-color, #7C3AED)')}
                  onBlur={(e) => (e.currentTarget.style.borderBottomColor = 'var(--border-color, rgba(255, 255, 255, 0.15))')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-1 p-1 text-[var(--text-dim)] hover:text-[var(--text-main)] cursor-pointer"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Block 2: Strength Indicator */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: MD3.onSurfaceVar,
            letterSpacing: '0.05em',
            padding: '0 20px',
            marginBottom: 8,
          }}>
            {t('security.strength_group', 'Надёжность')}
          </div>

          <div style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '20px',
            margin: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface, margin: 0 }}>
              {t('security.strength_title', 'Индикатор надёжности пароля')}
            </h3>
            <p style={{ fontSize: 13, color: MD3.onSurfaceVar, lineHeight: 1.45, margin: 0 }}>
              {t('security.strength_desc', 'Надёжный пароль помогает защитить ваши сообщения и вложения при утере или краже устройства.')}
            </p>

            {/* Dark inner requirement box */}
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}>
              <div className="flex items-center gap-3 text-xs font-medium">
                {isLength12 ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: isLength12 ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_length_12', 'Длина больше 12 симво символов')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasDigit ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasDigit ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_digit', 'Содержит цифру')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasSymbol ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasSymbol ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_symbol', 'Содержит символ')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasUpper ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasUpper ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_uppercase', 'Содержит заглавную букву')}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium">
                {hasLower ? (
                  <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <XCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                )}
                <span style={{ color: hasLower ? MD3.onSurface : MD3.onSurfaceVar }}>
                  {t('security.req_lowercase', 'Содержит строчную букву')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400 font-medium text-center mb-3">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="text-xs text-emerald-400 font-medium text-center mb-3">{successMsg}</p>
        )}

        {/* Action Button */}
        <div className="flex flex-col items-center gap-3 mt-4 px-4">
          <button
            type="submit"
            disabled={isSubmitting || !newPassword || newPassword !== confirmPassword}
            className="px-8 py-2.5 rounded-full text-sm font-semibold border transition-all cursor-pointer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              color: MD3.onSurface,
              opacity: isSubmitting || !newPassword || newPassword !== confirmPassword ? 0.4 : 1,
            }}
          >
            {isAlreadySet ? t('security.action_button_change', 'Изменить пароль') : t('security.action_button_set', 'Поставить пароль')}
          </button>

          {isAlreadySet && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isSubmitting || !currentPassword}
              className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
            >
              {t('security.remove_password', 'Удалить пароль')}
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
};

const SignalThemePicker: React.FC<{
  activeTheme?: ThemeId;
  onThemeChange?: (id: ThemeId) => void;
}> = ({ activeTheme = 'system', onThemeChange }) => {
  const { t } = useTranslation();

  const themeOptions: { id: ThemeId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'system',
      label: t('settings.theme_system'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      ),
    },
    {
      id: 'light',
      label: t('settings.theme_light'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ),
    },
    {
      id: 'dark',
      label: t('settings.theme_dark'),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        padding: '4px 20px 14px',
        userSelect: 'none',
      }}
    >
      {themeOptions.map((opt) => {
        const isActive = activeTheme === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onThemeChange?.(opt.id)}
            aria-label={opt.label}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 8px',
              borderRadius: 14,
              backgroundColor: isActive
                ? 'color-mix(in srgb, var(--accent-color, #2c6bed) 14%, var(--surface-container, #262626))'
                : 'var(--surface-container, #262626)',
              border: isActive
                ? '2px solid var(--accent-color, #2c6bed)'
                : '2px solid transparent',
              color: isActive ? 'var(--accent-color, #2c6bed)' : 'var(--text-main)',
              transition: 'all 0.18s ease',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ opacity: isActive ? 1 : 0.8 }}>{opt.icon}</div>
            <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 500 }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const SignalChatColorPicker: React.FC = () => {
  const { t } = useTranslation();
  const chatColor = useChatStore((s) => s.chatColor);
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const setChatColor = useChatStore((s) => s.setChatColor);
  const resetChatColor = useChatStore((s) => s.resetChatColor);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleCustomColorClick = () => {
    colorInputRef.current?.click();
  };

  const handleColorInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      setChatColor(val);
    }
  };

  const isCustomActive = !CHAT_COLOR_PRESETS.some((p) => p.value === chatColor);

  return (
    <div
      style={{
        margin: '0 20px 16px',
        backgroundColor: 'var(--surface-container, #262626)',
        borderRadius: 16,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '14px 12px',
          backgroundColor: 'var(--bg-primary, #121212)',
          borderRadius: 12,
          border: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        }}
      >
        <div
          className="relative flex flex-col"
          style={{
            alignSelf: 'flex-start',
            maxWidth: 'min(460px, 88%)',
            width: 'fit-content',
            minWidth: '50px',
            padding: '6.5px 12px 6.5px 11px',
            borderRadius: `var(--bubble-radius, ${bubbleRadius}px)`,
            background: 'var(--chat-bubble-incoming-bg, var(--surface-container, #282828))',
            color: 'var(--chat-bubble-incoming-text, var(--text-main, #ffffff))',
            fontSize: 'calc(12px * var(--text-scale, 1))',
          }}
        >
          <div
            className="select-text select-text-incoming"
            style={{
              fontSize: 'inherit',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              width: '100%',
              position: 'relative',
            }}
          >
            <span>
              {t('settings.chat_color_preview_incoming')}{' '}
              <span className="emoji-font" style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>
                👋
              </span>
            </span>
            <span
              aria-hidden
              className="flex-shrink-0"
              style={{
                float: 'right',
                marginLeft: '10px',
                marginRight: '-6px',
                marginBottom: '-4.5px',
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                className="tabular-nums select-none"
                style={{
                  color: 'var(--text-dim)',
                  fontSize: 'calc(11px * var(--text-scale, 1))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
              >
                20:19
              </span>
            </span>
            <div style={{ clear: 'both' }} />
          </div>
        </div>

        <div
          className="relative flex flex-col"
          style={{
            alignSelf: 'flex-end',
            maxWidth: 'min(460px, 88%)',
            width: 'fit-content',
            minWidth: '50px',
            padding: '6.5px 12px 6.5px 11px',
            borderRadius: `var(--bubble-radius, ${bubbleRadius}px)`,
            background: chatColor || DEFAULT_CHAT_COLOR,
            color: '#ffffff',
            fontSize: 'calc(12px * var(--text-scale, 1))',
          }}
        >
          <div
            className="select-text select-text-own"
            style={{
              fontSize: 'inherit',
              lineHeight: 1.3,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              width: '100%',
              position: 'relative',
            }}
          >
            <span>
              {t('settings.chat_color_preview_outgoing')}{' '}
              <span className="emoji-font" style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif" }}>
                ✨
              </span>
            </span>
            <span
              aria-hidden
              className="flex-shrink-0"
              style={{
                float: 'right',
                marginLeft: '10px',
                marginRight: '-9px',
                marginBottom: '-4.5px',
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <span
                className="tabular-nums select-none"
                style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: 'calc(11px * var(--text-scale, 1))',
                  display: 'inline-flex',
                  alignItems: 'center',
                  lineHeight: 1,
                }}
              >
                20:20
                <span style={{ display: 'inline-flex', width: '26px', minWidth: '26px', flexShrink: 0, justifyContent: 'flex-end' }}>
                  <MessageStatus status="read" isOwn={true} />
                </span>
              </span>
            </span>
            <div style={{ clear: 'both' }} />
          </div>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--border-color, rgba(255,255,255,0.08))', width: '100%' }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(38px, 1fr))',
          gap: 10,
          justifyItems: 'center',
          alignItems: 'center',
        }}
      >
        {CHAT_COLOR_PRESETS.map((preset) => {
          const isSelected = chatColor === preset.value;
          return (
            <button
              key={preset.id}
              onClick={() => setChatColor(preset.value)}
              aria-label={preset.name}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: preset.value,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxSizing: 'border-box',
                outline: isSelected ? '2.5px solid var(--accent-color, #2c6bed)' : 'none',
                outlineOffset: 3,
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 0.15s ease, outline 0.15s ease',
              }}
            >
              {isSelected && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}

        <button
          onClick={handleCustomColorClick}
          aria-label={t('settings.custom_color')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 36,
            height: 36,
            borderRadius: '50%',
            backgroundColor: isCustomActive ? chatColor : '#ffffff',
            color: isCustomActive ? '#ffffff' : '#121212',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            outline: isCustomActive ? '2.5px solid var(--accent-color, #2c6bed)' : 'none',
            outlineOffset: 3,
            transform: isCustomActive ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.15s ease, outline 0.15s ease',
            boxSizing: 'border-box',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          }}
        >
          {isCustomActive ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
          <input
            ref={colorInputRef}
            type="color"
            value={chatColor.startsWith('#') ? chatColor : '#2c6bed'}
            onChange={handleColorInputChange}
            style={{ display: 'none' }}
          />
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
        <button
          onClick={resetChatColor}
          aria-label={t('settings.reset_all_chat_colors')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--accent-color, #2c6bed)',
            padding: '6px 12px',
            borderRadius: 8,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {t('settings.reset_all_chat_colors')}
        </button>
      </div>
    </div>
  );
};


export const BubbleSlider = ({
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  step,
  label,
  labelColor,
  valueDisplay,
  formatValue,
  valuePlacement = 'top-right',
  cssVar,
  containerStyle,
  ariaLabel,
}: {
  value: number;
  onChange?: (v: number) => void;
  onChangeCommitted?: (v: number) => void;
  min: number;
  max: number;
  step: number;
  label?: string;
  labelColor?: string;
  valueDisplay?: string;
  formatValue?: (v: number) => string;
  valuePlacement?: 'top-right' | 'right';
  cssVar?: string;
  containerStyle?: React.CSSProperties;
  ariaLabel?: string;
}) => {
  const [localVal, setLocalVal] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const localValRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalVal(value);
      localValRef.current = value;
      if (cssVar) {
        document.documentElement.style.setProperty(cssVar, `${value}px`);
      }
    }
  }, [value, cssVar]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
    };
  }, []);

  const commit = useCallback((finalVal: number) => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = null;
    }
    const snappedVal = step && step > 0 ? Math.round((finalVal - min) / step) * step + min : finalVal;
    const clampedVal = Math.max(min, Math.min(max, snappedVal));
    setLocalVal(clampedVal);
    localValRef.current = clampedVal;
    if (onChangeCommitted) {
      onChangeCommitted(clampedVal);
    } else if (onChange) {
      onChange(clampedVal);
    }
  }, [min, max, step, onChange, onChangeCommitted]);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        commit(localValRef.current);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [commit]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = Number(e.target.value);
    setLocalVal(nextVal);
    localValRef.current = nextVal;
    if (cssVar) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const rounded = step && step >= 1 ? Math.round(nextVal) : nextVal;
        document.documentElement.style.setProperty(cssVar, `${rounded}px`);
      });
    }
    if (onChange && onChangeCommitted) {
      onChange(nextVal);
    } else if (onChange) {
      if (commitTimeoutRef.current) clearTimeout(commitTimeoutRef.current);
      commitTimeoutRef.current = setTimeout(() => {
        onChange(nextVal);
      }, 150);
    }
  };

  const handlePointerDown = () => {
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      commit(localValRef.current);
    }
  };

  const fillPercent = Math.max(0, Math.min(100, ((localVal - min) / (max - min)) * 100));
  const activeVal = step && step > 0 ? Math.round((localVal - min) / step) * step + min : localVal;
  const displayedText = formatValue ? formatValue(activeVal) : (valueDisplay !== undefined ? valueDisplay : `${activeVal}`);

  const trackContent = (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 28,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 4,
          borderRadius: 2,
          backgroundColor: MD3.outline,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${fillPercent}%`,
            borderRadius: 2,
            backgroundColor: 'var(--accent-color, #7c54cc)',
            transition: isDragging ? 'none' : 'width 0.18s cubic-bezier(0.2, 0, 0, 1)',
            willChange: 'width',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${fillPercent}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: 'var(--accent-color, #7c54cc)',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
            transition: isDragging ? 'none' : 'left 0.18s cubic-bezier(0.2, 0, 0, 1)',
            willChange: 'left',
            pointerEvents: 'none',
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={localVal}
        onChange={handleInput}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyUp={handlePointerUp}
        onBlur={handlePointerUp}
        aria-label={ariaLabel || label || 'slider'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          margin: 0,
          padding: 0,
          cursor: isDragging ? 'grabbing' : 'pointer',
          zIndex: 2,
        }}
      />
    </div>
  );

  if (valuePlacement === 'right') {
    return (
      <div style={{ padding: '0 20px 14px 20px', userSelect: 'none', ...containerStyle }}>
        {label && (
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: labelColor || 'var(--accent-color, #9b7dd4)',
              marginBottom: 10,
            }}
          >
            {label}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>{trackContent}</div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: labelColor || 'var(--accent-color, #9b7dd4)',
              minWidth: 40,
              textAlign: 'right',
            }}
          >
            {displayedText}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 20px', marginTop: 8, userSelect: 'none', ...containerStyle }}>
      {(label || (displayedText && valueDisplay !== undefined) || (displayedText && formatValue)) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          {label && <span style={{ fontSize: 12, color: labelColor || MD3.onSurfaceVar }}>{label}</span>}
          {displayedText && (
            <span style={{ fontSize: 12, fontWeight: 600, color: MD3.onSurface }}>{displayedText}</span>
          )}
        </div>
      )}
      {trackContent}
    </div>
  );
};

const BubbleRadiusControl = () => {
  const bubbleRadius = useChatStore((s) => s.bubbleRadius);
  const setBubbleRadius = useChatStore((s) => s.setBubbleRadius);
  return (
    <BubbleSlider
      value={bubbleRadius}
      onChangeCommitted={setBubbleRadius}
      min={4}
      max={16}
      step={1}
      cssVar="--bubble-radius"
    />
  );
};




const PreferencesGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div style={{ marginBottom: 24, width: '100%' }}>
    <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: MD3.onSurfaceVar,
      letterSpacing: '0.05em',
      padding: '0 20px',
      marginBottom: 8,
    }}>
      {title}
    </div>
    <div style={{
      backgroundColor: MD3.surface,
      borderRadius: 0,
      padding: '0 20px',
      margin: 0,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {children}
    </div>
  </div>
);

const PreferenceSwitch = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
    gap: 12,
  }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>{label}</div>
      {description && <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{description}</div>}
    </div>
    <M3Switch checked={checked} onChange={onChange} />
  </div>
);

interface OrbitaSelectOption {
  value: string;
  label: string;
}

const OrbitaSelect = ({
  value,
  options,
  onChange,
  ariaLabel,
  minWidth = 160,
  width = 'auto',
}: {
  value: string;
  options: OrbitaSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  minWidth?: number | string;
  width?: number | string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width,
        minWidth,
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={ariaLabel || selectedOption?.label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          backgroundColor: MD3.surfaceVar,
          color: MD3.onSurface,
          border: 'none',
          borderRadius: 10,
          padding: '9px 14px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'background-color 0.15s ease',
          boxShadow: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = MD3.surfaceVar;
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 8,
            textAlign: 'left',
          }}
        >
          {selectedOption?.label}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: MD3.onSurfaceVar,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: width === '100%' ? '100%' : 'max-content',
              minWidth: '100%',
              maxWidth: 320,
              maxHeight: 240,
              overflowY: 'auto',
              backgroundColor: 'var(--md-surface, #2a253b)',
              border: 'none',
              borderRadius: 10,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: 5,
              zIndex: 1000,
              boxSizing: 'border-box',
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? MD3.primary : MD3.onSurface,
                    backgroundColor: isSelected ? 'rgba(155, 125, 212, 0.12)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.12s ease',
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </span>
                  {isSelected && (
                    <Check
                      size={15}
                      style={{
                        color: MD3.primary,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DeviceSelect = ({
  label,
  value,
  devices,
  defaultLabel,
  onChange,
}: {
  label: string;
  value: string;
  devices: MediaDeviceInfo[];
  defaultLabel: string;
  onChange: (deviceId: string) => void;
}) => {
  const options = [
    { value: '', label: defaultLabel },
    ...devices.map((device, idx) => ({
      value: device.deviceId,
      label: device.label || `${label} ${idx + 1}`,
    })),
  ];

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: MD3.onSurfaceVar, marginBottom: 8 }}>
        {label}
      </div>
      <OrbitaSelect
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={label}
        width="100%"
      />
    </div>
  );
};

const HotkeySwitch = ({
  enterLabel,
  shiftEnterLabel,
  sendOnEnter,
  onChange,
}: {
  enterLabel: string;
  shiftEnterLabel: string;
  sendOnEnter: boolean;
  onChange: (value: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 0',
      gap: 8,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: MD3.onSurface }}>{enterLabel}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>{t('settings.preferences_enter_desc')}</div>
          </div>
          <M3Switch checked={sendOnEnter} onChange={() => onChange(true)} />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: MD3.onSurface }}>{shiftEnterLabel}</div>
            <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>{t('settings.preferences_shift_enter_desc')}</div>
          </div>
          <M3Switch checked={!sendOnEnter} onChange={() => onChange(false)} />
        </div>
      </div>
    </div>
  );
};

type TabId = 'main' | 'security' | 'connection' | 'chats' | 'calls' | 'font' | 'dataMemory' | 'energy' | 'notifications' | 'language' | 'preferences' | 'password' | 'qrCode' | 'backup' | 'orbitosAi';

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const {
    setTheme, currentTheme,
    fontFamily, setFontFamily,
    language, setLanguage,
    notificationCount, setNotificationCount,
    notificationPosition, setNotificationPosition,
    notificationSoundEnabled, setNotificationSoundEnabled,
    notificationsEnabled, setNotificationsEnabled,
    notificationFlashTaskbar, setNotificationFlashTaskbar,
    notificationVolume, setNotificationVolume,
    notificationShowName, setNotificationShowName,
    notificationShowText, setNotificationShowText,
    notificationNativeWindows, setNotificationNativeWindows,
    notificationRespectFocus, setNotificationRespectFocus,
    myCode,
    setMyCode,
    autoUpdate, setAutoUpdate,
    showInSystemTray, setShowInSystemTray,
    autoLaunch, setAutoLaunch,
    sendOnEnter, setSendOnEnter,
    cacheSizeLimit, setCacheSizeLimit,
    mediaCacheLimit, setMediaCacheLimit,
    cacheCleanupAge, setCacheCleanupAge,
    autoLoadMedia, setAutoLoadMedia,
    noiseSuppression,
    noiseSuppressionMode, setNoiseSuppressionMode,
    callSoundsEnabled, setCallSoundsEnabled,
    alwaysRelayCalls, setAlwaysRelayCalls,
    selectedCameraId, setSelectedCameraId,
    selectedMicrophoneId, setSelectedMicrophoneId,
    selectedSpeakerId, setSelectedSpeakerId,
    hideMenuBar, setHideMenuBar,
    voiceCallsEnabled, setVoiceCallsEnabled,
  } = useChatStore();
  const { hasCameraPermission, hasMicrophonePermission, setCameraPermission, setMicrophonePermission } = useDevicePermissionStore();
  const { nickname, avatarUrl, setNickname } = useAuthStore();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const resetChats = useChatStore((state) => state.resetChats);
  const setCurrentView = useChatStore((state) => state.setCurrentView);
  const { appVersion } = useDeviceStore();
  const { proxyEnabled, activeProxyId, proxies } = useConnectionStore();
  const activeProxy = proxies.find((p) => p.id === activeProxyId);
  const initialSettingsTab = useChatStore((s) => s.initialSettingsTab) as TabId | undefined;
  const [tabStack, setTabStack] = useState<TabId[]>(() => [initialSettingsTab || 'main']);
  const activeTab = tabStack[tabStack.length - 1];
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => (typeof window !== 'undefined' ? (localStorage.getItem('orbita_gemini_api_key') || '') : ''));
  const [aiKeyInput, setAiKeyInput] = useState<string>(() => (typeof window !== 'undefined' ? (localStorage.getItem('orbita_gemini_api_key') || '') : ''));
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [aiTestError, setAiTestError] = useState('');

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);

  const loadMediaDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setAudioInputDevices(devs.filter((d) => d.kind === 'audioinput'));
      setVideoInputDevices(devs.filter((d) => d.kind === 'videoinput'));
      setAudioOutputDevices(devs.filter((d) => d.kind === 'audiooutput'));
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === 'calls') {
      loadMediaDevices();
    }
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadMediaDevices);
      return () => navigator.mediaDevices.removeEventListener('devicechange', loadMediaDevices);
    }
  }, [activeTab, loadMediaDevices]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.getAutoLaunchState) {
      window.orbita.getAutoLaunchState().then((enabled) => setAutoLaunch(enabled)).catch(() => {});
    }
  }, [setAutoLaunch]);

  const [updateStatus, setUpdateStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
    version?: string;
    percent?: number;
    error?: string;
  }>({ status: 'idle' });
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.orbita?.onUpdateStatus) {
      const unsub = window.orbita.onUpdateStatus((data) => {
        setUpdateStatus(data);
        if (data.status !== 'checking') {
          setIsCheckingUpdate(false);
        }
      });
      return unsub;
    }
  }, []);

  const handleToggleAutoUpdate = () => {
    const nextVal = !autoUpdate;
    setAutoUpdate(nextVal);
    if (typeof window !== 'undefined' && window.orbita?.setAutoDownloadUpdates) {
      window.orbita.setAutoDownloadUpdates(nextVal);
    }
  };

  const handleCheckForUpdates = async () => {
    if (typeof window !== 'undefined' && window.orbita?.checkForUpdates) {
      setIsCheckingUpdate(true);
      setUpdateStatus({ status: 'checking' });
      try {
        await window.orbita.checkForUpdates();
      } catch (e: any) {
        setUpdateStatus({ status: 'error', error: e?.message || String(e) });
        setIsCheckingUpdate(false);
      }
    }
  };

  const handleDownloadUpdate = async () => {
    if (typeof window !== 'undefined' && window.orbita?.downloadUpdate) {
      setUpdateStatus((prev) => ({ ...prev, status: 'downloading', percent: 0 }));
      await window.orbita.downloadUpdate();
    }
  };

  const handleRestartAndInstall = () => {
    if (typeof window !== 'undefined' && window.orbita?.quitAndInstallUpdate) {
      window.orbita.quitAndInstallUpdate();
    }
  };

  const [isMobileWidth, setIsMobileWidth] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 650 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileWidth(window.innerWidth < 650);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (initialSettingsTab) {
      setTabStack([initialSettingsTab]);
    }
  }, [initialSettingsTab]);

  const pushTab = (tab: TabId) => setTabStack(prev => [...prev, tab]);
  const popTab = () => setTabStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);

  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(window.innerHeight * 0.85, 720);
    }
    return 720;
  });

  useEffect(() => {
    if (isMobileWidth) return;

    const measure = () => {
      if (innerContentRef.current) {
        // Sticky Header is 56px + inner content + 12px padding
        const contentH = innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight;
        const measured = Math.ceil(contentH) + 68;
        if (measured > 0) {
          setTargetHeight(measured);
        }
      }
    };

    const rafId = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 30);

    let ro: ResizeObserver | null = null;
    if (innerContentRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(innerContentRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      ro?.disconnect();
    };
  }, [activeTab, isMobileWidth]);

  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const [settingsThumb, setSettingsThumb] = useState<{ top: number; height: number } | null>(null);
  const [isSettingsActive, setIsSettingsActive] = useState(false);
  const settingsActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSettingsThumb = useCallback(() => {
    const el = settingsScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 8) {
      setSettingsThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setSettingsThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerSettingsActive = useCallback(() => {
    updateSettingsThumb();
    const el = settingsScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsSettingsActive(true);
      if (settingsActiveTimerRef.current) clearTimeout(settingsActiveTimerRef.current);
      settingsActiveTimerRef.current = setTimeout(() => {
        setIsSettingsActive(false);
      }, 1000);
    } else {
      setIsSettingsActive(false);
    }
  }, [updateSettingsThumb]);

  const handleSettingsMouseLeave = useCallback(() => {
    if (settingsActiveTimerRef.current) clearTimeout(settingsActiveTimerRef.current);
    setIsSettingsActive(false);
  }, []);

  useEffect(() => {
    updateSettingsThumb();
  }, [activeTab, updateSettingsThumb]);

  useEffect(() => {
    const el = settingsScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateSettingsThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSettingsThumb]);


  const [nicknameEditOpen, setNicknameEditOpen] = useState(false);
  const [devToastOpen, setDevToastOpen] = useState(false);

  const triggerDevToast = useCallback(() => {
    setDevToastOpen(true);
    setTimeout(() => setDevToastOpen(false), 3000);
  }, []);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copyToastOpen, setCopyToastOpen] = useState(false);

  const handleCopyCode = async () => {
    if (!myCode) return;
    try {
      const link = getInviteLink(myCode);
      await navigator.clipboard.writeText(link);
      setCopyToastOpen(true);
      setTimeout(() => setCopyToastOpen(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleCacheSizeLimitChange = async (value: number) => {
    setCacheSizeLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('total', value);
    }
  };

  const handleMediaCacheLimitChange = async (value: number) => {
    setMediaCacheLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('media', value);
    }
  };

  const handleCacheCleanupAgeChange = async (value: number) => {
    setCacheCleanupAge(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaEvictByAge) {
      await window.orbita.mediaEvictByAge(value);
    }
  };

  const tabTitles: Record<string, string> = {
    security:      t('settings.privacy'),
    password:      securityService.isPasswordSet() ? t('security.modal_title_change') : t('security.modal_title_set'),
    connection:    t('settings.connection'),
    chats:         t('settings.appearance'),
    calls:         t('settings.calls'),
    font:          t('settings.font'),
    dataMemory:    t('settings.data_memory'),
    energy:        t('settings.energy'),
    notifications: t('settings.notifications_and_sounds') || 'Уведомления и звуки',
    language:      t('settings.language'),
    preferences:   t('settings.preferences'),
    qrCode:        t('qrModal.title', 'Получить QR-код'),
    backup:        t('backup.menu_item', 'Резервная копия'),
    orbitosAi:     t('settings.orbitos_ai', 'ИИ-помощник ORBITA'),
  };

  const languageDisplayOptions = [
    { value: 'ru', label: 'Русский', native: 'Russian' },
    { value: 'uk', label: 'Українська', native: 'Ukrainian' },
    { value: 'be', label: 'Беларуская', native: 'Belarusian' },
    { value: 'en', label: 'English', native: 'English' },
    { value: 'de', label: 'Deutsch', native: 'German' },
    { value: 'fr', label: 'Français', native: 'French' },
    { value: 'es', label: 'Español', native: 'Spanish' },
    { value: 'it', label: 'Italiano', native: 'Italian' },
    { value: 'pt', label: 'Português', native: 'Portuguese' },
    { value: 'nl', label: 'Nederlands', native: 'Dutch' },
    { value: 'pl', label: 'Polski', native: 'Polish' },
    { value: 'tr', label: 'Türkçe', native: 'Turkish' },
    { value: 'ja', label: '日本語', native: 'Japanese' },
    { value: 'ko', label: '한국어', native: 'Korean' },
    { value: 'zh', label: '简体中文', native: 'Chinese (Simplified)' },
    { value: 'zh-Hant', label: '繁體中文', native: 'Chinese (Traditional)' },
    { value: 'hi', label: 'हिन्दी', native: 'Hindi' },
    { value: 'kk', label: 'Қазақша', native: 'Kazakh' },
  ];

  const FONT_OPTIONS: { value: FontFamily; label: string; native?: string }[] = [
    { value: 'system', label: t('settings.default'), native: 'Default System' },
    { value: 'Segoe UI', label: 'Segoe UI', native: 'Segoe UI' },
    { value: 'Segoe UI Black', label: 'Segoe UI Black', native: 'Segoe UI Black' },
    { value: 'Inter', label: 'Inter', native: 'Inter' },
    { value: 'Roboto', label: 'Roboto', native: 'Roboto' },
    { value: 'Open Sans', label: 'Open Sans', native: 'Open Sans' },
    { value: 'Lato', label: 'Lato', native: 'Lato' },
    { value: 'Montserrat', label: 'Montserrat', native: 'Montserrat' },
    { value: 'Poppins', label: 'Poppins', native: 'Poppins' },
    { value: 'Nunito', label: 'Nunito', native: 'Nunito' },
    { value: 'Rubik', label: 'Rubik', native: 'Rubik' },
    { value: 'Fira Sans', label: 'Fira Sans', native: 'Fira Sans' },
    { value: 'Ubuntu', label: 'Ubuntu', native: 'Ubuntu' },
    { value: 'Manrope', label: 'Manrope', native: 'Manrope' },
    { value: 'Arial', label: 'Arial', native: 'Arial' },
    { value: 'Arial Black', label: 'Arial Black', native: 'Arial Black' },
    { value: 'Trebuchet MS', label: 'Trebuchet MS', native: 'Trebuchet MS' },
    { value: 'Verdana', label: 'Verdana', native: 'Verdana' },
    { value: 'Tahoma', label: 'Tahoma', native: 'Tahoma' },
    { value: 'Georgia', label: 'Georgia', native: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman', native: 'Times New Roman' },
    { value: 'Merriweather', label: 'Merriweather', native: 'Merriweather' },
    { value: 'Playfair Display', label: 'Playfair Display', native: 'Playfair Display' },
    { value: 'Fira Code', label: 'Fira Code', native: 'Monospace' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono', native: 'Monospace' },
    { value: 'Consolas', label: 'Consolas', native: 'Monospace' },
    { value: 'Courier New', label: 'Courier New', native: 'Monospace' },
    { value: 'Comic Sans MS', label: 'Comic Sans MS', native: 'Cursive' },
    { value: 'Caveat', label: 'Caveat', native: 'Handwriting' },
    { value: 'Pacifico', label: 'Pacifico', native: 'Handwriting' },
  ];

  useEffect(() => {
    if (!myCode) {
      setMyCode(generateRandomCode());
    }
  }, [myCode, setMyCode]);

  const sendProfileUpdate = useCallback((updates: { avatarUrl?: string | null; nickname?: string }) => {
    broadcastProfileUpdate(updates);
  }, []);


  const handleNicknameSave = (newNickname: string) => {
    setNickname(newNickname);
    sendProfileUpdate({ nickname: newNickname });
  };


  const renderDataMemory = () => {
    return (
      <DataMemorySettings
        cacheSizeLimit={cacheSizeLimit}
        mediaCacheLimit={mediaCacheLimit}
        cacheCleanupAge={cacheCleanupAge}
        autoLoadMedia={autoLoadMedia}
        onCacheSizeLimitChange={handleCacheSizeLimitChange}
        onMediaCacheLimitChange={handleMediaCacheLimitChange}
        onCacheCleanupAgeChange={handleCacheCleanupAgeChange}
        onAutoLoadMediaChange={() => setAutoLoadMedia(!autoLoadMedia)}
      />
    );
  };

  const renderCalls = () => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <PreferencesGroup title={t('settings.calls')}>
          <PreferenceSwitch
            label={t('settings.enable_incoming_calls')}
            checked={voiceCallsEnabled}
            onChange={() => setVoiceCallsEnabled(!voiceCallsEnabled)}
          />
          <PreferenceSwitch
            label={t('settings.play_call_sounds')}
            checked={callSoundsEnabled}
            onChange={() => setCallSoundsEnabled(!callSoundsEnabled)}
          />
        </PreferencesGroup>

        <PreferencesGroup title={t('settings.devices_header')}>
          <DeviceSelect
            label={t('settings.video_device')}
            value={selectedCameraId}
            devices={videoInputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedCameraId(id);
              liveKitService.switchDevice('videoinput', id);
            }}
          />
          <DeviceSelect
            label={t('settings.microphone_device')}
            value={selectedMicrophoneId}
            devices={audioInputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedMicrophoneId(id);
              liveKitService.switchDevice('audioinput', id);
            }}
          />
          <DeviceSelect
            label={t('settings.speakers_device')}
            value={selectedSpeakerId}
            devices={audioOutputDevices}
            defaultLabel={t('settings.default_device')}
            onChange={(id) => {
              setSelectedSpeakerId(id);
              liveKitService.switchDevice('audiooutput', id);
            }}
          />
        </PreferencesGroup>

        <PreferencesGroup title={t('settings.advanced_header')}>
          <PreferenceSwitch
            label={t('settings.always_relay_calls')}
            description={t('settings.always_relay_calls_desc')}
            checked={alwaysRelayCalls}
            onChange={() => setAlwaysRelayCalls(!alwaysRelayCalls)}
          />
        </PreferencesGroup>
      </motion.div>
    );
  };

  const renderLanguage = () => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <Block>
          {languageDisplayOptions.map((opt) => {
            const isSelected = opt.value === language;
            return (
              <div
                key={opt.value}
                onClick={() => setLanguage(opt.value as Language)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  transition: 'background 150ms',
                  backgroundColor: isSelected ? 'rgba(197,180,227,0.12)' : 'transparent',
                  userSelect: 'none',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '48px',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? MD3.primary : MD3.outlineMed}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'border-color 150ms',
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: MD3.primary }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: isSelected ? 600 : 400,
                      color: MD3.onSurface,
                    }}
                  >
                    {opt.label}
                  </div>
                  {opt.native && opt.native !== opt.label && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{opt.native}</div>
                  )}
                </div>
              </div>
            );
          })}
        </Block>
      </motion.div>
    );
  };

  const renderFont = () => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 32px' }}
      >
        <Block>
          {FONT_OPTIONS.map((opt) => {
            const isSelected = opt.value === fontFamily;
            const itemFont = FONT_MAP[opt.value as FontFamily] || 'inherit';
            return (
              <div
                key={opt.value}
                onClick={() => setFontFamily(opt.value as FontFamily)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 20px',
                  cursor: 'pointer',
                  transition: 'background 150ms',
                  backgroundColor: isSelected ? 'rgba(197,180,227,0.12)' : 'transparent',
                  userSelect: 'none',
                  contentVisibility: 'auto',
                  containIntrinsicSize: '48px',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(202,196,208,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? MD3.primary : MD3.outlineMed}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'border-color 150ms',
                  }}
                >
                  {isSelected && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: MD3.primary }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="font-picker-item"
                    style={{
                      fontSize: 15,
                      fontWeight: isSelected ? 600 : 400,
                      color: MD3.onSurface,
                      '--item-font': itemFont,
                    } as React.CSSProperties}
                  >
                    {opt.label}
                  </div>
                  {opt.native && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{opt.native}</div>
                  )}
                </div>
              </div>
            );
          })}
        </Block>
      </motion.div>
    );
  };

  const handleTestAiKey = async () => {
    const keyToTest = aiKeyInput.trim();
    if (!keyToTest) return;
    setAiTestStatus('testing');
    setAiTestError('');
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToTest}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
      }
      setAiTestStatus('success');
    } catch (err: any) {
      setAiTestStatus('error');
      setAiTestError(err?.message || 'Error');
    }
  };

  const handleSaveAiKey = () => {
    const key = aiKeyInput.trim();
    if (typeof window !== 'undefined') {
      if (key) {
        localStorage.setItem('orbita_gemini_api_key', key);
      } else {
        localStorage.removeItem('orbita_gemini_api_key');
      }
    }
    setGeminiApiKey(key);
    setAiTestStatus('success');
  };

  const handleClearAiKey = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('orbita_gemini_api_key');
    }
    setAiKeyInput('');
    setGeminiApiKey('');
    setAiTestStatus('idle');
    setAiTestError('');
  };

  const renderOrbitosAi = () => {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <Block>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 18%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-color, #7C3AED)',
                  flexShrink: 0,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="24" height="24">
                  <path fill="currentColor" d="M896 128q-8 0-18-3L752 252q123 65 197.5 186t74.5 266q0 27-19 45.5T960 768H64q-26 0-45-18.5T0 704q0-145 74.5-266T272 252L146 125q-10 3-18 3q-27 0-45.5-18.5T64 64.5T83 19t45-19t45 19t19 45q0 8-3 18l144 143q88-33 179-33t179 33L835 82q-3-10-3-18q0-26 18.5-45t45-19T941 19t19 45.5t-19 45t-45 18.5M256 448q-26 0-45 19t-19 45.5t19 45t45 18.5t45-18.5t19-45t-19-45.5t-45-19m511.5 128q26.5 0 45.5-18.5t19-45t-19-45.5t-45-19t-45 19t-19 45.5t18.5 45t45 18.5"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface }}>
                  {t('settings.ai_title', 'Google Gemini 1.5 Flash')}
                </div>
                <div style={{ fontSize: 12.5, color: MD3.onSurfaceVar, marginTop: 2 }}>
                  {geminiApiKey ? t('settings.ai_active', 'Активен') : t('settings.ai_status_label', 'Бесплатный официальный ИИ-ассистент')}
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: MD3.onSurfaceVar, margin: 0, lineHeight: 1.5 }}>
              {t('settings.ai_desc', 'Бот ORBITA использует сверхбыструю модель Gemini 1.5 Flash. Он поможет разобраться с шифрованием, настройками, резервными копиями и ответит на любые вопросы.')}
            </p>

            <button
              type="button"
              onClick={() => {
                const url = 'https://aistudio.google.com/app/apikey';
                if ((window as any).orbita?.openExternal) {
                  (window as any).orbita.openExternal(url);
                } else {
                  window.open(url, '_blank');
                }
              }}
              aria-label={t('settings.ai_get_free_key', 'Получить бесплатный ключ в Google AI Studio')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.07)',
                color: 'var(--accent-color, #9b7dd4)',
                fontSize: 13,
                fontWeight: 600,
                border: '1px solid var(--md-outline, rgba(255,255,255,0.12))',
                cursor: 'pointer',
                transition: 'background-color 150ms',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <span>{t('settings.ai_get_free_key', 'Получить ключ бесплатно (Google AI Studio)')}</span>
            </button>
          </div>
        </Block>

        <Block>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: MD3.onSurface }}>
              {t('settings.ai_key_label', 'API-ключ Gemini')}
            </label>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showAiKey ? 'text' : 'password'}
                value={aiKeyInput}
                onChange={(e) => {
                  setAiKeyInput(e.target.value);
                  setAiTestStatus('idle');
                }}
                placeholder={t('settings.ai_key_placeholder', 'Вставьте ваш AIzaSy... ключ')}
                aria-label={t('settings.ai_key_label', 'API-ключ Gemini')}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 42px 10px 14px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--md-outline, rgba(255,255,255,0.14))',
                  color: MD3.onSurface,
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: '"JetBrains Mono", Consolas, monospace',
                }}
              />
              <button
                type="button"
                onClick={() => setShowAiKey(!showAiKey)}
                aria-label={showAiKey ? t('common.hide', 'Скрыть') : t('common.show', 'Показать')}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'none',
                  border: 'none',
                  color: MD3.onSurfaceVar,
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showAiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {aiTestStatus === 'testing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MD3.onSurfaceVar }}>
                <RefreshCw size={15} className="spin" />
                <span>{t('settings.ai_status_testing', 'Проверка соединения с Gemini...')}</span>
              </div>
            )}

            {aiTestStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#34d399' }}>
                <CheckCircle2 size={16} />
                <span>{t('settings.ai_status_success', 'Ключ успешно проверен и готов к работе!')}</span>
              </div>
            )}

            {aiTestStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MD3.error }}>
                <XCircle size={16} />
                <span>{aiTestError || t('settings.ai_status_error', 'Ошибка проверки ключа. Убедитесь в его правильности.')}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={handleSaveAiKey}
                aria-label={t('settings.ai_save_btn', 'Сохранить ключ')}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  backgroundColor: 'var(--accent-color, #9b7dd4)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 150ms',
                }}
              >
                {t('settings.ai_save_btn', 'Сохранить ключ')}
              </button>

              <button
                type="button"
                onClick={handleTestAiKey}
                disabled={!aiKeyInput.trim() || aiTestStatus === 'testing'}
                aria-label={t('settings.ai_test_btn', 'Проверить')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: MD3.onSurface,
                  fontSize: 13,
                  fontWeight: 600,
                  border: '1px solid var(--md-outline, rgba(255,255,255,0.14))',
                  cursor: !aiKeyInput.trim() || aiTestStatus === 'testing' ? 'not-allowed' : 'pointer',
                  opacity: !aiKeyInput.trim() || aiTestStatus === 'testing' ? 0.5 : 1,
                }}
              >
                {t('settings.ai_test_btn', 'Проверить')}
              </button>

              {aiKeyInput && (
                <button
                  type="button"
                  onClick={handleClearAiKey}
                  aria-label={t('settings.ai_clear_btn', 'Удалить')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    backgroundColor: 'rgba(255, 89, 90, 0.12)',
                    color: MD3.error,
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </Block>
      </motion.div>
    );
  };

  const renderMain = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 20px 16px',
          userSelect: 'none',
        }}
      >
        <div style={{ position: 'relative', width: '66px', height: '66px', flexShrink: 0 }}>
          <Avatar
            src={avatarUrl}
            alt={nickname || '?'}
            className="w-[66px] h-[66px] rounded-full"
            style={{ width: '66px', height: '66px' }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                fontSize: '16.5px',
                fontWeight: 700,
                color: MD3.onSurface,
                lineHeight: 1.2,
              }}
              className="truncate"
            >
              {nickname || 'User'}
            </span>
            <DeveloperBadge userId={myCode} size={28} onClick={triggerDevToast} />
          </div>

          <div
            onClick={handleCopyCode}
            style={{
              fontSize: '13.5px',
              fontWeight: 500,
              color: 'var(--accent-color, #9b7dd4)',
              wordBreak: 'break-all',
              cursor: 'pointer',
              lineHeight: 1.25,
              fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
            }}
          >
            {myCode || '------'}
          </div>
        </div>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => pushTab('qrCode')}
            aria-label={t('qrModal.title', 'Получить QR-код')}
            style={{
              background: 'transparent',
              border: 'none',
              color: MD3.onSurfaceVar,
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QrCodeMiniIcon size={20} color={MD3.onSurfaceVar} />
          </button>
        </div>
      </div>

      <Block>
        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          }
          label={t('settings.privacy')}
          onClick={() => pushTab('security')}
        />


        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          }
          label={t('settings.connection') || 'Подключение'}
          onClick={() => pushTab('connection')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: proxyEnabled ? 'var(--accent-color, #9b7dd4)' : MD3.onSurfaceVar }}>
                {proxyEnabled ? (activeProxy ? activeProxy.name : 'Включено') : 'Прямое'}
              </span>
              <ChevronRight size={16} color={MD3.onSurfaceVar} />
            </div>
          }
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M14 6.5A1.5 1.5 0 0 0 12.5 5h-2.3l.249-.374c.358-.537.549-1.17.549-1.81v-.314a2.5 2.5 0 0 0-5 0v.314c0 .645.191 1.28.549 1.81L6.796 5h-2.3a1.5 1.5 0 0 0-1.5 1.5v4.43c0 1.06-.421 2.08-1.17 2.83l-.536.536a1 1 0 0 0 .707 1.707h9c.265 0 .52-.105.707-.293l.536-.536a6 6 0 0 0 1.76-4.24v-4.43zM4 8h9V6.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5v-.197a1 1 0 0 1 .168-.555l.451-.677A2.27 2.27 0 0 0 10 2.811v-.314a1.5 1.5 0 0 0-3 0v.314c0 .448.132.885.381 1.26l.451.677c.11.164.168.357.168.555V5.5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 0-.5.5zm7 7H8.99A3.5 3.5 0 0 0 10 12.54v-.04a.5.5 0 0 0-1 0v.04c0 1.19-.841 2.22-2.01 2.45l-.04.008H2l.536-.536a4.98 4.98 0 0 0 1.46-3.534v-1.93h9v1.93c0 1.33-.527 2.6-1.46 3.54l-.536.536z" clipRule="evenodd" />
            </svg>
          }
          label={t('settings.appearance')}
          onClick={() => pushTab('chats')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          }
          label={t('settings.calls')}
          onClick={() => pushTab('calls')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.026 18.64h.011zm-.197-.124l.003-17.038l-.07.07L4.94 6.316a.7.7 0 0 1-.49.2H1.968a.65.65 0 0 0-.365.242c-.13.156-.207.388-.22.69l-.001 5.411c.01.19.074.334.203.463c.123.122.343.209.622.238h2.304c.183 0 .359.071.488.199zM10.207.019c.583.097.953.522 1.005 1.165V18.84l-.005.085c-.078.603-.462 1.032-1.067 1.074c-.451.03-.871-.137-1.252-.484L4.224 14.92l-2.082-.002c-.644-.06-1.166-.267-1.54-.64A2.04 2.04 0 0 0 0 12.896V7.42c.027-.606.2-1.12.532-1.522a2 2 0 0 1 1.27-.736l.105-.008h2.258L8.77.6c.428-.444.913-.668 1.437-.58m6.21 2.227C18.602 3.618 20 6.576 20 9.862s-1.398 6.243-3.582 7.615a.7.7 0 0 1-.955-.208a.675.675 0 0 1 .211-.94c1.754-1.102 2.943-3.618 2.943-6.467c0-2.85-1.189-5.366-2.943-6.468a.675.675 0 0 1-.211-.94a.7.7 0 0 1 .954-.208m-2.301 2.686c1.36 1.007 2.197 2.88 2.197 4.93 0 2.165-.935 4.128-2.42 5.084a.7.7 0 0 1-.957-.198a.675.675 0 0 1 .2-.943c1.068-.686 1.794-2.212 1.794-3.943 0-1.644-.654-3.108-1.645-3.841a.674.674 0 0 1-.137-.954a.7.7 0 0 1 .968-.135" />
            </svg>
          }
          label={t('common.notifications')}
          onClick={() => pushTab('notifications')}
        />

        <MenuItem
          icon={<Database size={20} color={MD3.onSurface} />}
          label={t('settings.data_memory')}
          onClick={() => pushTab('dataMemory')}
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 512 512" fill="currentColor">
              <path d="m478.33 433.6l-90-218a22 22 0 0 0-40.67 0l-90 218a22 22 0 1 0 40.67 16.79L316.66 406h102.67l18.33 44.39A22 22 0 0 0 458 464a22 22 0 0 0 20.32-30.4ZM334.83 362L368 281.65L401.17 362Zm-66.99-19.08a22 22 0 0 0-4.89-30.7c-.2-.15-15-11.13-36.49-34.73c39.65-53.68 62.11-114.75 71.27-143.49H330a22 22 0 0 0 0-44H214V70a22 22 0 0 0-44 0v20H54a22 22 0 0 0 0 44h197.25c-9.52 26.95-27.05 69.5-53.79 108.36c-31.41-41.68-43.08-68.65-43.17-68.87a22 22 0 0 0-40.58 17c.58 1.38 14.55 34.23 52.86 83.93c.92 1.19 1.83 2.35 2.74 3.51c-39.24 44.35-77.74 71.86-93.85 80.74a22 22 0 1 0 21.07 38.63c2.16-1.18 48.6-26.89 101.63-85.59c22.52 24.08 38 35.44 38.93 36.1a22 22 0 0 0 30.75-4.9Z" />
            </svg>
          }
          label={t('settings.language')}
          onClick={() => pushTab('language')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                {languageDisplayOptions.find(o => o.value === language)?.label || language || '...'}
              </span>
              <ChevronRight size={16} color={MD3.onSurfaceVar} />
            </div>
          }
        />

        <MenuItem
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          }
          label={t('settings.preferences')}
          onClick={() => pushTab('preferences')}
        />

        <MenuItem
          icon={<ShieldCheck size={20} color={MD3.onSurface} />}
          label={t('backup.menu_item')}
          onClick={() => pushTab('backup')}
        />

        <MenuItem
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 768" width="20" height="20">
              <path fill="currentColor" d="M896 128q-8 0-18-3L752 252q123 65 197.5 186t74.5 266q0 27-19 45.5T960 768H64q-26 0-45-18.5T0 704q0-145 74.5-266T272 252L146 125q-10 3-18 3q-27 0-45.5-18.5T64 64.5T83 19t45-19t45 19t19 45q0 8-3 18l144 143q88-33 179-33t179 33L835 82q-3-10-3-18q0-26 18.5-45t45-19T941 19t19 45.5t-19 45t-45 18.5M256 448q-26 0-45 19t-19 45.5t19 45t45 18.5t45-18.5t19-45t-19-45.5t-45-19m511.5 128q26.5 0 45.5-18.5t19-45t-19-45.5t-45-19t-45 19t-19 45.5t18.5 45t45 18.5"/>
            </svg>
          }
          label={t('settings.orbitos_ai')}
          onClick={() => pushTab('orbitosAi')}
          rightElement={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, color: geminiApiKey ? 'var(--accent-color, #9b7dd4)' : MD3.onSurfaceVar }}>
                {geminiApiKey ? t('settings.ai_active') : t('settings.ai_free')}
              </span>
              <ChevronRight size={16} color={MD3.onSurfaceVar} />
            </div>
          }
        />
      </Block>

      <Block>
        <MenuItem
          icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>}
          label={t('common.help')}
          onClick={() => {
            if ((window as any).orbita?.openExternal) {
              (window as any).orbita.openExternal('https://github.com/saizzi/orbita-messenger');
            }
          }}
        />
        <MenuItem
          icon={<Trash2 size={20} style={{ color: MD3.error }} />}
          label={t('common.clear_identity')}
          onClick={() => setDeleteModalOpen(true)}
        />
      </Block>

      <div style={{ padding: '0px 20px 16px', textAlign: 'center', color: MD3.onSurfaceVar, fontSize: 12, userSelect: 'none', backgroundColor: 'transparent', marginTop: '8px' }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: '0.1em', color: MD3.onSurface, marginBottom: 4 }}>
          ORBITA MESSENGER
        </div>
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {t('common.version', { version: appVersion || '0.1.996' })}
        </div>
      </div>
    </motion.div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'main':
        return renderMain();
      case 'security':
        return <PrivacySettingsScreen onOpenPassword={() => pushTab('password')} onOpenBackup={() => pushTab('backup')} />;
      case 'backup':
        return <AccountBackupScreen onBack={handleBack} />;
      case 'orbitosAi':
        return renderOrbitosAi();
      case 'password':
        return <PasswordSettingsScreen onSaved={() => pushTab('security')} />;
      case 'connection':
        return <ConnectionSettingsScreen onBack={handleBack} />;
      case 'chats':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <div style={{ marginBottom: 4 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: '0 0 8px', userSelect: 'none', padding: '0 20px' }}>{t('settings.themes')}</p>
              <SignalThemePicker activeTheme={currentTheme} onThemeChange={setTheme} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: '0 0 8px', userSelect: 'none', padding: '0 20px' }}>{t('settings.chat_color')}</p>
              <SignalChatColorPicker />
            </div>
            <SettingsRow
              label={t('settings.font')}
              onClick={() => pushTab('font')}
              right={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                    {FONT_OPTIONS.find(o => o.value === fontFamily)?.label || fontFamily}
                  </span>
                  <ChevronRight size={16} color={MD3.onSurfaceVar} />
                </div>
              }
            />
            <SettingsRow label={t('settings.bubble_radius')} />
            <BubbleRadiusControl />

          </motion.div>
        );
      case 'font':
        return renderFont();
      case 'dataMemory':
        return renderDataMemory();
      case 'energy':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <Surface style={{ marginBottom: 8 }}>
              <SettingsRow label={t('settings.battery_saver')} right={<M3Switch checked={false} onChange={() => {}} />} />
              <SettingsRow label={t('settings.background_usage')} right={<M3Switch checked={true} onChange={() => {}} />} />
              <SettingsRow label={t('settings.auto_dark')} right={<M3Switch checked={false} onChange={() => {}} />} />
            </Surface>
          </motion.div>
        );
      case 'notifications':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            {/* 1. Общие настройки */}
            <SectionHeader title={t('settings.general_settings') || 'Общие настройки'} />
            <Surface style={{ marginBottom: 4 }}>
              <SettingsRow
                label={t('settings.desktop_notifications') || 'Уведомления на рабочем столе'}
                icon={<Bell size={18} />}
                right={
                  <M3Switch
                    checked={notificationsEnabled}
                    onChange={() => setNotificationsEnabled(!notificationsEnabled)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.flash_taskbar') || 'Анимация иконки на панели задач'}
                icon={<TaskbarIcon />}
                right={
                  <M3Switch
                    checked={notificationFlashTaskbar}
                    onChange={() => setNotificationFlashTaskbar(!notificationFlashTaskbar)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.sound') || 'Звук'}
                icon={<Volume2 size={18} />}
                right={
                  <M3Switch
                    checked={notificationSoundEnabled}
                    onChange={() => setNotificationSoundEnabled(!notificationSoundEnabled)}
                  />
                }
              />
            </Surface>

            <BubbleSlider
              value={notificationVolume}
              onChangeCommitted={setNotificationVolume}
              min={0}
              max={100}
              step={1}
              label={t('settings.volume') || 'Громкость'}
              formatValue={(v) => `${Math.round(v)}%`}
              valuePlacement="right"
              ariaLabel={t('settings.volume') || 'Громкость'}
            />

            {/* Notification Preview Card */}
            <div
              style={{
                backgroundColor: 'var(--surface-container, var(--bg-secondary, #1c182a))',
                borderRadius: '0px',
                padding: '11px 38px 11px 11px',
                margin: '0 20px 14px 20px',
                minHeight: '82px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                border: 'none',
                boxShadow: 'none',
                fontFamily: 'var(--main-font), "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
              }}
            >
              {notificationShowName ? <TuxAvatar /> : <OrbitaLogoAvatar />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 600, color: 'var(--text-main, #ffffff)', lineHeight: 1.25 }}>
                  {notificationShowName ? (t('settings.preview_sender_name') || 'Saizzi') : (t('settings.hidden_name') || 'Orbita Desktop')}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim, #a89ec4)', marginTop: '2px', lineHeight: 1.35 }}>
                  {notificationShowText ? (t('settings.preview_message_text') || 'А ты любишь пингвинов?') : (t('settings.new_message') || 'Новое сообщение')}
                </div>
              </div>
            </div>

            {/* Pill Toggles for Name and Text */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', margin: '0 20px 20px 20px' }}>
              <TogglePill
                active={notificationShowName}
                label={t('settings.name') || 'Имя'}
                onClick={() => setNotificationShowName(!notificationShowName)}
              />
              <TogglePill
                active={notificationShowText}
                label={t('settings.text') || 'Текст'}
                onClick={() => setNotificationShowText(!notificationShowText)}
              />
            </div>

            {/* Separator */}
            <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.06)', margin: '4px 0 8px 0' }} />

            {/* 2. Взаимодействие с системой */}
            <SectionHeader title={t('settings.system_integration') || 'Взаимодействие с системой'} />
            <Surface style={{ marginBottom: 8 }}>
              <SettingsRow
                label={t('settings.use_windows_notifications') || 'Использовать уведомления Windows'}
                right={
                  <M3Switch
                    checked={notificationNativeWindows}
                    onChange={() => setNotificationNativeWindows(!notificationNativeWindows)}
                  />
                }
              />
              <SettingsRow
                label={t('settings.respect_focus_assist') || 'Соблюдать режим фокусирования'}
                right={
                  <M3Switch
                    checked={notificationRespectFocus}
                    onChange={() => setNotificationRespectFocus(!notificationRespectFocus)}
                  />
                }
              />
            </Surface>

            {/* Separator */}
            <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.06)', margin: '4px 0 8px 0' }} />

            {/* 3. Расположение на экране */}
            <SectionHeader title={t('settings.screen_position') || 'Расположение на экране'} />
            <div style={{ margin: '8px 0 16px 0' }}>
              <NotificationMonitor
                count={notificationCount}
                position={notificationPosition}
                onPositionChange={setNotificationPosition}
              />
            </div>

            {/* 4. Количество уведомлений */}
            <SectionHeader title={t('settings.notification_count') || 'Количество уведомлений'} />
            <div style={{ margin: '4px 0 24px 0' }}>
              <NotificationCountSelector
                count={notificationCount}
                onChange={setNotificationCount}
              />
            </div>
          </motion.div>
        );
      case 'calls':
        return renderCalls();
      case 'language':
        return renderLanguage();
      case 'preferences':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            style={{ padding: '0 0 32px' }}
          >
            <PreferencesGroup title={t('settings.system_section')}>
              <PreferenceSwitch
                label={t('settings.open_at_login')}
                checked={autoLaunch}
                onChange={async () => {
                  const nextVal = !autoLaunch;
                  setAutoLaunch(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setAutoLaunch) {
                    await window.orbita.setAutoLaunch(nextVal);
                  }
                }}
              />
              <PreferenceSwitch
                label={t('settings.hide_menu_bar')}
                checked={hideMenuBar}
                onChange={async () => {
                  const nextVal = !hideMenuBar;
                  setHideMenuBar(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setHideMenuBar) {
                    await window.orbita.setHideMenuBar(nextVal);
                  }
                }}
              />
              <PreferenceSwitch
                label={t('settings.minimize_to_tray')}
                checked={showInSystemTray}
                onChange={async () => {
                  const nextVal = !showInSystemTray;
                  setShowInSystemTray(nextVal);
                  if (typeof window !== 'undefined' && window.orbita?.setShowInSystemTray) {
                    await window.orbita.setShowInSystemTray(nextVal);
                  }
                }}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.permissions_section')}>
              <PreferenceSwitch
                label={t('settings.allow_microphone')}
                checked={hasMicrophonePermission}
                onChange={() => setMicrophonePermission(!hasMicrophonePermission)}
              />
              <PreferenceSwitch
                label={t('settings.allow_camera')}
                checked={hasCameraPermission}
                onChange={() => setCameraPermission(!hasCameraPermission)}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.updates_section')}>
              <PreferenceSwitch
                label={t('settings.auto_download_updates')}
                checked={autoUpdate}
                onChange={handleToggleAutoUpdate}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 0',
                  gap: 16,
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: MD3.onSurfaceVar }}>
                    {t('settings.current_version')}: <span style={{ fontWeight: 600, color: MD3.onSurface }}>v{appVersion || '1.0.3'}</span>
                  </div>
                  {updateStatus.status === 'checking' && (
                    <div style={{ fontSize: 12, color: MD3.primary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                      {t('settings.checking_for_updates')}
                    </div>
                  )}
                  {updateStatus.status === 'not-available' && (
                    <div style={{ fontSize: 12, color: '#23a559', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={13} />
                      {t('settings.update_not_available')}
                    </div>
                  )}
                  {updateStatus.status === 'available' && (
                    <div style={{ fontSize: 12, color: MD3.primary, marginTop: 4 }}>
                      {t('settings.update_available')}{updateStatus.version ? ` v${updateStatus.version}` : ''}
                    </div>
                  )}
                  {updateStatus.status === 'downloading' && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('settings.update_downloading')}</span>
                        <span>{updateStatus.percent || 0}%</span>
                      </div>
                      <div style={{ width: '100%', height: 4, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 2, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${updateStatus.percent || 0}%`,
                            height: '100%',
                            backgroundColor: MD3.primary,
                            borderRadius: 2,
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {updateStatus.status === 'downloaded' && (
                    <div style={{ fontSize: 12, color: '#23a559', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} />
                      {t('settings.update_downloaded')}
                    </div>
                  )}
                  {updateStatus.status === 'dev-mode' && (
                    <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 4 }}>
                      {t('settings.update_dev_mode')}
                    </div>
                  )}
                  {updateStatus.status === 'error' && (
                    <div style={{ fontSize: 12, color: '#e55353', marginTop: 4 }}>
                      {t('settings.update_error')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {updateStatus.status === 'downloaded' ? (
                    <button
                      type="button"
                      onClick={handleRestartAndInstall}
                      aria-label={t('settings.restart_and_install')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.primary,
                        color: '#ffffff',
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <Check size={14} />
                      {t('settings.restart_and_install')}
                    </button>
                  ) : updateStatus.status === 'available' && !autoUpdate ? (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      aria-label={t('settings.download_update')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.primary,
                        color: '#ffffff',
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <Download size={14} />
                      {t('settings.download_update')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isCheckingUpdate || updateStatus.status === 'downloading'}
                      onClick={handleCheckForUpdates}
                      aria-label={t('settings.check_for_updates')}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        backgroundColor: MD3.surfaceVar,
                        color: MD3.onSurface,
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: 'none',
                        cursor: isCheckingUpdate || updateStatus.status === 'downloading' ? 'default' : 'pointer',
                        outline: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: isCheckingUpdate || updateStatus.status === 'downloading' ? 0.6 : 1,
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isCheckingUpdate && updateStatus.status !== 'downloading') {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = MD3.surfaceVar;
                      }}
                    >
                      <RefreshCw
                        size={13}
                        style={{
                          transform: isCheckingUpdate ? 'rotate(360deg)' : 'none',
                          transition: isCheckingUpdate ? 'transform 1s linear infinite' : 'none',
                        }}
                      />
                      {t('settings.check_for_updates')}
                    </button>
                  )}
                </div>
              </div>
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.voice_section')}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 0',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: MD3.onSurface }}>
                    {t('settings.noise_suppression_title')}
                  </div>
                  <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2, lineHeight: 1.4 }}>
                    {noiseSuppressionMode === 'krisp'
                      ? t('settings.noise_suppression_krisp_desc')
                      : noiseSuppressionMode === 'standard'
                      ? t('settings.noise_suppression_standard_desc')
                      : t('settings.noise_suppression_none_desc')}
                  </div>
                </div>

                <OrbitaSelect
                  value={noiseSuppressionMode || (noiseSuppression ? 'standard' : 'none')}
                  onChange={(val) => {
                    const mode = val as any;
                    setNoiseSuppressionMode(mode);
                    liveKitService.updateAudioConstraints().catch(() => {});
                  }}
                  ariaLabel={t('settings.noise_suppression_title')}
                  minWidth={150}
                  options={[
                    { value: 'krisp', label: t('settings.noise_suppression_krisp') },
                    { value: 'standard', label: t('settings.noise_suppression_standard') },
                    { value: 'none', label: t('settings.noise_suppression_none') },
                  ]}
                />
              </div>
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.preferences_hotkeys')}>
              <HotkeySwitch
                enterLabel={t('settings.preferences_send_enter')}
                shiftEnterLabel={t('settings.preferences_send_shift_enter')}
                sendOnEnter={sendOnEnter}
                onChange={(value) => setSendOnEnter(value)}
              />
            </PreferencesGroup>
          </motion.div>
        );
      case 'qrCode':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <QrCodeView userId={myCode} avatarUrl={avatarUrl} nickname={nickname} />
          </motion.div>
        );
      default:
        return null;
    }
  };

  const isOnMain = activeTab === 'main';
  const getHeaderTitle = () => {
    if (isOnMain) return t('settings.title');
    return tabTitles[activeTab] ?? '';
  };
  const handleBack = () => popTab();

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AnimatePresence>
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: isMobileWidth ? 'block' : 'flex',
          alignItems: isMobileWidth ? 'stretch' : 'flex-start',
          justifyContent: isMobileWidth ? 'stretch' : 'center',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          border: 'none',
          padding: isMobileWidth ? '0' : 'min(7.5vh, 64px) 16px 16px',
          userSelect: 'none',
        }}
        onClick={() => setCurrentView('chats')}
      >
        <motion.div
          initial={{
            opacity: 1,
            scale: 1,
            height: isMobileWidth ? 'calc(100vh - 30px)' : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900),
          }}
          animate={{
            opacity: 1,
            scale: 1,
            height: isMobileWidth
              ? 'calc(100vh - 30px)'
              : targetHeight !== null
              ? Math.min(targetHeight, typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900)
              : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 900) : 900),
          }}
          transition={{
            height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
            opacity: { duration: 0 },
            scale: { duration: 0 },
          }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: isMobileWidth ? '100vw' : '400px',
            maxHeight: isMobileWidth ? 'calc(100vh - 30px)' : 'min(90vh, 900px)',
            display: 'flex',
            flexDirection: 'column',
            margin: isMobileWidth ? '0' : '0 16px',
            marginTop: isMobileWidth ? '30px' : '0',
            backgroundColor: MD3.bg,
            borderRadius: isMobileWidth ? 0 : 10,
            color: MD3.onSurface,
            boxShadow: isMobileWidth ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              padding: '16px 20px',
              backgroundColor: MD3.bg,
              flexShrink: 0,
              userSelect: 'none',
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              {activeTab !== 'main' && (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label={t('common.back', 'Назад')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: MD3.onSurfaceVar,
                    cursor: 'pointer',
                    padding: '4px',
                    transition: 'color 150ms',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = MD3.primary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = MD3.onSurfaceVar)}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 22L6 12L16 2l1.775 1.775L9.55 12l8.225 8.225z" />
                  </svg>
                </button>
              )}
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: MD3.onSurface,
                  margin: 0,
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {getHeaderTitle()}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeTab === 'main' && (
                <button
                  type="button"
                  onClick={() => setNicknameEditOpen(true)}
                  aria-label={t('settings.edit_nickname_title', 'Изменить имя')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: MD3.onSurfaceVar,
                    cursor: 'pointer',
                    padding: '4px',
                    transition: 'color 150ms',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = MD3.primary)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = MD3.onSurfaceVar)}
                >
                  <svg width="18" height="18" viewBox="0 0 64 64" fill="currentColor">
                    <path d="M61.2 13c-3.2-3.4-6.6-6.8-10-10.1c-.7-.7-1.5-1.1-2.4-1.1s-1.8.3-2.4 1L8.7 40.2c-.6.6-1 1.3-1.3 2L1.9 59c-.3.8-.1 1.6.3 2.2c.5.6 1.2 1 2.1 1h.4l17.1-5.7c.8-.3 1.5-.7 2-1.3l37.5-37.4c.6-.6 1-1.5 1-2.4s-.4-1.7-1.1-2.4M20.6 52.1c-.1.1-.2.1-.3.2L7.4 56.6l4.3-12.9c0-.1.1-.2.2-.3L39.4 16l8.7 8.7zm30.6-30.6l-8.7-8.7l6.1-6.1c2.9 2.8 5.8 5.8 8.6 8.7z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setCurrentView('chats')}
                aria-label={t('common.close', 'Закрыть')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: MD3.onSurfaceVar,
                  cursor: 'pointer',
                  padding: '4px',
                  transition: 'color 150ms',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = MD3.primary)}
                onMouseLeave={(e) => (e.currentTarget.style.color = MD3.onSurfaceVar)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                  <path fill="currentColor" d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12L4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586z" />
                </svg>
              </button>
            </div>
          </div>
          
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onMouseMove={triggerSettingsActive}
            onMouseEnter={triggerSettingsActive}
            onMouseLeave={handleSettingsMouseLeave}
          >
            <div
              ref={settingsScrollRef}
              onScroll={triggerSettingsActive}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '0 0 8px',
              }}
              className="chat-list-scrollbar"
            >
              <div ref={innerContentRef} style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                <motion.div key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
                  {renderContent()}
                </motion.div>
              </div>
            </div>

            {settingsThumb && (
              <>
                <div
                  className="overlay-scroll-track"
                  onMouseDown={(e) => handleScrollbarTrackMouseDown(e, settingsScrollRef.current)}
                  style={{
                    top: '6px',
                    bottom: '6px',
                    opacity: isSettingsActive ? 1 : 0,
                  }}
                />
                <div
                  className="overlay-scroll-thumb"
                  onMouseDown={(e) => handleScrollbarThumbMouseDown(e, settingsScrollRef.current)}
                  style={{
                    top: settingsThumb.top + 6,
                    height: settingsThumb.height,
                    opacity: isSettingsActive ? 1 : 0,
                  }}
                />
              </>
            )}
          </div>

          <DeveloperToast isOpen={devToastOpen} nickname={nickname || 'User'} />
          <LinkCopiedToast isOpen={copyToastOpen} />
        </motion.div>
      </motion.div>
      </AnimatePresence>

      <NicknameEditModal open={nicknameEditOpen} onClose={() => setNicknameEditOpen(false)} currentNickname={nickname || ''} onSave={handleNicknameSave} />
      <DeleteAccountModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={() => {
          deleteAccount();
          resetChats();
          setCurrentView('chats');
          setDeleteModalOpen(false);
        }}
      />
  </>
);
};