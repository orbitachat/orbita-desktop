import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';
import { DeveloperBadge, DeveloperToast } from '../ui/DeveloperBadge';
import { LinkCopiedToast } from '../common/LinkCopiedToast';
import { NicknameEditModal } from './SettingsScreen';
import { EmojiAvatarModal } from '../settings/EmojiAvatarModal';
import { AvatarCropperModal } from '../settings/AvatarCropperModal';
import { TelegramMediaViewer } from './TelegramMediaViewer';
import { QrCodeView } from './QrCodeView';
import { ablyService } from '../../services/ablyService';
import { getPusher } from '../../utils/pusher';
import { getInviteLink } from '../../utils/inviteLink';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { mediaManager } from '../../services/mediaManager';
import { supabaseService } from '../../services/supabaseService';

const sendProfileUpdate = (updates: { avatarUrl?: string | null; nickname?: string; hideProfileId?: boolean }) => {
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
    senderCode: finalHideProfileId ? null : myCode,
    senderId: finalHideProfileId ? null : myCode,
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
      supabaseService.saveProfileUpdate(chat.id, finalNickname, finalAvatar, finalHideProfileId ? null : myCode, finalHideProfileId).catch(() => {});
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

const QrCodeMiniIcon: React.FC<{ size?: number; color?: string }> = ({ size = 20, color = 'currentColor' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
    <path fill={color} d="M5 11h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm0 16h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm8-10v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2m6 4h-4V5h4zm2 11.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5m-8-7v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m3.5 1.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5M13 17.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m2.5 3.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m2-2h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m1-6h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5m1 4h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5"/>
  </svg>
);

interface MyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMobileView?: boolean;
}

export const MyProfileModal: React.FC<MyProfileModalProps> = memo(({ isOpen, onClose, isMobileView = false }) => {
  const { t } = useTranslation();
  const { nickname, avatarUrl, setNickname, setAvatarUrl } = useAuthStore();
  const myCode = useChatStore((s) => s.myCode);
  const hideProfileId = useChatStore((s) => s.hideProfileId);
  const [copyToastOpen, setCopyToastOpen] = useState(false);
  const [devToastOpen, setDevToastOpen] = useState(false);
  const [nicknameEditOpen, setNicknameEditOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [emojiModalOpen, setEmojiModalOpen] = useState(false);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const [isAvatarViewerOpen, setIsAvatarViewerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'main' | 'qrCode'>('main');
  const cameraBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTargetHeight(null);
      setAvatarMenuOpen(false);
      setActiveSection('main');
      return;
    }
    if (isMobileView) return;

    const measure = () => {
      if (innerContentRef.current) {
        const measured = innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight;
        if (measured > 0) {
          const headerH = activeSection === 'qrCode' ? 56 : 0;
          setTargetHeight(measured + headerH);
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
  }, [isOpen, isMobileView, activeSection]);

  const modalScrollRef = useRef<HTMLDivElement>(null);
  const [modalThumb, setModalThumb] = useState<{ top: number; height: number } | null>(null);
  const [isModalActive, setIsModalActive] = useState(false);
  const modalActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateModalThumb = useCallback(() => {
    const el = modalScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 8) {
      setModalThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setModalThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerModalActive = useCallback(() => {
    updateModalThumb();
    const el = modalScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsModalActive(true);
      if (modalActiveTimerRef.current) clearTimeout(modalActiveTimerRef.current);
      modalActiveTimerRef.current = setTimeout(() => {
        setIsModalActive(false);
      }, 1000);
    } else {
      setIsModalActive(false);
    }
  }, [updateModalThumb]);

  const handleModalMouseLeave = useCallback(() => {
    if (modalActiveTimerRef.current) clearTimeout(modalActiveTimerRef.current);
    setIsModalActive(false);
  }, []);

  useEffect(() => {
    updateModalThumb();
  }, [activeSection, updateModalThumb]);

  useEffect(() => {
    const el = modalScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateModalThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateModalThumb]);

  const triggerDevToast = useCallback(() => {
    setDevToastOpen(true);
    setTimeout(() => setDevToastOpen(false), 3000);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (myCode) {
      const link = getInviteLink(myCode);
      navigator.clipboard.writeText(link);
    }
    setCopyToastOpen(true);
    setTimeout(() => setCopyToastOpen(false), 2000);
  }, [myCode]);

  const handleSaveNickname = useCallback((newNick: string) => {
    setNickname(newNick);
    sendProfileUpdate({ nickname: newNick });
  }, [setNickname]);

  const handleToggleAvatarMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cameraBtnRef.current) {
      const rect = cameraBtnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.top - 12,
        left: rect.right + 12,
      });
    }
    setAvatarMenuOpen((prev) => !prev);
  };

  const handleAvatarSave = async (dataUrl: string) => {
    try {
      setAvatarUrl(dataUrl);
      let finalUrl = dataUrl;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      try {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const avatarBlob = new Blob([bytes], { type: 'image/png' });
        mediaManager.setDirectDecryptedMedia(dataUrl, '', avatarBlob, 'image/png');
      } catch {}

      if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
        const tempPath = await window.orbita.writeTempFile(base64, 'png');
        if (tempPath) {
          const publicId = `avatar_${Date.now()}`;
          const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
          if (result.success && result.secure_url) {
            finalUrl = result.secure_url;
            try {
              const binaryStr = atob(base64);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const avatarBlob = new Blob([bytes], { type: 'image/png' });
              mediaManager.setDirectDecryptedMedia(finalUrl, '', avatarBlob, 'image/png');
            } catch {}
            setAvatarUrl(finalUrl);
          }
          await window.orbita.deleteTempFile(tempPath);
        }
      }

      sendProfileUpdate({ avatarUrl: finalUrl });
    } catch (err) {
      console.error('Avatar save error:', err);
      setAvatarUrl(dataUrl);
      sendProfileUpdate({ avatarUrl: dataUrl });
    }
  };

  const handlePickFile = async () => {
    setAvatarMenuOpen(false);
    try {
      if (window.orbita?.pickFile) {
        const raw = await window.orbita.pickFile(['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'webm']);
        if (!raw) return;
        const filePath = Array.isArray(raw) ? raw[0] : raw;
        if (!filePath) return;

        const sizeBytes = await window.orbita.getFileSize(filePath);
        const sizeMB = sizeBytes / (1024 * 1024);
        if (sizeMB > 10) {
          alert('Файл слишком большой. Максимальный размер: 10 МБ.');
          return;
        }

        const dataUrl = await window.orbita.readFileAsDataURL(filePath);
        if (dataUrl) {
          setCropperImageSrc(dataUrl);
          setCropperModalOpen(true);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              setCropperImageSrc(reader.result as string);
              setCropperModalOpen(true);
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      }
    } catch (err) {
      console.error('Error picking avatar file:', err);
    }
  };

  const handlePasteClipboard = async () => {
    setAvatarMenuOpen(false);
    try {
      let dataUrl: string | null = null;
      if (window.orbita?.readClipboardImage) {
        dataUrl = await window.orbita.readClipboardImage();
      }
      if (!dataUrl && navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              break;
            }
          }
          if (dataUrl) break;
        }
      }

      if (dataUrl) {
        setCropperImageSrc(dataUrl);
        setCropperModalOpen(true);
      } else {
        alert('В буфере обмена нет изображения.');
      }
    } catch (err) {
      console.error('Error pasting clipboard image:', err);
      alert('Не удалось прочитать изображение из буфера обмена.');
    }
  };

  const handleOpenEmojiAvatar = () => {
    setAvatarMenuOpen(false);
    setEmojiModalOpen(true);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: isMobileView ? 'stretch' : 'flex-start',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
            border: 'none',
            padding: isMobileView ? '0' : 'min(7.5vh, 64px) 16px 16px',
          }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{
              opacity: 1,
              scale: 1,
              height: isMobileView ? 'calc(100vh - 30px)' : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
            }}
            animate={{
              opacity: 1,
              scale: 1,
              height: isMobileView
                ? 'calc(100vh - 30px)'
                : targetHeight !== null
                ? Math.min(targetHeight, typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750)
                : (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750),
            }}
            transition={{
              height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 0 },
              scale: { duration: 0 },
            }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: isMobileView ? '100vw' : '420px',
              maxHeight: isMobileView ? 'calc(100vh - 30px)' : 'min(85vh, 750px)',
              display: 'flex',
              flexDirection: 'column',
              margin: isMobileView ? '0' : '0 16px',
              marginTop: isMobileView ? '30px' : '0',
              backgroundColor: 'var(--settings-bg, var(--bg-secondary))',
              borderRadius: isMobileView ? 0 : 10,
              boxShadow: isMobileView ? 'none' : '0 20px 60px rgba(0,0,0,0.5)',
              color: 'var(--text-main, #fff)',
              overflow: 'hidden',
              userSelect: 'none',
              border: 'none',
              outline: 'none',
            }}
          >
            {activeSection === 'qrCode' ? (
              <div
                style={{
                  padding: '16px 20px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setActiveSection('main')}
                    aria-label={t('common.back', 'Назад')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                      transition: 'color 150ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 22L6 12L16 2l1.775 1.775L9.55 12l8.225 8.225z" />
                    </svg>
                  </button>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    {t('qrModal.title', 'Получить QR-код')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close', 'Закрыть')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
                    <path fill="currentColor" d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12L4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  zIndex: 30,
                }}
              >
                <button
                  type="button"
                  onClick={() => setNicknameEditOpen(true)}
                  aria-label={t('common.edit')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'color 150ms, background 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = 'var(--text-main)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-dim)';
                  }}
                >
                  <Pencil size={19} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                    transition: 'color 150ms, background 150ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = 'var(--text-main)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-dim)';
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12L4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586z" />
                  </svg>
                </button>
              </div>
            )}

            <div
              style={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              onMouseMove={triggerModalActive}
              onMouseEnter={triggerModalActive}
              onMouseLeave={handleModalMouseLeave}
            >
              <div
                ref={modalScrollRef}
                onScroll={triggerModalActive}
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                className="chat-list-scrollbar"
              >
                <div
                  ref={innerContentRef}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    paddingBottom: '10px',
                  }}
                >
                {activeSection === 'qrCode' ? (
                  <QrCodeView userId={myCode} avatarUrl={avatarUrl} nickname={nickname} />
                ) : (
                <>
                  <div
                    style={{
                      padding: '20px 0 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  boxSizing: 'border-box',
                  width: '100%',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{ position: 'relative', width: 96, height: 96, marginBottom: 10, marginTop: 0, cursor: avatarUrl ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (avatarUrl) {
                      const orbita = (window as any).orbita;
                      if (orbita?.openMediaWindow) {
                        orbita.openMediaWindow({
                          items: [{
                            id: 'my-avatar',
                            url: avatarUrl,
                            directUrl: avatarUrl,
                            type: 'photo',
                            name: `${nickname || 'Avatar'}.png`,
                            sender: nickname || 'Я',
                            time: Date.now(),
                          }],
                          initialIndex: 0,
                        });
                      } else {
                        setIsAvatarViewerOpen(true);
                      }
                    }
                  }}
                >
                  <Avatar
                    src={avatarUrl}
                    alt={nickname || 'User'}
                    className="w-24 h-24 rounded-full"
                    style={{ width: '96px', height: '96px' }}
                  />
                  <button
                    ref={cameraBtnRef}
                    onClick={handleToggleAvatarMenu}
                    aria-label={t('settings.change_avatar', 'Изменить аватар')}
                    style={{
                      position: 'absolute',
                      bottom: '-2px',
                      right: '-2px',
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: 'var(--accent-color)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      boxShadow: '0 0 0 4px var(--settings-bg, var(--bg-secondary)), 0 2px 8px rgba(0,0,0,0.3)',
                      transition: 'opacity 0.15s ease',
                      zIndex: 10,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M12 17.5q1.875 0 3.188-1.312T16.5 13t-1.312-3.187T12 8.5T8.813 9.813T7.5 13t1.313 3.188T12 17.5m0-2q-1.05 0-1.775-.725T9.5 13t.725-1.775T12 10.5t1.775.725T14.5 13t-.725 1.775T12 15.5M4 21q-.825 0-1.412-.587T2 19V7q0-.825.588-1.412T4 5h3.15L9 3h6l1.85 2H20q.825 0 1.413.588T22 7v12q0 .825-.587 1.413T20 21z"/>
                    </svg>
                  </button>

                  {avatarMenuOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 999998 }}
                        onClick={() => setAvatarMenuOpen(false)}
                      />
                      <div
                        style={{
                          position: 'fixed',
                          top: `${menuPos.top}px`,
                          left: `${menuPos.left}px`,
                          backgroundColor: '#1b1726',
                          borderRadius: '10px',
                          border: 'none',
                          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4)',
                          padding: '0',
                          overflow: 'hidden',
                          minWidth: '185px',
                          width: 'max-content',
                          zIndex: 999999,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0px',
                          animation: 'fadeIn 0.12s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={handlePickFile}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '7px 12px',
                            borderRadius: '0px',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            transition: 'background-color 0.12s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                                <path d="M15 8h.01M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/>
                                <path d="m3 16l5-5c.928-.893 2.072-.893 3 0l5 5"/>
                                <path d="m14 14l1-1c.928-.893 2.072-.893 3 0l3 3"/>
                              </g>
                            </svg>
                          </div>
                          <span style={{ whiteSpace: 'nowrap' }}>Файл</span>
                        </button>

                        <button
                          type="button"
                          onClick={handlePasteClipboard}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '7px 12px',
                            borderRadius: '0px',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            transition: 'background-color 0.12s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                              <path fill="currentColor" d="M5 5h2v1c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V5h2v6h2V5c0-1.1-.9-2-2-2h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h5v-2H5zm7-2c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1"/>
                              <path fill="currentColor" d="m21.29 16.29l-2.58-2.58a.996.996 0 1 0-1.41 1.41l.87.88H13c-.55 0-1 .45-1 1s.45 1 1 1h5.17l-.87.88a.996.996 0 1 0 1.41 1.41l2.58-2.58c.39-.4.39-1.03 0-1.42"/>
                            </svg>
                          </div>
                          <span style={{ whiteSpace: 'nowrap' }}>Из буфера обмена</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenEmojiAvatar}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '7px 12px',
                            borderRadius: '0px',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            boxSizing: 'border-box',
                            transition: 'background-color 0.12s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <span className="emoji-font" style={{ fontSize: '18px', lineHeight: 1 }}>
                              🙈
                            </span>
                          </div>
                          <span style={{ whiteSpace: 'nowrap' }}>Выбрать эмодзи</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 0 2px',
                    padding: '0 20px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <h3
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--text-main)',
                        textAlign: 'center',
                      }}
                    >
                      {nickname || 'User'}
                    </h3>
                    <div
                      style={{
                        position: 'absolute',
                        left: 'calc(100% + 5px)',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <DeveloperBadge userId={myCode} size={34} onClick={triggerDevToast} />
                    </div>
                  </div>
                </div>

                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-dim)',
                    margin: '2px 0 0',
                    padding: '0 20px',
                    textAlign: 'center',
                  }}
                >
                  {t('common.online')}
                </p>
              </div>

              <div
                style={{
                  backgroundColor: 'var(--md-surface, #211c2e)',
                  width: '100%',
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  boxSizing: 'border-box',
                }}
                onClick={handleCopyLink}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--accent-color, #9b7dd4)',
                      wordBreak: 'break-all',
                      lineHeight: 1.3,
                    }}
                  >
                    {hideProfileId ? '000' : (myCode || '------')}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                    {hideProfileId ? t('profile.id_hidden', 'ID скрыт') : 'ID'}
                  </span>
                </div>

                <div
                  style={{ flexShrink: 0, color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveSection('qrCode');
                  }}
                  aria-label={t('qrModal.title', 'Получить QR-код')}
                >
                  <QrCodeMiniIcon size={20} />
                </div>
              </div>
            </>
          )}
                </div>
              </div>

              {modalThumb && (
                <>
                  <div
                    className="overlay-scroll-track"
                    onMouseDown={(e) => handleScrollbarTrackMouseDown(e, modalScrollRef.current)}
                    style={{
                      top: '6px',
                      bottom: '6px',
                      opacity: isModalActive ? 1 : 0,
                    }}
                  />
                  <div
                    className="overlay-scroll-thumb"
                    onMouseDown={(e) => handleScrollbarThumbMouseDown(e, modalScrollRef.current)}
                    style={{
                      top: modalThumb.top + 6,
                      height: modalThumb.height,
                      opacity: isModalActive ? 1 : 0,
                    }}
                  />
                </>
              )}
            </div>

            <DeveloperToast isOpen={devToastOpen} nickname={nickname || 'User'} />
            <LinkCopiedToast isOpen={copyToastOpen} />

            <NicknameEditModal
              open={nicknameEditOpen}
              onClose={() => setNicknameEditOpen(false)}
              currentNickname={nickname || ''}
              onSave={handleSaveNickname}
            />

            <EmojiAvatarModal
              isOpen={emojiModalOpen}
              onClose={() => setEmojiModalOpen(false)}
              onSave={handleAvatarSave}
            />

            <AvatarCropperModal
              isOpen={cropperModalOpen}
              imageSrc={cropperImageSrc}
              onClose={() => {
                setCropperModalOpen(false);
                setCropperImageSrc(null);
              }}
              onSave={handleAvatarSave}
            />

            {isAvatarViewerOpen && avatarUrl && (
              <TelegramMediaViewer
                isOpen={isAvatarViewerOpen}
                items={[{
                  id: 'my-avatar',
                  url: avatarUrl,
                  type: 'photo',
                  name: `${nickname || 'Avatar'}.png`,
                  sender: nickname || 'Я',
                  time: Date.now(),
                }]}
                initialIndex={0}
                showCarouselAlways={false}
                onClose={() => setIsAvatarViewerOpen(false)}
              />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
});
