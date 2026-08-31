import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Trash2, Database, ChevronRight, Eye, EyeOff, CheckCircle2, XCircle, Bell } from 'lucide-react';
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
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { DeleteAccountModal } from '../common/DeleteAccountModal';
import { ConnectionSettingsScreen } from '../settings/ConnectionSettingsScreen';
import { useConnectionStore } from '../../store/useConnectionStore';
import { DeveloperBadge, DeveloperToast } from '../ui/DeveloperBadge';
import { LinkCopiedToast } from '../common/LinkCopiedToast';
import { QrCodeView } from './QrCodeView';
import { getInviteLink } from '../../utils/inviteLink';
import { themePalettes, type ThemeDefinition, type ThemeId } from '../../theme';

const QrCodeMiniIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
    <path fill={color} d="M5 11h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm0 16h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm8-10v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2m6 4h-4V5h4zm2 11.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5m-8-7v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m3.5 1.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5M13 17.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m2.5 3.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m2-2h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m1-6h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5m1 4h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5"/>
  </svg>
);

const MD3 = {
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
    background: rgba(255, 255, 255, 0.08);
    border: 2px solid rgba(255, 255, 255, 0.25);
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
      backgroundColor: checked ? 'var(--accent-color, #7C3AED)' : 'rgba(255,255,255,0.12)',
      boxShadow: checked ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,0.25)',
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
        backgroundColor: 'var(--bg-primary, #14111d)',
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

const PrivacySettingsScreen = ({ onOpenPassword }: { onOpenPassword: () => void }) => {
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
  } = useChatStore();

  const [isPasswordSet, setIsPasswordSet] = useState(() => securityService.isPasswordSet());

  useEffect(() => {
    setIsPasswordSet(securityService.isPasswordSet());
  }, []);

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

const themes: ThemeDefinition[] = Object.values(themePalettes);

interface ThemeCardProps {
  theme: ThemeDefinition;
  isActive: boolean;
  onClick: () => void;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ theme, isActive, onClick }) => {
  const { preview } = theme;
  const outBubbleBg = theme.isLight ? preview.accent : preview.accent;
  const inBubbleBg = theme.isLight
    ? `color-mix(in srgb, ${preview.accent} 15%, ${preview.bg})`
    : preview.surface;
  const ringColor = preview.accent;

  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: 72,
          height: 96,
          borderRadius: 0,
          backgroundColor: preview.bg,
          border: isActive
            ? `2.5px solid ${ringColor}`
            : `2px solid ${theme.isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '10px 0 10px 0',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
          transition: 'border-color 0.18s, transform 0.14s',
          transform: isActive ? 'scale(1.05)' : 'scale(1)',
          boxShadow: isActive
            ? `0 0 0 1px ${ringColor}40, 0 4px 16px ${ringColor}30`
            : '0 2px 8px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '0 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                width: 36,
                height: 16,
                borderRadius: 0,
                backgroundColor: outBubbleBg,
                opacity: 0.92,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                width: 36,
                height: 16,
                borderRadius: 0,
                backgroundColor: inBubbleBg,
                border: `1px solid ${theme.isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`,
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: `2px solid ${preview.accent}`,
              backgroundColor: isActive ? preview.accent : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.18s',
              flexShrink: 0,
            }}
          >
            {isActive && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path
                  d="M1 4L3.5 6.5L9 1"
                  stroke={theme.isLight ? '#fff' : preview.bg}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

const ThemePicker: React.FC<{ activeTheme?: ThemeId; onThemeChange?: (id: ThemeId) => void }> = ({
  activeTheme = 'orbita',
  onThemeChange,
}) => {
  const [selected, setSelected] = useState<ThemeId>(activeTheme);

  const handleSelect = (id: ThemeId) => {
    setSelected(id);
    onThemeChange?.(id);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: 12,
        padding: '8px 4px 12px',
        userSelect: 'none',
      }}
    >
      {themes.map((theme) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          isActive={selected === theme.id}
          onClick={() => handleSelect(theme.id)}
        />
      ))}
    </div>
  );
};

const BubbleRadiusPreview = ({ radius }: { radius: number }) => {
  const ownBubbleStyle: React.CSSProperties = {
    padding: '6px 12px 6px 10px',
    borderRadius: radius,
    backgroundColor: 'color-mix(in srgb, var(--md-sys-color-primary) 20%, transparent)',
    border: 'none',
    color: 'var(--text-main)',
    fontSize: '12px',
    maxWidth: 'min(480px, 75%)',
    alignSelf: 'flex-end',
    marginBottom: 8,
    wordBreak: 'break-word',
    position: 'relative',
  };

  const otherBubbleStyle: React.CSSProperties = {
    padding: '6px 12px 6px 10px',
    borderRadius: radius,
    backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
    border: 'none',
    color: 'var(--text-main)',
    fontSize: '12px',
    maxWidth: 'min(480px, 75%)',
    alignSelf: 'flex-start',
    marginBottom: 8,
    wordBreak: 'break-word',
    position: 'relative',
  };

  const timeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    float: 'right',
    marginLeft: '12px',
    fontSize: '10px',
    color: 'var(--text-dim)',
    lineHeight: 1,
    position: 'relative',
    top: '2px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 20px', gap: 4, backgroundColor: 'var(--md-surface)', marginTop: 12 }}>
      <div style={otherBubbleStyle}>
        Привет! Как дела?
        <span style={timeStyle}>12:34</span>
      </div>
      <div style={ownBubbleStyle}>
        Всё отлично, спасибо!
        <span style={timeStyle}>
          12:35
          <MessageStatus status="read" />
        </span>
      </div>
    </div>
  );
};

const BubbleSlider = ({
  value,
  onChange,
  min,
  max,
  step,
  label,
  valueDisplay,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  label?: string;
  valueDisplay?: string;
}) => {
  const fillPercent = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ padding: '0 20px', marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, userSelect: 'none' }}>
        {label && <span style={{ fontSize: 12, color: MD3.onSurfaceVar }}>{label}</span>}
        {valueDisplay && <span style={{ fontSize: 12, fontWeight: 600, color: MD3.onSurface }}>{valueDisplay}</span>}
      </div>
      <div style={{ position: 'relative', height: 4, borderRadius: 2, backgroundColor: 'rgba(197,180,227,0.08)', marginBottom: 6 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPercent}%`, borderRadius: 2, backgroundColor: MD3.primary, transition: 'width 0.05s' }} />
        <div
          style={{
            position: 'absolute',
            left: `calc(${fillPercent}% - 4px)`,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: MD3.primary,
            boxShadow: '0 0 4px rgba(197,180,227,0.6)',
            transition: 'left 0.05s',
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: -22, position: 'relative', zIndex: 1, opacity: 0, cursor: 'pointer', height: 24, display: 'block' }}
      />
    </div>
  );
};

interface AppIcon {
  id: string;
  name: string;
  src: string;
}

const DEFAULT_ICONS: AppIcon[] = [
  { id: 'orbita1', name: 'Orbita 1', src: 'orbita1.png' },
  { id: 'orbita4', name: 'Orbita 4', src: 'orbita4.png' },
];

interface AppIconPickerProps {
  icons?: AppIcon[];
  activeIconId?: string;
  onIconChange?: (id: string) => void;
}

const AppIconPicker: React.FC<AppIconPickerProps> = ({
  icons = DEFAULT_ICONS,
  activeIconId,
  onIconChange,
}) => {
  const [selected, setSelected] = useState<string>(activeIconId ?? icons[0]?.id ?? '');

  const handleSelect = (id: string) => {
    setSelected(id);
    onIconChange?.(id);
  };

  return (
    <div style={{ display: 'inline-block', width: '100%', userSelect: 'none', padding: '0 20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
          gap: 16,
        }}
      >
        {icons.map((icon) => {
          const isActive = selected === icon.id;
          return (
            <button
              key={icon.id}
              onClick={() => handleSelect(icon.id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 60,
                height: 60,
                borderRadius: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isActive
                  ? 'rgba(255, 255, 255, 0.10)'
                  : 'transparent',
                transition: 'background-color 0.15s ease',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative',
              }}
            >
              <img
                src={icon.src}
                alt={icon.name}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  objectFit: 'cover',
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </div>
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
  description: string;
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
      <div style={{ fontSize: 12, color: MD3.onSurfaceVar, marginTop: 2 }}>{description}</div>
    </div>
    <M3Switch checked={checked} onChange={onChange} />
  </div>
);

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

type TabId = 'main' | 'security' | 'connection' | 'chats' | 'font' | 'dataMemory' | 'energy' | 'notifications' | 'language' | 'preferences' | 'password' | 'qrCode';

export const SettingsScreen = () => {
  const { t } = useTranslation();
  const {
    setTheme, currentTheme,
    fontFamily, setFontFamily,
    language, setLanguage,
    notificationCount, setNotificationCount,
    notificationPosition, setNotificationPosition,
    bubbleRadius, setBubbleRadius,
    notificationSoundEnabled, setNotificationSoundEnabled,
    notificationsEnabled, setNotificationsEnabled,
    notificationFlashTaskbar, setNotificationFlashTaskbar,
    notificationVolume, setNotificationVolume,
    notificationShowName, setNotificationShowName,
    notificationShowText, setNotificationShowText,
    notificationNativeWindows, setNotificationNativeWindows,
    notificationRespectFocus, setNotificationRespectFocus,
    appIcon, setAppIcon,
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
    noiseSuppressionVoice, setNoiseSuppressionVoice,
    noiseSuppressionCalls, setNoiseSuppressionCalls,
  } = useChatStore();
  const { nickname, avatarUrl, setNickname } = useAuthStore();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);
  const resetChats = useChatStore((state) => state.resetChats);
  const setCurrentView = useChatStore((state) => state.setCurrentView);
  const { appVersion } = useDeviceStore();
  const { proxyEnabled, activeProxyId, proxies } = useConnectionStore();
  const activeProxy = proxies.find((p) => p.id === activeProxyId);

  const [isMobileWidth, setIsMobileWidth] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth < 650 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobileWidth(window.innerWidth < 650);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const initialSettingsTab = useChatStore((s) => s.initialSettingsTab) as TabId | undefined;
  const [tabStack, setTabStack] = useState<TabId[]>(() => [initialSettingsTab || 'main']);
  const activeTab = tabStack[tabStack.length - 1];

  useEffect(() => {
    if (initialSettingsTab) {
      setTabStack([initialSettingsTab]);
    }
  }, [initialSettingsTab]);

  const pushTab = (tab: TabId) => setTabStack(prev => [...prev, tab]);
  const popTab = () => setTabStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);

  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);

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

  const [cacheStats, setCacheStats] = useState<{
    totalCount: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const loadCacheStats = useCallback(async () => {
    if (typeof window === 'undefined' || !window.orbita?.mediaDetailedStats) return;
    setIsLoadingStats(true);
    try {
      const stats = await window.orbita.mediaDetailedStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('Failed to load cache stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'dataMemory') {
      loadCacheStats();
    }
  }, [activeTab, loadCacheStats]);

  const handleClearAll = async () => {
    if (typeof window === 'undefined' || !window.orbita?.mediaClear) return;
    setIsClearing(true);
    try {
      await window.orbita.mediaClear();
      await loadCacheStats();
    } catch (err) {
      console.error('Failed to clear cache:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleCacheSizeLimitChange = async (value: number) => {
    setCacheSizeLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('total', value);
      await loadCacheStats();
    }
  };

  const handleMediaCacheLimitChange = async (value: number) => {
    setMediaCacheLimit(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaSetLimit) {
      await window.orbita.mediaSetLimit('media', value);
      await loadCacheStats();
    }
  };

  const handleCacheCleanupAgeChange = async (value: number) => {
    setCacheCleanupAge(value);
    if (typeof window !== 'undefined' && window.orbita?.mediaEvictByAge) {
      await window.orbita.mediaEvictByAge(value);
      await loadCacheStats();
    }
  };

  const tabTitles: Record<string, string> = {
    security:      t('settings.privacy'),
    password:      securityService.isPasswordSet() ? t('security.modal_title_change') : t('security.modal_title_set'),
    connection:    t('settings.connection'),
    chats:         t('settings.appearance'),
    font:          t('settings.font'),
    dataMemory:    t('settings.data_memory'),
    energy:        t('settings.energy'),
    notifications: t('settings.notifications_and_sounds') || 'Уведомления и звуки',
    language:      t('settings.language'),
    preferences:   t('settings.preferences'),
    qrCode:        t('qrModal.title', 'Получить QR-код'),
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
    const currentNickname = useAuthStore.getState().nickname;
    const currentAvatar = useAuthStore.getState().avatarUrl;
    const myCode = useChatStore.getState().myCode;
    const finalNickname = updates.nickname !== undefined ? updates.nickname : currentNickname;
    const finalAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : currentAvatar;

    const payload = {
      type: 'profile-update',
      sender: finalNickname,
      senderCode: myCode,
      senderId: myCode,
      avatarUrl: finalAvatar,
      nickname: finalNickname,
    };

    const chats = useChatStore.getState().chats;
    chats.forEach((chat) => {
      if (chat.type === 'private' && chat.id !== 'notes') {
        ablyService.sendMessage(chat.id, payload).catch(() => {});
        const pusher = getPusher();
        const channel = pusher.subscribe(`private-chat-${chat.id}`);
        const send = () => {
          channel.trigger('client-message', payload);
        };
        if (channel.subscribed) send();
        else channel.bind('pusher:subscription_succeeded', send);
      }
    });
  }, []);

  const handleAppIconChange = (iconId: string) => {
    setAppIcon(iconId as any);
    if ((window as any).orbita?.setAppIcon) {
      (window as any).orbita.setAppIcon(iconId);
    }
    if ((window as any).orbita?.setNotificationIcon) {
      (window as any).orbita.setNotificationIcon(iconId);
    }
  };

  const handleNicknameSave = (newNickname: string) => {
    setNickname(newNickname);
    sendProfileUpdate({ nickname: newNickname });
  };


  const renderDataMemory = () => {
    const totalSizeMB = cacheStats ? (cacheStats.totalSize / (1024 * 1024)) : 0;
    const totalSizeDisplay = totalSizeMB >= 1024 ? `${(totalSizeMB / 1024).toFixed(1)} GB` : `${totalSizeMB.toFixed(1)} MB`;

    const totalDisplay = (v: number) => {
      if (v >= 1024) return `${(v / 1024).toFixed(0)} GB`;
      return `${v} MB`;
    };
    const mediaDisplay = (v: number) => {
      if (v >= 1024) return `${(v / 1024).toFixed(0)} GB`;
      return `${v} MB`;
    };
    const ageDisplay = (v: number) => {
      if (v === 0) return t('settings.never');
      const days = Math.floor(v / (24 * 60 * 60 * 1000));
      if (days === 7) return t('settings.one_week');
      if (days === 14) return t('settings.two_weeks');
      if (days === 30) return t('settings.one_month');
      if (days === 60) return t('settings.two_months');
      if (days === 90) return t('settings.three_months');
      return `${days} ${t('common.days')}`;
    };

    const formatSize = (bytes: number) => {
      if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${bytes} B`;
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
            {t('settings.storage_used')}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: MD3.onSurface }}>
                {isLoadingStats ? t('common.loading') : totalSizeDisplay}
              </div>
              <div style={{ fontSize: 12, color: MD3.onSurfaceVar }}>
                {t('settings.total_cache', { count: cacheStats?.totalCount || 0 })}
              </div>
            </div>
            <button
              onClick={handleClearAll}
              disabled={isClearing || isLoadingStats}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: 'none',
                backgroundColor: 'rgba(242,184,181,.12)',
                color: MD3.error,
                fontSize: 13,
                fontWeight: 600,
                cursor: isClearing ? 'not-allowed' : 'pointer',
                opacity: isClearing ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {isClearing ? t('common.clearing') : t('common.clear_all')}
            </button>
          </div>
        </div>

        {cacheStats?.byType && Object.keys(cacheStats.byType).length > 0 && (
          <div style={{ marginBottom: 24, padding: '0 20px' }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: MD3.onSurfaceVar,
              letterSpacing: '0.05em',
              marginBottom: 8,
            }}>
              {t('settings.breakdown')}
            </div>
            <div style={{
              backgroundColor: MD3.surface,
              borderRadius: 0,
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {Object.entries(cacheStats.byType || {}).map(([mime, { count, size }]) => {
                let label = mime;
                if (mime.startsWith('image/')) label = t('settings.photos');
                else if (mime.startsWith('video/')) label = t('settings.videos');
                else if (mime.startsWith('audio/')) label = t('settings.audio');
                else label = t('settings.other');
                return (
                  <div key={mime} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MD3.onSurface }}>
                    <span>{label} ({count})</span>
                    <span>{formatSize(size)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: MD3.onSurfaceVar,
            letterSpacing: '0.05em',
            padding: '0 20px',
            marginBottom: 8,
          }}>
            {t('settings.cache_limits')}
          </div>
          <div style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '16px 0',
            margin: '0',
          }}>
            <BubbleSlider
              value={cacheSizeLimit}
              onChange={handleCacheSizeLimitChange}
              min={100 * 1024 * 1024}
              max={10 * 1024 * 1024 * 1024}
              step={100 * 1024 * 1024}
              label={t('settings.total_cache_limit')}
              valueDisplay={totalDisplay(cacheSizeLimit / (1024 * 1024))}
            />
            <BubbleSlider
              value={mediaCacheLimit}
              onChange={handleMediaCacheLimitChange}
              min={100 * 1024 * 1024}
              max={8 * 1024 * 1024 * 1024}
              step={100 * 1024 * 1024}
              label={t('settings.media_cache_limit')}
              valueDisplay={mediaDisplay(mediaCacheLimit / (1024 * 1024))}
            />
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
            {t('settings.cache_cleanup')}
          </div>
          <div style={{
            backgroundColor: MD3.surface,
            borderRadius: 0,
            padding: '16px 0',
            margin: '0',
          }}>
            <BubbleSlider
              value={cacheCleanupAge}
              onChange={handleCacheCleanupAgeChange}
              min={0}
              max={90 * 24 * 60 * 60 * 1000}
              step={7 * 24 * 60 * 60 * 1000}
              label={t('settings.cache_cleanup_age')}
              valueDisplay={ageDisplay(cacheCleanupAge)}
            />
            <div style={{ padding: '8px 20px 0' }}>
              <PreferenceSwitch
                label={t('settings.auto_load_media') || 'Загружать медиафайлы автоматически'}
                description={t('settings.auto_load_media_desc') || 'Автоматически загружать медиафайлы при открытии чата. Если выключено, файлы загружаются только по клику.'}
                checked={autoLoadMedia}
                onChange={() => setAutoLoadMedia(!autoLoadMedia)}
              />
            </div>
          </div>
        </div>
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
        return <PrivacySettingsScreen onOpenPassword={() => pushTab('password')} />;
      case 'password':
        return <PasswordSettingsScreen onSaved={() => pushTab('security')} />;
      case 'connection':
        return <ConnectionSettingsScreen onBack={handleBack} />;
      case 'chats':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: '0 0 8px', userSelect: 'none', padding: '0 20px' }}>{t('settings.themes')}</p>
              <ThemePicker activeTheme={currentTheme} onThemeChange={setTheme} />
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
            <BubbleSlider value={bubbleRadius} onChange={setBubbleRadius} min={4} max={16} step={1} />
            <BubbleRadiusPreview radius={bubbleRadius} />
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: MD3.onSurface, margin: '0 0 8px', userSelect: 'none', padding: '0 20px' }}>{t('settings.app_icon')}</p>
              <AppIconPicker activeIconId={appIcon} onIconChange={handleAppIconChange} />
            </div>
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

            {/* Громкость Slider */}
            <div style={{ padding: '0 20px 14px 20px', userSelect: 'none' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--accent-color, #9b7dd4)',
                  marginBottom: '10px',
                }}
              >
                {t('settings.volume') || 'Громкость'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={notificationVolume}
                  onChange={(e) => setNotificationVolume(Number(e.target.value))}
                  style={{
                    flex: 1,
                    height: '4px',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    borderRadius: '2px',
                    background: `linear-gradient(to right, var(--accent-color, #9b7dd4) ${notificationVolume}%, rgba(255, 255, 255, 0.12) ${notificationVolume}%)`,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--accent-color, #9b7dd4)',
                    minWidth: '40px',
                    textAlign: 'right',
                  }}
                >
                  {notificationVolume}%
                </span>
              </div>
            </div>

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
            <PreferencesGroup title={t('settings.preferences_updates')}>
              <PreferenceSwitch
                label={t('settings.preferences_auto_update')}
                description={t('settings.preferences_auto_update_desc')}
                checked={autoUpdate}
                onChange={() => setAutoUpdate(!autoUpdate)}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.preferences_system_integration')}>
              <PreferenceSwitch
                label={t('settings.preferences_show_tray')}
                description={t('settings.preferences_show_tray_desc')}
                checked={showInSystemTray}
                onChange={() => setShowInSystemTray(!showInSystemTray)}
              />
              <PreferenceSwitch
                label={t('settings.preferences_auto_launch')}
                description={t('settings.preferences_auto_launch_desc')}
                checked={autoLaunch}
                onChange={() => setAutoLaunch(!autoLaunch)}
              />
            </PreferencesGroup>

            <PreferencesGroup title={t('settings.preferences_noise_suppression')}>
              <PreferenceSwitch
                label={t('settings.noise_suppression_voice_title')}
                description={t('settings.noise_suppression_voice_desc')}
                checked={noiseSuppressionVoice}
                onChange={() => setNoiseSuppressionVoice(!noiseSuppressionVoice)}
              />
              <PreferenceSwitch
                label={t('settings.noise_suppression_calls_title')}
                description={t('settings.noise_suppression_calls_desc')}
                checked={noiseSuppressionCalls}
                onChange={() => {
                  const nextVal = !noiseSuppressionCalls;
                  setNoiseSuppressionCalls(nextVal);
                  liveKitService.updateAudioConstraints().catch(() => {});
                }}
              />
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