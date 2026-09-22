import { useState, useRef, useCallback, memo, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { channelService } from '../../services/channelService';
import { groupService } from '../../services/groupService';
import { supabaseService } from '../../services/supabaseService';
import { buildGroupInviteLink } from '../../lib/groupCrypto';
import { Search, MoreVertical, Copy, Check, Pencil, Camera, Smile, ArrowLeft, UserPlus, ShieldCheck, Trash2, LogOut, RefreshCw, Lock, Unlock, Clock } from 'lucide-react';
import { DeveloperBadge, DeveloperToast } from '../ui/DeveloperBadge';
import { BotIcon } from '../common/BotIcon';
import { VerifiedBadge } from '../common/VerifiedBadge';
import { AvatarCropperModal } from '../settings/AvatarCropperModal';
import { EmojiPicker } from './EmojiPicker';
import { AddGroupMemberModal } from './AddGroupMemberModal';
import { DeleteGroupModal } from './DeleteGroupModal';
import { arrayBufferToBase64, formatLastSeen } from '../../utils/messageUtils';
import {
  Picture as GravityPictureIcon,
  Video as GravityVideoIcon,
  File as GravityFileIcon,
  Headphones as GravityHeadphonesIcon,
  Link as GravityLinkIcon,
  Microphone as GravityMicIcon,
} from '@gravity-ui/icons';
import { handleScrollbarThumbMouseDown, handleScrollbarTrackMouseDown } from '../../utils/scrollbarDrag';
import { getAvatarGradient } from '../common/Avatar';

const GravityGifBadgeIcon = ({ width = 16, height = 16, style, className, ...props }: React.SVGProps<SVGSVGElement> & { width?: number; height?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={width}
    height={height}
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={style}
    {...props}
  >
    <rect
      x="1.25"
      y="2.5"
      width="13.5"
      height="11"
      rx="2.75"
      stroke="currentColor"
      strokeWidth="1.3"
    />
    <text
      x="8"
      y="10.15"
      fill="currentColor"
      fontSize="6.2"
      fontWeight="800"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      textAnchor="middle"
      letterSpacing="0.4"
    >
      GIF
    </text>
  </svg>
);
import { useChatStore, type Message, type Chat } from '../../store/useChatStore';
import { useCallStore } from '../../store/useCallStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useAudioStore } from '../../store/useAudioStore';
import { MD3CircularSpinner } from '../common/MD3CircularSpinner';
import { Avatar } from '../common/Avatar';
import { NotesAvatar } from '../common/NotesAvatar';
import { useDecryptedMedia, getOrbitaMediaUrl } from '../../lib/media-utils';
import { useShallow } from 'zustand/react/shallow';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { getDomainHost } from '../../utils/linkPreviewUtils';

export interface MediaGridItem {
  id: string;
  messageId: string;
  url: string;
  name: string;
  mime?: string;
  time: number;
  type: 'photos' | 'videos' | 'gif';
  duration?: number;
  text?: string;
  sender?: string;
  key?: string;
}

interface MediaGroup {
  messages: Message[];
  gridItems?: MediaGridItem[];
  count: number;
}

type MediaType = 'photos' | 'videos' | 'files' | 'audio' | 'voice' | 'links' | 'gif';

interface ProfileScreenProps {
  chatId: string;
  onClose: () => void;
  isMobileView?: boolean;
  onLinkClick?: (url: string) => void;
}

const formatTelegramDate = (timestamp: number, i18nLang: string) => {
  const d = new Date(timestamp);
  const monthsRu = ['янв', 'февр', 'мар', 'апр', 'мая', 'июня', 'июля', 'авг', 'сент', 'окт', 'нояб', 'дек'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const isRu = i18nLang.startsWith('ru') || i18nLang.startsWith('uk') || i18nLang.startsWith('be');
  const monthStr = isRu ? monthsRu[d.getMonth()] : monthsEn[d.getMonth()];
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const atStr = isRu ? 'в' : 'at';
  return `${d.getDate()} ${monthStr} ${atStr} ${hours}:${minutes}`;
};

/**
 * Format generalized time period header:
 * - "Сегодня" (Today)
 * - "Вчера" (Yesterday)
 * - Current year: Month name (e.g. "Август", "Июль")
 * - Other years: Month + Year (e.g. "Январь 2026", "Декабрь 2025")
 */
export const formatPeriodHeader = (
  timestamp: number,
  i18nLang: string = 'ru'
): { key: string; title: string; orderScore: number } => {
  const d = new Date(timestamp);
  const now = new Date();

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();

  const isRu = i18nLang.startsWith('ru') || i18nLang.startsWith('be');
  const isUk = i18nLang.startsWith('uk');
  const isKk = i18nLang.startsWith('kk');

  const monthsRu = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthsUk = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const monthsKk = ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'];
  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const getMonthName = (m: number) => {
    if (isRu) return monthsRu[m];
    if (isUk) return monthsUk[m];
    if (isKk) return monthsKk[m];
    return monthsEn[m];
  };

  const getTodayLabel = () => {
    if (isRu) return 'Сегодня';
    if (isUk) return 'Сьогодні';
    if (isKk) return 'Бүгін';
    return 'Today';
  };

  const getYesterdayLabel = () => {
    if (isRu) return 'Вчера';
    if (isUk) return 'Вчора';
    if (isKk) return 'Кеше';
    return 'Yesterday';
  };

  if (isToday) {
    return {
      key: 'today',
      title: getTodayLabel(),
      orderScore: 9999999999999,
    };
  }

  if (isYesterday) {
    return {
      key: 'yesterday',
      title: getYesterdayLabel(),
      orderScore: 9999999999998,
    };
  }

  const monthName = getMonthName(d.getMonth());
  const year = d.getFullYear();
  const currentYear = now.getFullYear();

  const title = year === currentYear ? monthName : `${monthName} ${year}`;
  const key = `${year}-${String(d.getMonth()).padStart(2, '0')}`;
  const orderScore = year * 100 + d.getMonth();

  return {
    key,
    title,
    orderScore,
  };
};

const formatAudioDuration = (seconds?: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatVideoDuration = (seconds?: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '00:00';
  const totalSecs = Math.round(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const isVoiceMessage = (msg: Message) => {
  if (msg.mediaType === 'voice') return true;
  if (
    msg.mime === 'audio/ogg' ||
    msg.mime === 'audio/opus' ||
    msg.mime?.startsWith('audio/ogg') ||
    msg.mime?.startsWith('audio/opus') ||
    msg.mime?.includes('ogg') ||
    msg.mime?.includes('opus')
  ) {
    return true;
  }
  if (
    msg.mediaName &&
    (/^voice_.*\.(ogg|opus|webm|mp3|wav|m4a)$/i.test(msg.mediaName) ||
      /\.ogg$/i.test(msg.mediaName) ||
      /\.opus$/i.test(msg.mediaName) ||
      /^voice_/i.test(msg.mediaName))
  ) {
    return true;
  }
  if (
    msg.text &&
    (/^\[Audio\]\s+voice_/i.test(msg.text) ||
      /^voice_\d+\.ogg/i.test(msg.text.trim()) ||
      /\.ogg(\?.*)?$/i.test(msg.text.trim()) ||
      /^\[Audio\]\s+\S+\.ogg/i.test(msg.text))
  ) {
    return true;
  }
  if (
    msg.mediaUrl &&
    (/voice_\d+\.(ogg|opus|webm)/i.test(msg.mediaUrl) ||
      /\.ogg(\?.*)?$/i.test(msg.mediaUrl) ||
      /\.opus(\?.*)?$/i.test(msg.mediaUrl))
  ) {
    return true;
  }
  return false;
};

const isGifMessage = (msg: Message) => {
  if (isVoiceMessage(msg)) return false;
  if (msg.mediaType === 'gif') return true;
  if (msg.mime === 'image/gif') return true;
  if (msg.mediaName && /\.gif$/i.test(msg.mediaName)) return true;
  if (
    msg.mediaUrl &&
    (/\.gif(\?.*)?$/i.test(msg.mediaUrl) ||
      msg.mediaUrl.includes('tenor.com') ||
      msg.mediaUrl.includes('giphy.com') ||
      msg.mediaUrl.includes('.giphy.') ||
      msg.mediaUrl.includes('c.tenor.com'))
  ) {
    return true;
  }
  if (
    msg.text &&
    (/^\[GIF\]/i.test(msg.text) ||
      /\.gif(\?.*)?$/i.test(msg.text.trim()) ||
      msg.text.includes('tenor.com') ||
      msg.text.includes('giphy.com'))
  ) {
    return true;
  }
  return false;
};

const isStickerMessage = (msg: Message) => {
  if (msg.mediaType === 'sticker') return true;
  if (msg.text && /^\[Sticker\]/i.test(msg.text.trim())) return true;
  if (msg.mediaUrl && (msg.mediaUrl.includes('/stickers/') || msg.mediaUrl.includes('stickers/'))) return true;
  return false;
};

const isPhotoMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isStickerMessage(msg)) return false;
  if (msg.mediaType === 'photo') return true;
  if (msg.mime?.startsWith('image/') && msg.mime !== 'image/gif') return true;
  if (msg.text && /^\[Photo\]/i.test(msg.text)) return true;
  if (msg.mediaName && /\.(jpg|jpeg|png|webp|avif|bmp|heic|tiff)$/i.test(msg.mediaName)) return true;
  if (msg.mediaUrl && /\.(jpg|jpeg|png|webp|avif|bmp|heic|tiff)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};

const isVideoMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isPhotoMessage(msg)) return false;
  if (msg.mediaType === 'video') return true;
  if (msg.mime?.startsWith('video/')) return true;
  if (msg.text && /^\[Video\]/i.test(msg.text)) return true;
  if (msg.mediaName && /\.(mp4|mov|avi|mkv|m4v|3gp)$/i.test(msg.mediaName)) return true;
  if (msg.mediaName && /\.webm$/i.test(msg.mediaName) && !msg.mediaName.startsWith('voice_')) return true;
  if (msg.mediaUrl && /\.(mp4|mov|avi|mkv|m4v|3gp)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};

const isAudioMessage = (msg: Message) => {
  if (isVoiceMessage(msg) || isGifMessage(msg) || isPhotoMessage(msg) || isVideoMessage(msg)) return false;
  if (msg.mediaType === 'audio') return true;
  if (msg.audioMetadata?.title || msg.audioMetadata?.artist) return true;
  if (msg.mime?.startsWith('audio/') && msg.mime !== 'audio/ogg' && msg.mime !== 'audio/opus') return true;
  if (msg.text && /^\[Audio\]/i.test(msg.text) && !msg.text.includes('voice_') && !msg.text.includes('.ogg')) return true;
  if (msg.mediaName && /\.(mp3|m4a|flac|wav|aac|wma|alac)$/i.test(msg.mediaName)) return true;
  if (msg.mediaUrl && /\.(mp3|m4a|flac|wav|aac|wma|alac)(\?.*)?$/i.test(msg.mediaUrl)) return true;
  return false;
};

// Sub-components to prevent hook violations inside map loops
const ProfileMediaGridTile = memo(({
  item,
  sharedSecret,
  type,
  isViewerOpen = false,
  onMediaClick,
}: {
  item: MediaGridItem;
  sharedSecret: string;
  type: 'photos' | 'videos' | 'gif';
  isViewerOpen?: boolean;
  onMediaClick?: (item: MediaGridItem, displaySrc: string | null) => void;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaUrl = item.url || (item.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, item.key || sharedSecret, item.name);
  const displaySrc = blobUrl || (mediaUrl && mediaUrl.startsWith('http') ? mediaUrl : null);

  const [duration, setDuration] = useState<number>(item.duration || 0);
  const [inView, setInView] = useState(true);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  const isVideoFormat = useMemo(() => {
    const src = (displaySrc || item.url || item.name || '').toLowerCase();
    return src.endsWith('.mp4') || src.endsWith('.webm') || src.endsWith('.mov') || src.includes('.mp4') || src.includes('.webm') || (item as any).mediaType === 'video' || (item as any).isVideo;
  }, [displaySrc, item]);

  useEffect(() => {
    if (type !== 'gif' || isVideoFormat || !displaySrc) return;
    let isCancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = displaySrc;
    img.onload = () => {
      if (isCancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.naturalWidth || 300, 400);
        canvas.height = Math.min(img.naturalHeight || 300, 400);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (!isCancelled) setPosterUrl(dataUrl);
        }
      } catch (err) {}
    };
    return () => {
      isCancelled = true;
    };
  }, [type, displaySrc, isVideoFormat]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (type !== 'videos' || duration > 0 || !displaySrc) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = displaySrc;
    v.onloadedmetadata = () => {
      if (!cancelled && v.duration && isFinite(v.duration)) {
        setDuration(Math.round(v.duration));
      }
    };
    return () => {
      cancelled = true;
      v.src = '';
    };
  }, [type, displaySrc, duration]);

  const handleClick = () => {
    if (onMediaClick) {
      onMediaClick(item, displaySrc);
    }
  };

  const shouldAnimateGif = type === 'gif' && inView && !isViewerOpen && !!displaySrc;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        aspectRatio: '1 / 1',
        overflow: 'hidden',
        borderRadius: '4px',
        position: 'relative',
        background: 'var(--surface-muted, rgba(255, 255, 255, 0.05))',
        contain: 'strict',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      className="group transition-opacity duration-150 hover:opacity-90"
    >
      {displaySrc ? (
        type === 'photos' ? (
          <img
            src={displaySrc}
            alt={item.name || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
            decoding="async"
          />
        ) : type === 'gif' ? (
          isVideoFormat ? (
            <video
              src={displaySrc}
              autoPlay={shouldAnimateGif}
              loop
              muted
              playsInline
              preload="metadata"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              ref={(v) => {
                if (v) {
                  if (shouldAnimateGif) {
                    v.play().catch(() => {});
                  } else {
                    v.pause();
                  }
                }
              }}
            />
          ) : shouldAnimateGif ? (
            <img
              src={displaySrc}
              alt={item.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <img
              src={posterUrl || displaySrc}
              alt={item.name || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )
        ) : (
          <>
            <video
              src={displaySrc}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
              preload="metadata"
              playsInline
            />
            <div
              style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                color: '#ffffff',
                padding: '2px 5px 2px 4px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                lineHeight: 1,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{formatVideoDuration(duration)}</span>
            </div>
          </>
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-white/5 animate-pulse" />
      )}

      {type === 'gif' && (
        <div
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            padding: '2px 5px',
            borderRadius: '4px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: '#ffffff',
            fontSize: '10.5px',
            fontWeight: 700,
            lineHeight: 1.1,
            zIndex: 2,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          GIF
        </div>
      )}
    </div>
  );
});

const ProfileFileListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, msg.mediaKey || sharedSecret, msg.mediaName);
  const fileName = msg.mediaName || msg.text?.replace(/^\[(?:File|Document|Photo|Video|Audio)\]\s*/i, '').trim() || 'File';
  const ext = fileName.includes('.') ? fileName.split('.').pop()! : 'file';
  const dateStr = formatTelegramDate(msg.time, i18nLang);

  const handleOpenFile = useCallback(async () => {
    if (!blobUrl) return;
    try {
      const response = await fetch(blobUrl);
      const fileBlob = await response.blob();
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (window.orbita && window.orbita.openFile) {
        await window.orbita.openFile(base64, fileName);
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [blobUrl, fileName]);

  return (
    <div
      className="group flex items-center gap-3 w-full transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 16px',
        borderRadius: 0,
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
      }}
      onClick={handleOpenFile}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-white uppercase text-[11.5px] shadow-sm select-none"
        style={{ backgroundColor: 'var(--accent-color, #7C3AED)' }}
      >
        {ext.length <= 4 ? ext : ext.slice(0, 3)}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="truncate text-[13.5px] font-medium text-[var(--text-main)] leading-tight">
          {fileName}
        </span>
        <div className="text-[11.5px] text-[var(--text-dim)] flex items-center gap-2 mt-0.5">
          <span>{dateStr}</span>
        </div>
      </div>
    </div>
  );
});

const ProfileAudioListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const effectiveSecret = msg.mediaKey || sharedSecret;
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, effectiveSecret, msg.mediaName);
  const trackName = msg.audioMetadata?.title || msg.mediaName || msg.text || 'Audio Track';
  const artistName = msg.audioMetadata?.artist || '';
  const [cover, setCover] = useState<string | null>(msg.audioMetadata?.cover || null);

  const isCurrentTrack = useAudioStore((s) => s.currentTrack?.id === (msg.id || String(msg.time)));
  const isPlaying = useAudioStore((s) => (isCurrentTrack ? s.isPlaying : false));
  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);
  const dateStr = formatTelegramDate(msg.time, i18nLang);

  useEffect(() => {
    if (!blobUrl || cover) return;
    let cancelled = false;
    if (typeof window.jsmediatags !== 'undefined') {
      try {
        fetch(blobUrl)
          .then((res) => res.blob())
          .then((blob) => {
            window.jsmediatags.read(blob, {
              onSuccess: (tag: any) => {
                if (cancelled) return;
                const picture = tag.tags.picture;
                if (picture) {
                  let binary = '';
                  for (let i = 0; i < picture.data.length; i++) {
                    binary += String.fromCharCode(picture.data[i]);
                  }
                  setCover(`data:${picture.format};base64,${window.btoa(binary)}`);
                }
              },
              onError: () => {},
            });
          })
          .catch(() => {});
      } catch (err) {}
    }
    return () => {
      cancelled = true;
    };
  }, [blobUrl, cover]);

  const handlePlayClick = () => {
    if (!blobUrl) return;
    if (isPlaying) {
      pause();
    } else {
      play({
        id: msg.id || String(msg.time),
        chatId: '',
        title: trackName,
        artist: artistName,
        duration: msg.audioMetadata?.duration || 0,
        cover: cover,
        url: blobUrl,
        sharedSecret: effectiveSecret,
        mediaType: 'audio',
        message: msg,
      });
    }
  };

  const durationStr = msg.audioMetadata?.duration ? formatAudioDuration(msg.audioMetadata.duration) : '';
  const subText = durationStr ? `${durationStr}, ${dateStr}` : dateStr;

  return (
    <div
      className="group flex items-center gap-3 w-full transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 16px',
        borderRadius: 0,
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
      }}
      onClick={handlePlayClick}
    >
      <AudioCoverWithPlay
        cover={cover}
        isPlayingTrack={isPlaying}
        size={40}
        onClick={handlePlayClick}
        state={!blobUrl ? 'download' : (isPlaying ? 'pause' : 'play')}
      />

      <div className="flex flex-col min-w-0 flex-1 gap-0.5 select-none">
        <div
          className="text-sm font-semibold truncate"
          style={{
            color: isCurrentTrack ? 'var(--accent-color, #7C3AED)' : 'var(--text-main, #ffffff)',
          }}
        >
          {trackName}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-dim, #9ca3af)' }}>
          {artistName ? `${artistName} • ${subText}` : subText}
        </div>
      </div>
    </div>
  );
});

const ProfileVoiceListItem = memo(({ msg, sharedSecret, i18nLang }: { msg: Message; sharedSecret: string; i18nLang: string }) => {
  const { t } = useTranslation();
  const effectiveSecret = msg.mediaKey || sharedSecret;
  const mediaUrl = msg.mediaUrl || (msg.text?.match(/https?:\/\/[^\s]+/)?.[0] ?? '');
  const { blobUrl } = useDecryptedMedia(mediaUrl, effectiveSecret, msg.mediaName);

  const isCurrentTrack = useAudioStore((s) => s.currentTrack?.id === (msg.id || String(msg.time)));
  const isPlaying = useAudioStore((s) => (isCurrentTrack ? s.isPlaying : false));
  const currentTime = useAudioStore((s) => (isCurrentTrack ? s.currentTime : 0));
  const duration = useAudioStore((s) => (isCurrentTrack ? s.duration : 0));

  const play = useAudioStore((s) => s.play);
  const pause = useAudioStore((s) => s.pause);

  const dateStr = formatTelegramDate(msg.time, i18nLang);
  const senderName = msg.sender || '~/user';

  const [audioDuration, setAudioDuration] = useState<number>(() => {
    return msg.audioMetadata?.duration || msg.duration || 0;
  });

  useEffect(() => {
    if (msg.audioMetadata?.duration) {
      setAudioDuration(msg.audioMetadata.duration);
    } else if (msg.duration) {
      setAudioDuration(msg.duration);
    }
  }, [msg.audioMetadata?.duration, msg.duration]);

  useEffect(() => {
    if (!blobUrl || audioDuration > 0) return;
    let cancelled = false;
    const audio = new Audio(blobUrl);
    audio.addEventListener('loadedmetadata', () => {
      if (!cancelled && audio.duration && isFinite(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    });
    audio.load();
    return () => {
      cancelled = true;
    };
  }, [blobUrl, audioDuration]);

  const totalDuration = duration > 0 ? duration : audioDuration;

  const timeDisplay = isPlaying
    ? `${dateStr}, ${formatAudioDuration(currentTime)} / ${formatAudioDuration(totalDuration)}`
    : `${dateStr}, ${formatAudioDuration(totalDuration)}`;

  const handlePlayClick = () => {
    if (!blobUrl) return;
    if (isPlaying) {
      pause();
    } else {
      play({
        id: msg.id || String(msg.time),
        chatId: '',
        title: t('chatWindow.voice_message', 'Голосовое сообщение'),
        artist: senderName,
        duration: totalDuration,
        cover: null,
        url: blobUrl,
        sharedSecret: effectiveSecret,
        mediaType: 'voice',
        message: msg,
      });
    }
  };

  return (
    <div
      className="group flex items-center gap-3 w-full transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))]"
      style={{
        minHeight: '52px',
        contain: 'layout paint',
        padding: '6px 16px',
        borderRadius: 0,
        cursor: 'pointer',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <AudioCoverWithPlay
        cover={null}
        isPlayingTrack={isPlaying}
        size={40}
        onClick={handlePlayClick}
      />

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="truncate text-[13.5px] font-medium text-[var(--text-main)] leading-tight">
          {senderName}
        </span>
        <div className="text-[11.5px] text-[var(--text-dim)] flex items-center gap-2 mt-0.5">
          <span>{timeDisplay}</span>
        </div>
      </div>
    </div>
  );
});

const ProfileLinkListItem = memo(({
  msg,
  onLinkClick,
}: {
  msg: Message;
  onLinkClick?: (url: string) => void;
}) => {
  const urlMatch = msg.text?.match(/\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+(?:com|ru|org|net|io|dev|app|me|co|uk|de|fr|by|kz|info|biz|cc|tv|store|online|site|tech|xyz|top|live|pro|space|fun|cloud|link|[a-zA-Z]{2,63})(?:\/[^\s]*)?/i);
  const rawUrl = urlMatch ? urlMatch[0].trim() : '';
  const fullUrl = rawUrl ? (rawUrl.match(/^(https?:\/\/|ftp:\/\/)/i) ? rawUrl : `https://${rawUrl}`) : '';

  const preview = msg.linkPreview;
  const host = getDomainHost(fullUrl);

  const title = preview?.title || host || 'Link';
  const cleanHost = host.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
  const domainInitial = (cleanHost.charAt(0) || title.charAt(0) || 'L').toUpperCase();

  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(preview?.image && !imgError);

  const handleLinkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (fullUrl) {
      if (onLinkClick) {
        onLinkClick(fullUrl);
      } else if ((window as any).orbita?.openExternal) {
        (window as any).orbita.openExternal(fullUrl);
      }
    }
  };

  const cleanDescription = preview?.description || msg.text?.replace(/\b(?:https?:\/\/|ftp:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/gi, '').replace(/\n+/g, ' ').trim() || '';

  return (
    <div
      onClick={handleLinkClick}
      className="group flex items-start gap-3 w-full cursor-pointer transition-colors hover:bg-[var(--surface-container-strong,rgba(255,255,255,0.06))] select-none"
      style={{
        contain: 'layout paint',
        padding: '8px 16px',
        borderRadius: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center font-bold text-base text-white shadow-sm mt-0.5"
        style={{
          background: hasImage ? 'transparent' : getAvatarGradient(cleanHost || title),
        }}
      >
        {hasImage ? (
          <img
            src={preview!.image}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ userSelect: 'none' }}>{domainInitial}</span>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h4 className="font-bold text-[13.5px] text-[var(--text-main)] truncate leading-snug">
          {title}
        </h4>

        {cleanDescription ? (
          <p className="text-[12px] text-[var(--text-dim)] line-clamp-2 leading-relaxed mt-0.5 opacity-85">
            {cleanDescription}
          </p>
        ) : null}

        <span className="text-[12px] text-[var(--accent-color)] hover:underline truncate mt-0.5 font-medium block">
          {fullUrl}
        </span>
      </div>
    </div>
  );
});





import { TelegramMediaViewer, type MediaViewerItem } from './TelegramMediaViewer';

export const ProfileScreen = memo(({ chatId, onClose, isMobileView = false, onLinkClick }: ProfileScreenProps) => {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<MediaType | null>(null);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    items: MediaViewerItem[];
    initialIndex: number;
  }>({
    isOpen: false,
    items: [],
    initialIndex: 0,
  });

  const [copiedKey, setCopiedKey] = useState(false);
  const [devToastOpen, setDevToastOpen] = useState(false);

  const triggerDevToast = useCallback(() => {
    setDevToastOpen(true);
    setTimeout(() => setDevToastOpen(false), 3000);
  }, []);
  const [soundAnimTrigger, setSoundAnimTrigger] = useState(0);
  const updateChat = useChatStore((state) => state.updateChat);
  const toggleChatMuted = useChatStore((state) => state.toggleChatMuted);

  const chat = useChatStore((state) => state.chats.find(c => c.id === chatId));

  const profileScrollRef = useRef<HTMLDivElement>(null);
  const [profileThumb, setProfileThumb] = useState<{ top: number; height: number } | null>(null);
  const [isProfileActive, setIsProfileActive] = useState(false);
  const profileActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateProfileThumb = useCallback(() => {
    const el = profileScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 8) {
      setProfileThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setProfileThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerProfileActive = useCallback(() => {
    updateProfileThumb();
    const el = profileScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsProfileActive(true);
      if (profileActiveTimerRef.current) clearTimeout(profileActiveTimerRef.current);
      profileActiveTimerRef.current = setTimeout(() => {
        setIsProfileActive(false);
      }, 1000);
    } else {
      setIsProfileActive(false);
    }
  }, [updateProfileThumb]);

  const handleProfileMouseLeave = useCallback(() => {
    if (profileActiveTimerRef.current) clearTimeout(profileActiveTimerRef.current);
    setIsProfileActive(false);
  }, []);

  useEffect(() => {
    updateProfileThumb();
  }, [updateProfileThumb]);

  useEffect(() => {
    const el = profileScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateProfileThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateProfileThumb]);

  const subTabScrollRef = useRef<HTMLDivElement>(null);
  const [subTabThumb, setSubTabThumb] = useState<{ top: number; height: number } | null>(null);
  const [isSubTabActive, setIsSubTabActive] = useState(false);
  const subTabActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSubTabThumb = useCallback(() => {
    const el = subTabScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 8) {
      setSubTabThumb(null);
      return;
    }
    const trackHeight = clientHeight - 12;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;
    setSubTabThumb({ top: maxTop * ratio, height: thumbHeight });
  }, []);

  const triggerSubTabActive = useCallback(() => {
    updateSubTabThumb();
    const el = subTabScrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 8) {
      setIsSubTabActive(true);
      if (subTabActiveTimerRef.current) clearTimeout(subTabActiveTimerRef.current);
      subTabActiveTimerRef.current = setTimeout(() => {
        setIsSubTabActive(false);
      }, 1000);
    } else {
      setIsSubTabActive(false);
    }
  }, [updateSubTabThumb]);

  const handleSubTabMouseLeave = useCallback(() => {
    if (subTabActiveTimerRef.current) clearTimeout(subTabActiveTimerRef.current);
    setIsSubTabActive(false);
  }, []);

  useEffect(() => {
    updateSubTabThumb();
  }, [subTab, searchQuery, updateSubTabThumb]);

  useEffect(() => {
    const el = subTabScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => updateSubTabThumb());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSubTabThumb]);
  const messages = useChatStore(useShallow((s) => s.messagesByChatId[chatId] || []));
  const setActiveChat = useChatStore((state) => state.setActiveChat);
  const startCall = useCallStore((state) => state.startCall);
  const myNickname = useAuthStore((state) => state.nickname) || 'YOU';
  const myUserId = useAuthStore((state) => state.userId);
  const voiceCallsEnabled = useChatStore((state) => state.voiceCallsEnabled);

  const isChannel = chat?.type === 'channel';
  const isGroup = chat?.type === 'group';
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isDeleteGroupModalOpen, setIsDeleteGroupModalOpen] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'delete' | 'leave'>('delete');

  const isChannelOwner = useMemo(() => {
    if (!isChannel || !chat) return false;
    if (chat.isOwner) return true;
    if (chat.role === 'owner') return true;
    if (myUserId && chat.creatorId && chat.creatorId === myUserId) return true;
    if (myUserId && chat.members?.some((m) => m.userId === myUserId && m.role === 'owner')) return true;
    return false;
  }, [isChannel, chat, myUserId]);

  const isGroupOwner = useMemo(() => {
    if (!isGroup || !chat) return false;
    if (chat.isOwner) return true;
    if (chat.role === 'owner') return true;
    const currentCode = useChatStore.getState().myCode;
    if (currentCode && chat.creatorCode && chat.creatorCode === currentCode) return true;
    if (myUserId && chat.creatorId && chat.creatorId === myUserId) return true;
    if (chat.members?.some((m: any) => {
      const id = m.userId || m.userCode;
      return id && ((myUserId && id === myUserId) || (currentCode && id === currentCode)) && m.role === 'owner';
    })) return true;
    return false;
  }, [isGroup, chat, myUserId]);

  const isGroupAdmin = useMemo(() => {
    if (!isGroup || !chat) return false;
    if (isGroupOwner) return true;
    if (chat.role === 'admin') return true;
    const currentCode = useChatStore.getState().myCode;
    if (chat.members?.some((m: any) => {
      const id = m.userId || m.userCode;
      return id && ((myUserId && id === myUserId) || (currentCode && id === currentCode)) && (m.role === 'admin' || m.role === 'owner');
    })) return true;
    return false;
  }, [isGroup, chat, isGroupOwner, myUserId]);
  const profileId = useMemo(() => {
    if (!chat) return '';
    if (isChannel) return chat.id;
    if (chatId === 'notes') return '';
    const rawCode = (chat.peerCode && !chat.peerCode.includes('-'))
      ? chat.peerCode
      : (chat.originalPeerCode && !chat.originalPeerCode.includes('-'))
        ? chat.originalPeerCode
        : (chat.name && chat.name.length === 36 && !chat.name.includes('-') ? chat.name : undefined);
    return rawCode || '';
  }, [isChannel, chat, chatId]);

  const formattedProfileId = useMemo(() => {
    if (!profileId) return '';
    return profileId;
  }, [profileId]);

  useEffect(() => {
    if (!chat) {
      onClose();
    }
  }, [chat, onClose]);

  useEffect(() => {
    if (!chat || chat.type !== 'group') return;
    groupService.getGroup(chat.id).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === chat.id);
        const currentUserId = useAuthStore.getState().userId;
        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (currentUserId && info.creatorCode && info.creatorCode === currentUserId) ||
          (currentUserId && chat.creatorId && chat.creatorId === currentUserId) ||
          (myNickname && info.creatorNickname === myNickname)
        );
        const validName = (info.name && info.name !== 'Group Chat') ? info.name : (current?.name || info.name);
        const validMembers = (info.members && info.members.length > 0)
          ? info.members.map((m) => ({
              userId: m.userCode,
              nickname: m.nickname,
              role: m.role,
              lastSeen: m.lastSeen || Date.now(),
              avatarUrl: m.avatarUrl || null,
            }))
          : current?.members;

        const updates: Partial<Chat> = {
          name: validName,
          description: info.description || current?.description,
          avatarUrl: info.avatarUrl || current?.avatarUrl || undefined,
          membersCount: Math.max(info.membersCount || 0, validMembers?.length || 0, current?.membersCount || 1),
          inviteCode: info.code || current?.inviteCode,
          members: validMembers,
        };
        if (isCreator) {
          updates.isOwner = true;
          updates.role = 'owner';
        }
        updateChat(chat.id, updates);
      }
    });
  }, [chat?.id, chat?.type, updateChat, myNickname]);

  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!chat || chat.type !== 'group' || !chat.members) return;
    let isMounted = true;
    chat.members.forEach((m) => {
      const code = m.userId || (m as any).userCode;
      if (!code || m.avatarUrl || memberAvatars[code]) return;
      supabaseService.lookupPublicProfile(code).then((profile) => {
        if (isMounted && profile?.avatar_url) {
          setMemberAvatars((prev) => ({ ...prev, [code]: profile.avatar_url! }));
        }
      }).catch(() => {});
    });
    return () => {
      isMounted = false;
    };
  }, [chat?.id, chat?.members]);

  const handleCopyChannelKey = useCallback((customId?: string | React.MouseEvent) => {
    const idToCopy = (typeof customId === 'string' && customId) ? customId : chat?.id;
    if (!idToCopy) return;
    navigator.clipboard.writeText(idToCopy);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }, [chat?.id]);

  useEffect(() => {
    if (!chat || chat.type !== 'channel') return;
    channelService.getChannel(chat.id).then((info) => {
      if (info) {
        const current = useChatStore.getState().chats.find((c) => c.id === chat.id);
        if (current?.updatedAt && info.updatedAt && current.updatedAt > info.updatedAt) {
          return;
        }
        const currentUserId = useAuthStore.getState().userId;
        const isCreator = Boolean(
          current?.isOwner ||
          current?.role === 'owner' ||
          (currentUserId && info.creatorId && info.creatorId === currentUserId) ||
          (currentUserId && chat.creatorId && chat.creatorId === currentUserId) ||
          (currentUserId && current?.creatorId && current.creatorId === currentUserId)
        );
        const updates: Partial<Chat> = {
          subscribersCount: info.subscribersCount,
          creatorId: info.creatorId || chat.creatorId,
          creatorNickname: info.creatorNickname || chat.creatorNickname,
        };
        if (isCreator) {
          updates.isOwner = true;
          updates.role = 'owner';
        }
        if (!isCreator) {
          updates.name = info.name;
          updates.description = info.description;
          updates.avatarUrl = info.avatarUrl || undefined;
          if (info.updatedAt) updates.updatedAt = info.updatedAt;
        } else {
          if (info.name && !current?.name) updates.name = info.name;
          if (info.description && !current?.description) updates.description = info.description;
          if (info.avatarUrl && !current?.avatarUrl) updates.avatarUrl = info.avatarUrl;
        }
        updateChat(chat.id, updates);
      }
    });
  }, [chat?.id, chat?.type, updateChat]);

  useEffect(() => {
    if (!chat || chat.type !== 'private' || chatId === 'notes') return;
    const myCode = useChatStore.getState().myCode;
    const targetCode = (chat.peerCode && chat.peerCode !== myCode)
      ? chat.peerCode
      : (chat.name && chat.name.length === 36 && chat.name !== myCode)
        ? chat.name
        : undefined;

    let isMounted = true;
    (async () => {
      try {
        let updateNick: string | undefined = undefined;
        let updateAvatar: string | undefined = undefined;

        const update = await supabaseService.getLatestProfileUpdate(chat.id, myCode || undefined);
        const myUserId = useAuthStore.getState().userId;
        const isMyOwnUpdate = update && (
          (myCode && update.sender_code === myCode) ||
          (myUserId && (update.user_id === myUserId || update.sender_id === myUserId))
        );

        if (update && !isMyOwnUpdate) {
          if (update.nickname) updateNick = update.nickname;
          if (update.avatar_url !== undefined) updateAvatar = update.avatar_url || undefined;
        }

        if (targetCode) {
          const pub = await supabaseService.lookupPublicProfile(targetCode);
          if (pub?.nickname && !updateNick) updateNick = pub.nickname;
          if (pub?.avatar_url !== undefined && !updateAvatar) updateAvatar = pub.avatar_url || undefined;
        }

        if (!isMounted) return;

        const chatUpdates: Partial<Chat> = {};
        if (!chat.peerCode && chat.originalPeerCode) {
          chatUpdates.peerCode = chat.originalPeerCode;
        } else if (update?.sender_code && update.sender_code !== myCode) {
          chatUpdates.peerCode = update.sender_code;
          chatUpdates.originalPeerCode = update.sender_code;
        }
        if (updateNick && updateNick !== chat.name) {
          chatUpdates.name = updateNick;
        }
        if (updateAvatar !== undefined && updateAvatar !== chat.avatarUrl) {
          chatUpdates.avatarUrl = updateAvatar;
        }
        if (Object.keys(chatUpdates).length > 0) {
          updateChat(chat.id, chatUpdates);
        }
      } catch {}
    })();

    return () => {
      isMounted = false;
    };
  }, [chat?.id, chat?.type, chat?.peerCode, updateChat]);

  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [editName, setEditName] = useState(chat?.name || '');
  const [editDescription, setEditDescription] = useState(chat?.description || '');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(chat?.avatarUrl || null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [cropperModalOpen, setCropperModalOpen] = useState(false);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chat) {
      setEditName(chat.name || '');
      setEditDescription(chat.description || '');
      setEditAvatarUrl(chat.avatarUrl || null);
    }
  }, [chat?.name, chat?.description, chat?.avatarUrl]);

  const handleAvatarFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCropperImageSrc(event.target?.result as string);
        setCropperModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleSaveChannel = useCallback(async () => {
    if (!chat || isSavingChannel) return;
    const newName = editName.trim();
    if (!newName) return;
    const newDesc = editDescription.trim();
    const initialAvatar = editAvatarUrl;

    setIsSavingChannel(true);
    updateChat(chat.id, {
      name: newName,
      description: newDesc,
      avatarUrl: initialAvatar || undefined,
    });
    setIsEditingChannel(false);

    (async () => {
      let finalAvatarUrl = initialAvatar;
      if (initialAvatar && initialAvatar.startsWith('data:')) {
        const base64 = initialAvatar.includes(',') ? initialAvatar.split(',')[1] : initialAvatar;
        if (typeof window !== 'undefined' && window.orbita?.writeTempFile && window.orbita?.uploadToCloudinary) {
          try {
            const tempPath = await window.orbita.writeTempFile(base64, 'png');
            if (tempPath) {
              const publicId = `channel_avatar_${chat.id}_${Date.now()}`;
              const result = await window.orbita.uploadToCloudinary(tempPath, publicId);
              if (result.success && result.secure_url) {
                finalAvatarUrl = result.secure_url;
                updateChat(chat.id, { avatarUrl: finalAvatarUrl });
              }
              await window.orbita.deleteTempFile(tempPath);
            }
          } catch {}
        }
      }

      const nameChanged = (chat.name || '').trim() !== newName;
      const descChanged = (chat.description || '').trim() !== newDesc;
      const avatarChanged = (chat.avatarUrl || null) !== (finalAvatarUrl || null);

      if (chat.type === 'group') {
        const groupUpdate: { name?: string; description?: string; avatarUrl?: string | null } = {};
        if (nameChanged) groupUpdate.name = newName;
        if (descChanged) groupUpdate.description = newDesc;
        if (avatarChanged) groupUpdate.avatarUrl = finalAvatarUrl;
        if (Object.keys(groupUpdate).length > 0) {
          await groupService.updateGroup(chat.id, groupUpdate);
        }
      } else {
        await channelService.updateChannel(chat.id, {
          name: newName,
          description: newDesc,
          avatarUrl: finalAvatarUrl,
        });
      }
    })().catch((err) => {
      console.error('Failed to save channel in background:', err);
    }).finally(() => {
      setIsSavingChannel(false);
    });
  }, [chat, isSavingChannel, editName, editDescription, editAvatarUrl, updateChat]);

  const handleConfirmGroupAction = useCallback(async () => {
    if (!chat) return;
    const targetChatId = chat.id;
    const currentMode = groupModalMode;
    setIsDeleteGroupModalOpen(false);
    onClose();
    if (currentMode === 'delete') {
      await groupService.deleteGroup(targetChatId);
    } else {
      await groupService.leaveGroup(targetChatId, myNickname, myUserId);
    }
    useChatStore.getState().deleteChat(targetChatId);
  }, [chat, groupModalMode, onClose, myNickname, myUserId]);

  const innerContentRef = useRef<HTMLDivElement>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);

  useEffect(() => {
    if (isMobileView || isEditingChannel || subTab !== null) {
      setTargetHeight(null);
      return;
    }

    const measure = () => {
      if (innerContentRef.current) {
        const measured = innerContentRef.current.offsetHeight || innerContentRef.current.scrollHeight;
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
  }, [subTab, isMobileView, isEditingChannel, chat?.id]);

  const mediaGroups = useMemo(() => {
    if (!chat || !messages) return {} as Record<MediaType, MediaGroup>;

    const groups: Record<MediaType, MediaGroup> = {
      photos: { messages: [], gridItems: [], count: 0 },
      videos: { messages: [], gridItems: [], count: 0 },
      files: { messages: [], gridItems: [], count: 0 },
      audio: { messages: [], gridItems: [], count: 0 },
      voice: { messages: [], gridItems: [], count: 0 },
      links: { messages: [], gridItems: [], count: 0 },
      gif: { messages: [], gridItems: [], count: 0 },
    };

    for (const msg of messages) {
      if (isStickerMessage(msg)) {
        continue;
      }
      if (isVoiceMessage(msg)) {
        groups.voice.messages.push(msg);
        groups.voice.count++;
      } else if (isGifMessage(msg)) {
        groups.gif.messages.push(msg);
        groups.gif.gridItems?.push({
          id: msg.id || String(msg.time),
          messageId: msg.id || String(msg.time),
          url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
          name: msg.mediaName || 'GIF',
          mime: msg.mime || 'image/gif',
          time: msg.time,
          type: 'gif',
          duration: msg.duration,
          text: msg.text,
          sender: msg.sender,
          key: msg.mediaKey,
        });
        groups.gif.count++;
      } else if (msg.mediaItems && msg.mediaItems.length > 0) {
        msg.mediaItems.forEach((item, idx) => {
          const itemIsSticker =
            (item as any).type === 'sticker' ||
            (item.url && (item.url.includes('/stickers/') || item.url.includes('stickers/')));

          if (itemIsSticker) return;

          const itemIsVoice =
            (item as any).type === 'voice' ||
            item.mime === 'audio/ogg' ||
            item.mime?.includes('ogg') ||
            item.mime?.includes('opus') ||
            (item.name && (/^voice_/i.test(item.name) || /\.ogg$/i.test(item.name) || /\.opus$/i.test(item.name)));

          const itemIsAudio =
            !itemIsVoice &&
            ((item as any).type === 'audio' ||
              (item.mime && item.mime.startsWith('audio/')) ||
              (item.name && /\.(mp3|wav|flac|aac|m4a|wma|ape|alac)$/i.test(item.name)));

          const itemIsGif =
            !itemIsVoice &&
            !itemIsAudio &&
            (item.mime === 'image/gif' || item.name?.endsWith('.gif') || (item as any).type === 'gif');

          const itemIsVideo =
            !itemIsVoice &&
            !itemIsAudio &&
            !itemIsGif &&
            ((item as any).type === 'video' ||
              (item.mime && item.mime.startsWith('video/')) ||
              (item.name && /\.(mp4|mov|avi|mkv|m4v|3gp)$/i.test(item.name)) ||
              (item.name && /\.webm$/i.test(item.name) && !item.name.startsWith('voice_')));

          const itemIsPhoto =
            !itemIsVoice &&
            !itemIsAudio &&
            !itemIsGif &&
            !itemIsVideo &&
            !itemIsSticker &&
            ((item as any).type === 'photo' ||
              (item as any).type === 'image' ||
              (item.mime && item.mime.startsWith('image/')) ||
              (item.name && /\.(png|jpg|jpeg|webp|avif|bmp|heic)$/i.test(item.name)));

          if (itemIsVoice) {
            groups.voice.messages.push({
              ...msg,
              id: `${msg.id || msg.time}_${idx}`,
              mediaUrl: item.url,
              mediaName: item.name || `voice_${formatTelegramDate(msg.time, i18n.language)}`,
              mime: item.mime || 'audio/ogg',
              duration: item.duration,
              mediaKey: item.key || msg.mediaKey,
              mediaType: 'voice',
            });
            groups.voice.count++;
          } else if (itemIsAudio) {
            groups.audio.messages.push({
              ...msg,
              id: `${msg.id || msg.time}_${idx}`,
              mediaUrl: item.url,
              mediaName: item.name || 'Audio',
              mime: item.mime || 'audio/mpeg',
              duration: item.duration,
              mediaKey: item.key || msg.mediaKey,
              mediaType: 'audio',
              audioMetadata: (item as any).audioMetadata || {
                title: item.name?.replace(/\.[^.]+$/, '') || 'Audio',
                artist: '',
                duration: item.duration,
                cover: (item as any).cover || null,
              },
            });
            groups.audio.count++;
          } else if (itemIsGif) {
            groups.gif.messages.push(msg);
            groups.gif.gridItems?.push({
              id: `${msg.id || msg.time}_${idx}`,
              messageId: msg.id || String(msg.time),
              url: item.url,
              name: item.name || 'GIF',
              mime: item.mime || 'image/gif',
              time: msg.time,
              type: 'gif',
              duration: item.duration,
              text: msg.text,
              sender: msg.sender,
              key: item.key || msg.mediaKey,
            });
            groups.gif.count++;
          } else if (itemIsVideo) {
            groups.videos.messages.push(msg);
            groups.videos.gridItems?.push({
              id: `${msg.id || msg.time}_${idx}`,
              messageId: msg.id || String(msg.time),
              url: item.url,
              name: item.name || 'Video',
              mime: item.mime || 'video/mp4',
              time: msg.time,
              type: 'videos',
              duration: item.duration,
              text: msg.text,
              sender: msg.sender,
              key: item.key || msg.mediaKey,
            });
            groups.videos.count++;
          } else if (itemIsPhoto) {
            groups.photos.messages.push(msg);
            groups.photos.gridItems?.push({
              id: `${msg.id || msg.time}_${idx}`,
              messageId: msg.id || String(msg.time),
              url: item.url,
              name: item.name || 'Photo',
              mime: item.mime || 'image/jpeg',
              time: msg.time,
              type: 'photos',
              duration: item.duration,
              text: msg.text,
              sender: msg.sender,
              key: item.key || msg.mediaKey,
            });
            groups.photos.count++;
          } else {
            groups.files.messages.push({
              ...msg,
              id: `${msg.id || msg.time}_${idx}`,
              mediaUrl: item.url,
              mediaName: item.name || 'File',
              mime: item.mime || 'application/octet-stream',
              duration: item.duration,
              mediaKey: item.key || msg.mediaKey,
              mediaType: 'file',
            });
            groups.files.count++;
          }
        });
      } else if (isPhotoMessage(msg)) {
        groups.photos.messages.push(msg);
        groups.photos.gridItems?.push({
          id: msg.id || String(msg.time),
          messageId: msg.id || String(msg.time),
          url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
          name: msg.mediaName || 'Photo',
          mime: msg.mime || 'image/jpeg',
          time: msg.time,
          type: 'photos',
          duration: msg.duration,
          text: msg.text,
          sender: msg.sender,
          key: msg.mediaKey,
        });
        groups.photos.count++;
      } else if (isVideoMessage(msg)) {
        groups.videos.messages.push(msg);
        groups.videos.gridItems?.push({
          id: msg.id || String(msg.time),
          messageId: msg.id || String(msg.time),
          url: msg.mediaUrl || msg.text?.match(/https?:\/\/[^\s]+/)?.[0] || '',
          name: msg.mediaName || 'Video',
          mime: msg.mime || 'video/mp4',
          time: msg.time,
          type: 'videos',
          duration: msg.duration,
          text: msg.text,
          sender: msg.sender,
          key: msg.mediaKey,
        });
        groups.videos.count++;
      } else if (isAudioMessage(msg)) {
        groups.audio.messages.push(msg);
        groups.audio.count++;
      } else if (msg.mediaType === 'file' || (msg.mediaType === null && msg.text?.startsWith('[File]'))) {
        groups.files.messages.push(msg);
        groups.files.count++;
      } else if (msg.text && !msg.mediaType) {
        const urlMatch = msg.text.match(/https?:\/\/[^\s]+/g);
        if (urlMatch) {
          groups.links.messages.push(msg);
          groups.links.count += urlMatch.length;
        }
      }
    }

    return groups;
  }, [chat, messages]);

  const availableSections = useMemo(() => {
    const sections: { id: MediaType; labelKey: string; icon: React.ElementType; count: number }[] = [];
    const mapping: Record<MediaType, { labelKey: string; icon: React.ElementType }> = {
      photos: { labelKey: 'photos_count', icon: GravityPictureIcon },
      videos: { labelKey: 'videos_count', icon: GravityVideoIcon },
      files: { labelKey: 'files_count', icon: GravityFileIcon },
      audio: { labelKey: 'audio_files_count', icon: GravityHeadphonesIcon },
      links: { labelKey: 'links_count', icon: GravityLinkIcon },
      voice: { labelKey: 'voice_messages_count', icon: GravityMicIcon },
      gif: { labelKey: 'gif_count', icon: GravityGifBadgeIcon },
    };

    for (const [key, { labelKey, icon }] of Object.entries(mapping)) {
      const type = key as MediaType;
      const count = mediaGroups[type]?.count ?? 0;
      if (count > 0) {
        sections.push({
          id: type,
          labelKey,
          icon,
          count,
        });
      }
    }
    return sections;
  }, [mediaGroups]);

  const handleChatClick = useCallback(() => {
    setActiveChat(chatId);
    onClose();
    window.dispatchEvent(new CustomEvent('orbita:scroll-to-bottom', { detail: { chatId } }));
  }, [chatId, setActiveChat, onClose]);

  const handleCallClick = useCallback(() => {
    if (chatId === 'notes') {
      alert(t('profile.calls_not_available') || 'Звонки недоступны для заметок');
      return;
    }
    if (!voiceCallsEnabled) {
      alert(t('settings.voice_calls_disabled') || 'Голосовые звонки отключены в настройках');
      return;
    }
    startCall(chatId, 'audio', myNickname);
  }, [voiceCallsEnabled, chatId, myNickname, startCall, t]);

  const handleSoundClick = useCallback(() => {
    setSoundAnimTrigger((prev) => prev + 1);
    toggleChatMuted(chatId);
  }, [chatId, toggleChatMuted]);

  const handleMediaClick = useCallback((clickedItem: MediaGridItem) => {
    if (!subTab) return;
    const allItems = mediaGroups[subTab]?.gridItems || [];
    const itemsList = filteredGridItems(allItems);
    const viewerItems: MediaViewerItem[] = itemsList.map((it, idx) => {
      const effectiveSecret = it.key || chat?.sharedSecret;
      const directUrl = getOrbitaMediaUrl(it.url, effectiveSecret, chat?.id, it.messageId, it.name) || undefined;
      return {
        id: it.id || String(idx),
        url: it.url,
        directUrl,
        chatId: chat?.id,
        type: it.type,
        name: it.name,
        sender: it.sender,
        time: it.time,
        messageId: it.messageId,
        duration: it.duration,
        caption: it.text,
        key: it.key,
        sharedSecret: effectiveSecret,
      };
    });
    const index = viewerItems.findIndex((it) => it.id === clickedItem.id || it.url === clickedItem.url);
    const initialIndex = index !== -1 ? index : 0;
    const orbita = (window as any).orbita;
    if (orbita?.openMediaWindow) {
      orbita.openMediaWindow({
        items: viewerItems,
        initialIndex,
        sharedSecret: chat?.sharedSecret,
        chatId: chat?.id,
      });
      return;
    }
    setViewerState({
      isOpen: true,
      items: viewerItems,
      initialIndex,
    });
  }, [subTab, mediaGroups, searchQuery, chat]);

  if (!chat) {
    return null;
  }

  const formatSubscribers = (count: number) => {
    const c = Math.max(1, count);
    const mod10 = c % 10;
    const mod100 = c % 100;
    if (mod10 === 1 && mod100 !== 11) return `${c} подписчик`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${c} подписчика`;
    return `${c} подписчиков`;
  };

  const statusText = (chatId === 'notes' || chat.type === 'bot')
    ? ''
    : chat.type === 'channel'
      ? formatSubscribers(chat.subscribersCount || 0)
      : chat.type === 'group'
        ? (() => {
            const total = chat.members?.length || chat.membersCount || 1;
            const online = Math.min(total, Math.max(1, chat.onlineCount || 1));
            return t('groupSettings.members_and_online', { count: total, online });
          })()
        : chat.online
          ? t('userStatus.online')
          : formatLastSeen(chat.lastSeen, t);

  const filteredMessages = (messagesList: Message[]) => {
    if (!searchQuery.trim()) return messagesList;
    const q = searchQuery.toLowerCase();
    return messagesList.filter(msg =>
      (msg.mediaName && msg.mediaName.toLowerCase().includes(q)) ||
      (msg.text && msg.text.toLowerCase().includes(q)) ||
      (msg.sender && msg.sender.toLowerCase().includes(q))
    );
  };

  const filteredGridItems = (items: MediaGridItem[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item =>
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.text && item.text.toLowerCase().includes(q)) ||
      (item.sender && item.sender.toLowerCase().includes(q))
    );
  };

  // Group MediaGridItem by Generalized Periods (Сегодня, Вчера, Август, Январь 2026...)
  const groupGridItemsByPeriod = (items: MediaGridItem[]) => {
    // Sort descending by time
    const sorted = [...items].sort((a, b) => b.time - a.time);
    const groupsMap = new Map<string, { key: string; title: string; orderScore: number; items: MediaGridItem[] }>();

    for (const item of sorted) {
      const period = formatPeriodHeader(item.time, i18n.language);
      if (!groupsMap.has(period.key)) {
        groupsMap.set(period.key, {
          key: period.key,
          title: period.title,
          orderScore: period.orderScore,
          items: [],
        });
      }
      groupsMap.get(period.key)!.items.push(item);
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.orderScore - a.orderScore);
  };

  // Group Messages by Generalized Periods (Сегодня, Вчера, Август, Январь 2026...)
  const groupMessagesByPeriod = (messagesList: Message[]) => {
    const sorted = [...messagesList].sort((a, b) => b.time - a.time);
    const groupsMap = new Map<string, { key: string; title: string; orderScore: number; messages: Message[] }>();

    for (const msg of sorted) {
      const period = formatPeriodHeader(msg.time, i18n.language);
      if (!groupsMap.has(period.key)) {
        groupsMap.set(period.key, {
          key: period.key,
          title: period.title,
          orderScore: period.orderScore,
          messages: [],
        });
      }
      groupsMap.get(period.key)!.messages.push(msg);
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.orderScore - a.orderScore);
  };

  const renderSubContent = (tab: MediaType) => {
    const group = mediaGroups[tab];
    if (!group || group.count === 0) {
      return (
        <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('profile.empty_section')}
        </div>
      );
    }

    const sharedSecret = chat.sharedSecret!;

    // GRID RENDERING FOR PHOTOS, VIDEOS, AND GIF
    if (tab === 'photos' || tab === 'videos' || tab === 'gif') {
      const allGridItems = group.gridItems || [];
      const itemsList = filteredGridItems(allGridItems);

      if (itemsList.length === 0) {
        return (
          <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('common.no_results')}
          </div>
        );
      }

      const periodGroups = groupGridItemsByPeriod(itemsList);

      return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px 0', boxSizing: 'border-box' }}>
          {periodGroups.map((pGroup, idx) => (
            <div key={pGroup.key} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* Period Header (Сегодня, Вчера, Август, Январь 2026...) */}
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-main, #ffffff)',
                  padding: idx === 0 ? '4px 0 8px' : '14px 0 8px',
                  letterSpacing: '0.1px',
                  userSelect: 'none',
                }}
              >
                {pGroup.title}
              </div>

              {/* 4-column Grid with Small Gap */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '3px',
                  width: '100%',
                }}
              >
                {pGroup.items.map((item) => (
                  <ProfileMediaGridTile
                    key={item.id}
                    item={item}
                    sharedSecret={sharedSecret}
                    type={tab}
                    isViewerOpen={viewerState.isOpen}
                    onMediaClick={handleMediaClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // LIST RENDERING FOR FILES, AUDIO, VOICE, LINKS
    const messagesList = filteredMessages(group.messages);

    if (messagesList.length === 0) {
      return (
        <div style={{ width: '100%', padding: '40px 16px', color: 'var(--text-dim)', fontSize: '14px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {t('common.no_results')}
        </div>
      );
    }

    const periodGroups = groupMessagesByPeriod(messagesList);

    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
        {periodGroups.map((pGroup, idx) => (
          <div key={pGroup.key} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {/* Period Header */}
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--text-main, #ffffff)',
                padding: idx === 0 ? '6px 16px 4px 16px' : '14px 16px 4px 16px',
                letterSpacing: '0.1px',
                userSelect: 'none',
              }}
            >
              {pGroup.title}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {pGroup.messages.map((msg) => {
                if (tab === 'files') {
                  return <ProfileFileListItem key={msg.id} msg={msg} sharedSecret={sharedSecret} i18nLang={i18n.language} />;
                }
                if (tab === 'audio') {
                  return <ProfileAudioListItem key={msg.id} msg={msg} sharedSecret={sharedSecret} i18nLang={i18n.language} />;
                }
                if (tab === 'voice') {
                  return <ProfileVoiceListItem key={msg.id} msg={msg} sharedSecret={sharedSecret} i18nLang={i18n.language} />;
                }
                if (tab === 'links') {
                  return <ProfileLinkListItem key={msg.id} msg={msg} onLinkClick={onLinkClick} />;
                }
                return null;
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMainContent = () => (
    <div
      style={{
        padding: '20px 0 24px',
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
        style={{ width: 96, height: 96, marginBottom: 10, marginTop: 0, cursor: chat.avatarUrl ? 'pointer' : 'default' }}
        onClick={() => {
          if (chat.avatarUrl) {
            const avatarItems = [{
              id: 'avatar',
              url: chat.avatarUrl,
              directUrl: chat.avatarUrl,
              type: 'photo' as const,
              name: `${chat.name || 'Avatar'}.jpg`,
              sender: chat.name,
              time: Date.now(),
            }];
            const orbita = (window as any).orbita;
            if (orbita?.openMediaWindow) {
              orbita.openMediaWindow({
                items: avatarItems,
                initialIndex: 0,
                sharedSecret: chat.sharedSecret,
                chatId: chat.id,
              });
              return;
            }
            setViewerState({
              isOpen: true,
              items: avatarItems,
              initialIndex: 0,
            });
          }
        }}
      >
        {chatId === 'notes' ? (
          <NotesAvatar className="w-24 h-24" />
        ) : (
          <Avatar
            src={chat.avatarUrl}
            alt={chat.name}
            className="w-24 h-24 rounded-full"
          />
        )}
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 2px', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-main)', textAlign: 'center', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {chat.type === 'bot' && (
              <BotIcon size={20} className="flex-shrink-0 text-[var(--accent-color)]" />
            )}
            {chatId === 'notes' ? t('connectModal.notes') : chat.name}
            {chat.type === 'bot' && (
              <VerifiedBadge size={18} className="flex-shrink-0" />
            )}
          </h3>
          <div style={{ position: 'absolute', left: 'calc(100% + 5px)', top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center' }}>
            <DeveloperBadge
              userId={chat.peerCode || (chat.name && chat.name.length === 36 ? chat.name : undefined) || (chatId !== 'notes' ? chatId : undefined)}
              size={34}
              onClick={triggerDevToast}
            />
          </div>
        </div>
      </div>
      {statusText && (
        <p
          style={{
            fontSize: '13px',
            color: (!isChannel && chatId !== 'notes' && chat.online) ? 'var(--accent-color)' : 'var(--text-dim)',
            fontWeight: (!isChannel && chatId !== 'notes' && chat.online) ? 600 : 400,
            textShadow: (!isChannel && chatId !== 'notes' && chat.online) ? '0 0 1.5px color-mix(in srgb, var(--accent-color) 30%, transparent)' : 'none',
            margin: '0 0 20px',
            padding: '0 20px',
            textAlign: 'center',
          }}
        >
          {statusText}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px', padding: '0 12px', width: '100%', boxSizing: 'border-box', flexWrap: 'wrap' }}>
        <button
          onClick={handleChatClick}
          aria-label={t('profile.chat')}
          style={{
            flex: '1 1 0',
            minWidth: '64px',
            maxWidth: '92px',
            height: '56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            background: 'var(--surface-container, #282828)',
            border: 'none',
            borderRadius: '12px',
            padding: '0',
            color: 'var(--text-main)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
            <path fill="var(--text-dim, #8e8e93)" stroke="var(--text-dim, #8e8e93)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 21a9 9 0 1 0-7.605-4.185L3 21l4.185-1.395A8.96 8.96 0 0 0 12 21"/>
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.chat')}</span>
        </button>


        <button
          onClick={handleSoundClick}
          aria-label={t('profile.sound')}
          style={{
            flex: '1 1 0',
            minWidth: '64px',
            maxWidth: '92px',
            height: '56px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            background: 'var(--surface-container, #282828)',
            border: 'none',
            borderRadius: '12px',
            padding: '0',
            color: 'var(--text-main)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <motion.div
            key={soundAnimTrigger}
            animate={
              soundAnimTrigger > 0
                ? {
                    scale: [0.85, 1.15, 1],
                    rotate: chat?.muted ? [-14, 14, 0] : [14, -14, 0],
                  }
                : { scale: 1, rotate: 0 }
            }
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {chat?.muted ? (
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none">
                <path
                  fill="var(--text-dim, #8e8e93)"
                  stroke="var(--text-dim, #8e8e93)"
                  strokeWidth="1.5"
                  d="M12 3.398a5 5 0 00-5 5v2c0 .758-.442 1.505-1.005 2.012A3 3 0 008 17.642h8a3 3 0 002.005-5.232C17.442 11.903 17 11.156 17 10.398v-2a5 5 0 00-5-5z"
                />
                <path
                  stroke="var(--text-dim, #8e8e93)"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                  d="M14.39 20.312l-.043.01a9.714 9.714 0 01-4.67-.01"
                />
                <path
                  stroke="var(--surface-container, #282828)"
                  strokeLinecap="round"
                  strokeWidth="3.5"
                  d="M19 5L5 19"
                />
                <path
                  stroke="var(--text-dim, #8e8e93)"
                  strokeLinecap="round"
                  strokeWidth="2"
                  d="M19 5L5 19"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="26" height="26" fill="none">
                <path
                  fill="var(--text-dim, #8e8e93)"
                  stroke="var(--text-dim, #8e8e93)"
                  strokeWidth="1.5"
                  d="M12 3.398a5 5 0 00-5 5v2c0 .758-.442 1.505-1.005 2.012A3 3 0 008 17.642h8a3 3 0 002.005-5.232C17.442 11.903 17 11.156 17 10.398v-2a5 5 0 00-5-5z"
                />
                <path
                  stroke="var(--text-dim, #8e8e93)"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                  d="M14.39 20.312l-.043.01a9.714 9.714 0 01-4.67-.01"
                />
              </svg>
            )}
          </motion.div>
          <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.sound')}</span>
        </button>

        {isGroup ? (
          isGroupAdmin ? (
            <>
              <button
                onClick={() => {
                  setGroupModalMode(isGroupOwner ? 'delete' : 'leave');
                  setIsDeleteGroupModalOpen(true);
                }}
                aria-label={t('common.delete', 'Удалить')}
                style={{
                  flex: '1 1 0',
                  minWidth: '60px',
                  maxWidth: '80px',
                  height: '56px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  background: 'var(--surface-container, #282828)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <Trash2 size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
                <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('common.delete', 'Удалить')}</span>
              </button>

              <button
                onClick={handleCallClick}
                disabled={!voiceCallsEnabled}
                aria-label={t('profile.call')}
                style={{
                  flex: '1 1 0',
                  minWidth: '60px',
                  maxWidth: '80px',
                  height: '56px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  background: 'var(--surface-container, #282828)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '0',
                  color: 'var(--text-main)',
                  cursor: !voiceCallsEnabled ? 'not-allowed' : 'pointer',
                  opacity: !voiceCallsEnabled ? 0.4 : 1,
                  outline: 'none',
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 42 42" fill="var(--text-dim, #8e8e93)">
                  <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
                </svg>
                <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.call')}</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setGroupModalMode('leave');
                setIsDeleteGroupModalOpen(true);
              }}
              aria-label={t('groupSettings.leave', 'Покинуть')}
              style={{
                flex: '1 1 0',
                minWidth: '60px',
                maxWidth: '80px',
                height: '56px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                background: 'var(--surface-container, #282828)',
                border: 'none',
                borderRadius: '12px',
                padding: '0',
                color: 'var(--text-main)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <LogOut size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
              <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('groupSettings.leave', 'Покинуть')}</span>
            </button>
          )
        ) : isChannel ? (
          <button
            onClick={handleCopyChannelKey}
            aria-label={copiedKey ? 'Скопирован' : 'Ключ'}
            style={{
              flex: '1 1 0',
              minWidth: '64px',
              maxWidth: '92px',
              height: '56px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'var(--surface-container, #282828)',
              border: 'none',
              borderRadius: '12px',
              padding: '0',
              color: 'var(--text-main)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {copiedKey ? (
              <Check size={20} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
            ) : (
              <Copy size={20} style={{ color: 'var(--text-dim, #8e8e93)' }} />
            )}
            <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{copiedKey ? t('profile.copied', 'Скопирован') : 'ID'}</span>
          </button>
        ) : (
          <button
            onClick={handleCallClick}
            disabled={!voiceCallsEnabled || chatId === 'notes'}
            aria-label={t('profile.call')}
            style={{
              flex: '1 1 0',
              minWidth: '64px',
              maxWidth: '92px',
              height: '56px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: 'var(--surface-container, #282828)',
              border: 'none',
              borderRadius: '12px',
              padding: '0',
              color: 'var(--text-main)',
              cursor: (!voiceCallsEnabled || chatId === 'notes') ? 'not-allowed' : 'pointer',
              opacity: (!voiceCallsEnabled || chatId === 'notes') ? 0.4 : 1,
              outline: 'none',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 42 42" fill="var(--text-dim, #8e8e93)">
              <path d="M15.562 20.766c-1.328-1.922-2.118-4.241-2.281-4.438c1.945-1.356 5.749-3.06 5.962-5.505c.271-3.159-5.081-9.763-6.107-9.823c-2.808.03-7.947 4.782-8.556 6.218c-1.132 2.969-.571 5.732 1.375 9.732c2.478 5.95 11.682 17.237 16.947 20.78c3.484 2.674 6.029 3.724 9.068 3.09c1.413-.268 6.516-4.455 7.027-7.286c.125-1.05-5.807-8.011-8.875-8.287c-2.382-.22-4.666 3.346-6.303 5.089c-.163-.208-1.559-1.297-3.057-3.021c-1.95-2.049-3.762-4.456-5.2-6.549" />
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.2 }}>{t('profile.call')}</span>
          </button>
        )}
      </div>

      {(isChannel || isGroup || Boolean(profileId) || Boolean(chat.description)) && (
        <div
          style={{
            backgroundColor: 'var(--md-surface, #211c2e)',
            width: '100%',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        >
          {isGroup ? (
            <>
              {chat.description ? (
                <div
                  onClick={isGroupAdmin ? () => setIsEditingChannel(true) : undefined}
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    cursor: isGroupAdmin ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                    {chat.description}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                    {t('channel.description', 'Описание')}
                  </div>
                </div>
              ) : isGroupAdmin ? (
                <div
                  onClick={() => setIsEditingChannel(true)}
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: '14px', color: 'var(--accent-color, #9b7dd4)' }}>
                    + {t('groupSettings.add_description', 'Добавить описание')}
                  </span>
                  <Pencil size={14} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
                </div>
              ) : null}

              <div
                onClick={() => {
                  navigator.clipboard.writeText(chat.id);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                style={{
                  padding: '12px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--accent-color, #9b7dd4)',
                      wordBreak: 'break-all',
                      lineHeight: 1.3,
                      fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                    }}
                  >
                    {chat.id}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                    {t('groupSettings.group_id', 'ID')}
                  </span>
                </div>
                <div style={{ flexShrink: 0, color: copiedKey ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim, #8e8e93)', display: 'flex', alignItems: 'center' }}>
                  {copiedKey ? <Check size={18} /> : <Copy size={18} />}
                </div>
              </div>

              <div
                style={{
                  padding: '12px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  onClick={() => {
                    const link = buildGroupInviteLink(chat.inviteCode || chat.id, chat.name, chat.creatorNickname);
                    navigator.clipboard.writeText(link);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 500,
                        color: chat.inviteActive === false ? 'var(--text-dim, #8e8e93)' : 'var(--accent-color, #9b7dd4)',
                        textDecoration: chat.inviteActive === false ? 'line-through' : 'none',
                        wordBreak: 'break-all',
                        lineHeight: 1.3,
                        fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                      }}
                    >
                      {buildGroupInviteLink(chat.inviteCode || chat.id, chat.name, chat.creatorNickname)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)' }}>
                        {t('groupSettings.invite_link', 'Ссылка-приглашение')}
                      </span>
                      {chat.inviteActive === false && (
                        <span style={{ fontSize: '10px', color: '#ff4d4f', fontWeight: 600 }}>
                          {t('groupSettings.link_revoked', 'Доступ закрыт')}
                        </span>
                      )}
                      {chat.inviteExpiresAt && chat.inviteExpiresAt < Date.now() && (
                        <span style={{ fontSize: '10px', color: '#ff4d4f', fontWeight: 600 }}>
                          {t('groupSettings.link_expired', 'Срок истек')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, color: copiedKey ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim, #8e8e93)', display: 'flex', alignItems: 'center' }}>
                    {copiedKey ? <Check size={18} /> : <Copy size={18} />}
                  </div>
                </div>

                {isGroupAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      aria-label={t('groupSettings.reset_link', 'Обновить ссылку')}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newCode = await groupService.resetInviteLink(chat.id);
                        if (newCode) {
                          useChatStore.getState().updateChat(chat.id, { inviteCode: newCode, inviteActive: true });
                        }
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--text-main, #ffffff)',
                        fontSize: '11.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <RefreshCw size={13} />
                      <span>{t('groupSettings.reset_link', 'Обновить ссылку')}</span>
                    </button>

                    <button
                      type="button"
                      aria-label={chat.inviteActive === false ? t('groupSettings.open_link', 'Открыть доступ') : t('groupSettings.close_link', 'Закрыть доступ')}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newActive = chat.inviteActive === false;
                        if (newActive) {
                          await groupService.enableInviteLink(chat.id);
                        } else {
                          await groupService.revokeInviteLink(chat.id);
                        }
                        useChatStore.getState().updateChat(chat.id, { inviteActive: newActive });
                      }}
                      style={{
                        padding: '6px 10px',
                        background: chat.inviteActive === false ? 'rgba(155, 125, 212, 0.15)' : 'rgba(255, 77, 79, 0.1)',
                        border: 'none',
                        borderRadius: '8px',
                        color: chat.inviteActive === false ? 'var(--accent-color, #9b7dd4)' : '#ff4d4f',
                        fontSize: '11.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      {chat.inviteActive === false ? <Unlock size={13} /> : <Lock size={13} />}
                      <span>{chat.inviteActive === false ? t('groupSettings.open_link', 'Открыть доступ') : t('groupSettings.close_link', 'Закрыть доступ')}</span>
                    </button>

                    <button
                      type="button"
                      aria-label={t('groupSettings.expire_action', 'Срок действия')}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const nextDur = !chat.inviteExpiresAt ? 86400000 : (chat.inviteExpiresAt - Date.now() > 3600000 * 20 ? 3600000 : null);
                        const exp = nextDur ? Date.now() + nextDur : null;
                        await groupService.setInviteExpiration(chat.id, exp);
                        useChatStore.getState().updateChat(chat.id, { inviteExpiresAt: exp });
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'var(--text-main, #ffffff)',
                        fontSize: '11.5px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                    >
                      <Clock size={13} />
                      <span>
                        {!chat.inviteExpiresAt
                          ? t('groupSettings.expire_never', 'Бессрочно')
                          : chat.inviteExpiresAt - Date.now() > 3600000 * 2
                            ? t('groupSettings.expire_24h', '24 часа')
                            : t('groupSettings.expire_1h', '1 час')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : isChannel ? (
            chat.description ? (
              <div
                onClick={isChannelOwner ? () => setIsEditingChannel(true) : undefined}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: isChannelOwner ? 'pointer' : 'default',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                  {chat.description}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                  {t('channel.description', 'Описание')}
                </div>
              </div>
            ) : isChannelOwner ? (
              <div
                onClick={() => setIsEditingChannel(true)}
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '14px', color: 'var(--accent-color, #9b7dd4)' }}>
                  + {t('channel.add_description', 'Добавить описание')}
                </span>
                <Pencil size={14} style={{ color: 'var(--accent-color, #9b7dd4)' }} />
              </div>
            ) : null
          ) : chat.description ? (
            <div
              style={{
                padding: '12px 20px',
                borderBottom: profileId ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '14px', color: 'var(--text-main, #ffffff)', lineHeight: '1.35', wordBreak: 'break-word', userSelect: 'text' }}>
                {chat.description}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                {t('profile.bio', 'О себе')}
              </div>
            </div>
          ) : null}

          {!isGroup && profileId ? (
            <div
              onClick={() => handleCopyChannelKey(profileId)}
              style={{
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--accent-color, #9b7dd4)',
                    wordBreak: 'break-all',
                    lineHeight: 1.3,
                    fontFamily: '"JetBrains Mono", Consolas, Menlo, monospace',
                  }}
                >
                  {formattedProfileId}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim, #8e8e93)', marginTop: '3px' }}>
                  ID
                </span>
              </div>
              <div style={{ flexShrink: 0, color: copiedKey ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim, #8e8e93)', display: 'flex', alignItems: 'center' }}>
                {copiedKey ? <Check size={18} /> : <Copy size={18} />}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {isGroup && (
        <div
          style={{
            backgroundColor: 'var(--md-surface, #211c2e)',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              padding: '12px 20px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                {t('groupSettings.participants', 'Участники')}
              </span>
            </div>
            {isGroupAdmin && (chat.members?.length || 1) < 10 && (
              <button
                type="button"
                onClick={() => setIsAddMemberModalOpen(true)}
                aria-label={t('groupSettings.add_member', 'Добавить участника')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #9b7dd4)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  borderRadius: '6px',
                }}
              >
                <UserPlus size={15} />
                <span>{t('common.add', 'Добавить')}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(chat.members || []).map((member, index) => {
              const isMemberOwner = member.role === 'owner';
              const isMemberAdmin = member.role === 'admin';
              const memberCode = member.userId || (member as any).userCode;
              const currentCode = useChatStore.getState().myCode;
              const myAuthUserId = useAuthStore.getState().userId;
              const myAvatarUrl = useAuthStore.getState().avatarUrl;
              const isSelf = Boolean(
                (memberCode && currentCode && memberCode === currentCode) ||
                (memberCode && myUserId && memberCode === myUserId) ||
                (memberCode && myAuthUserId && memberCode === myAuthUserId) ||
                (member.nickname === myNickname)
              );
              const effectiveAvatar = (isSelf && myAvatarUrl)
                ? myAvatarUrl
                : (member.avatarUrl || (memberCode ? memberAvatars[memberCode] : null));
              const isMemberOnline = isSelf ||
                Boolean(chat.onlineCount && chat.members && chat.onlineCount >= chat.members.length) ||
                Boolean(chat.onlineMemberIds && (
                  (memberCode && chat.onlineMemberIds.includes(memberCode)) ||
                  (member.userId && chat.onlineMemberIds.includes(member.userId)) ||
                  ((member as any).userCode && chat.onlineMemberIds.includes((member as any).userCode)) ||
                  (member.nickname && chat.onlineMemberIds.includes(member.nickname))
                ));

              return (
                <div
                  key={memberCode || `${member.nickname}_${index}`}
                  style={{
                    padding: '10px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <Avatar
                      src={effectiveAvatar}
                      alt={member.nickname}
                      className="w-9 h-9 rounded-full flex-shrink-0"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span className="truncate" style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-main)' }}>
                        {member.nickname}
                      </span>
                      <span style={{ fontSize: '11px', color: isMemberOnline ? 'var(--accent-color, #9b7dd4)' : 'var(--text-dim)' }}>
                        {isMemberOnline ? t('userStatus.online', 'в сети') : (member.lastSeen ? formatLastSeen(member.lastSeen, t) : t('userStatus.offline', 'был(а) недавно'))}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
                    {isMemberOwner ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          backgroundColor: 'rgba(155, 125, 212, 0.18)',
                          color: 'var(--accent-color, #9b7dd4)',
                          userSelect: 'none',
                        }}
                      >
                        {t('groupSettings.owner', 'владелец').toLowerCase()}
                      </span>
                    ) : isMemberAdmin ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          backgroundColor: 'rgba(59, 130, 246, 0.18)',
                          color: '#60a5fa',
                          userSelect: 'none',
                        }}
                      >
                        {t('groupSettings.admin', 'админ').toLowerCase()}
                      </span>
                    ) : null}

                    {isGroupAdmin && !isMemberOwner && !isSelf && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isGroupOwner && (
                        <button
                          type="button"
                          onClick={async () => {
                            const newRole = isMemberAdmin ? 'member' : 'admin';
                            await groupService.updateMemberRole(chat.id, member.nickname, newRole, memberCode, myNickname);
                            const updatedMembers = (chat.members || []).map((m: any) => {
                              const mCode = m.userId || m.userCode;
                              const isTarget = memberCode && mCode ? mCode === memberCode : m.nickname === member.nickname;
                              return isTarget ? { ...m, role: newRole as any } : m;
                            });
                            updateChat(chat.id, { members: updatedMembers });
                          }}
                          aria-label={isMemberAdmin ? t('groupSettings.demote', 'Снять права') : t('groupSettings.promote', 'Назначить админом')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isMemberAdmin ? 'var(--text-dim)' : 'var(--accent-color, #9b7dd4)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          className="hover:bg-white/10 transition-colors"
                        >
                          <ShieldCheck size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`${t('groupSettings.kick', 'Исключить')} ${member.nickname}?`)) {
                            await groupService.kickMember(chat.id, member.nickname, myNickname, memberCode);
                            const updatedMembers = (chat.members || []).filter((m: any) => {
                              const mCode = m.userId || m.userCode;
                              if (memberCode && mCode) return mCode !== memberCode;
                              return m.nickname !== member.nickname;
                            });
                            updateChat(chat.id, {
                              members: updatedMembers,
                              membersCount: Math.max(1, (chat.membersCount || updatedMembers.length + 1) - 1),
                            });
                          }
                        }}
                        aria-label={t('groupSettings.kick', 'Исключить')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className="hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isGroup && isGroupOwner && (
        <div
          style={{
            width: '100%',
            padding: '0 16px',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setGroupModalMode('delete');
              setIsDeleteGroupModalOpen(true);
            }}
            aria-label={t('groupSettings.delete_group', 'Удалить группу')}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.15s',
            }}
            className="hover:bg-red-500/20"
          >
            <Trash2 size={16} />
            <span>{t('groupSettings.delete_group', 'Удалить группу')}</span>
          </button>
        </div>
      )}

      {availableSections.length > 0 && (
        <div style={{
          backgroundColor: 'var(--md-surface, #211c2e)',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          margin: 0,
          padding: '4px 0',
          boxSizing: 'border-box',
        }}>
          {availableSections.map((section) => {
            const Icon = section.icon;
            const countLabel = t(`profile.${section.labelKey}`, { count: section.count });
            return (
              <button
                key={section.id}
                onClick={() => {
                  setSearchQuery('');
                  setSubTab(section.id);
                }}
                aria-label={countLabel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: 0,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  justifyContent: 'flex-start',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon width={22} height={22} style={{ color: 'var(--text-dim, #9CA3AF)', flexShrink: 0 }} />
                <span style={{ fontSize: '14.5px', fontWeight: 400, textAlign: 'left' }}>{countLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSubTab = () => {
    if (!subTab) return null;
    const getSectionTitle = () => {
      if (subTab === 'photos') return t('profile.photos');
      if (subTab === 'videos') return t('profile.videos');
      if (subTab === 'files') return t('profile.files');
      if (subTab === 'audio') return t('profile.audio_files');
      if (subTab === 'voice') return t('profile.voice_messages');
      if (subTab === 'links') return t('profile.links');
      if (subTab === 'gif') return t('profile.gif');
      return '';
    };

    const hasSearch = subTab === 'audio' || subTab === 'links' || subTab === 'files';

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          width: '100%',
          height: '100%',
          minHeight: 0,
          flex: 1,
        }}
      >
        {/* Header with Back Chevron, Title, and More */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 10px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => setSubTab(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '4px',
                margin: '-4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 22L6 12L16 2l1.775 1.775L9.55 12l8.225 8.225z" />
              </svg>
            </button>
            <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>{getSectionTitle()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginRight: '36px' }}>
            {(subTab === 'photos' || subTab === 'videos') && (
              <button
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
                }}
                className="hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Options"
              >
                <MoreVertical size={19} />
              </button>
            )}
          </div>
        </div>

        {hasSearch && (
          <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('profile.search_placeholder') || 'Поиск'}
                className="w-full pl-10 pr-4 text-[var(--text-main)] text-[13.5px] outline-none border-none focus:outline-none focus:ring-0 transition-colors placeholder:text-[var(--text-dim)]"
                style={{
                  width: '100%',
                  height: '36px',
                  borderRadius: '999px',
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  backgroundColor: 'var(--md-surface, var(--surface-container, rgba(255,255,255,0.05)))',
                  color: 'var(--text-main, #e0e0e0)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}

        {/* Scrollable Container strictly ONLY for media items list below search */}
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
          onMouseMove={triggerSubTabActive}
          onMouseEnter={triggerSubTabActive}
          onMouseLeave={handleSubTabMouseLeave}
        >
          <div
            ref={subTabScrollRef}
            onScroll={triggerSubTabActive}
            className="chat-list-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: '24px',
            }}
          >
            {renderSubContent(subTab)}
          </div>

          {subTabThumb && (
            <>
              <div
                className="overlay-scroll-track"
                onMouseDown={(e) => handleScrollbarTrackMouseDown(e, subTabScrollRef.current)}
                style={{
                  top: '2px',
                  bottom: '6px',
                  opacity: isSubTabActive ? 1 : 0,
                }}
              />
              <div
                className="overlay-scroll-thumb"
                onMouseDown={(e) => handleScrollbarThumbMouseDown(e, subTabScrollRef.current)}
                style={{
                  top: subTabThumb.top + 2,
                  height: subTabThumb.height,
                  opacity: isSubTabActive ? 1 : 0,
                }}
              />
            </>
          )}
        </div>
      </div>
    );
  };

  const renderEditChannel = () => (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '24px 20px 32px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', width: '100%' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('channel.change_avatar', 'Изменить аватарку')}
          style={{
            width: '74px',
            height: '74px',
            borderRadius: '50%',
            backgroundColor: '#3B82F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {editAvatarUrl ? (
            <>
              <img src={editAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color="#ffffff" />
              </div>
            </>
          ) : (
            <Camera size={30} color="#ffffff" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleAvatarFileChange}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <span style={{ fontSize: '12px', color: 'var(--accent-color, #7C3AED)', fontWeight: 500, marginBottom: '2px' }}>
            {isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name', 'Название канала')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid var(--accent-color, #7C3AED)', paddingBottom: '4px' }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name_placeholder', 'Название')}
              aria-label={isGroup ? t('groupSettings.group_name', 'Название группы') : t('channel.channel_name', 'Название канала')}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main, #ffffff)',
                fontSize: '15px',
                padding: 0,
              }}
            />
            <button
              ref={emojiBtnRef}
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              aria-label={t('emojiPicker.emojis', 'Эмодзи')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim, #8e8e93)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Smile size={20} />
            </button>
          </div>
          {showEmojiPicker && (
            <div
              style={{ position: 'absolute', right: 0, top: '100%', zIndex: 999999, marginTop: '8px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiPicker
                onSelect={(emoji: string) => {
                  setEditName((prev) => prev + emoji);
                }}
                onClose={() => setShowEmojiPicker(false)}
                anchorEl={emojiBtnRef.current}
                recentEmojis={[]}
                onRecentUpdate={() => {}}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: '28px', width: '100%' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-dim, #8e8e93)', marginBottom: '6px' }}>
          {isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
        </span>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder={isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
          aria-label={isGroup ? t('groupSettings.group_desc', 'Описание группы') : t('channel.description_optional', 'Описание (необязательно)')}
          rows={3}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--surface-border, rgba(255, 255, 255, 0.15))',
            color: 'var(--text-main, #ffffff)',
            fontSize: '14px',
            lineHeight: '1.4',
            resize: 'none',
            outline: 'none',
            padding: '6px 0',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <AvatarCropperModal
        isOpen={cropperModalOpen}
        imageSrc={cropperImageSrc}
        onClose={() => {
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
        onSave={(dataUrl) => {
          setEditAvatarUrl(dataUrl);
          setCropperModalOpen(false);
          setCropperImageSrc(null);
        }}
      />
    </div>
  );

  return (
    <>
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
              : (isEditingChannel || subTab !== null)
              ? (typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.85, 750) : 750)
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
          {isEditingChannel ? (
            <div
              style={{
                width: '100%',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                boxSizing: 'border-box',
                borderBottom: '1px solid var(--surface-border, rgba(255,255,255,0.06))',
                flexShrink: 0,
                zIndex: 30,
              }}
            >
              <button
                type="button"
                onClick={() => setIsEditingChannel(false)}
                aria-label={t('common.back', 'Назад')}
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
                <ArrowLeft size={20} />
              </button>

              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>
                {isGroup ? t('groupSettings.edit_group', 'Редактировать группу') : t('channel.edit_channel', 'Редактировать канал')}
              </span>

              <button
                type="button"
                onClick={handleSaveChannel}
                disabled={isSavingChannel || !editName.trim()}
                aria-label={t('channel.save', 'Сохранить')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color, #7C3AED)',
                  cursor: (isSavingChannel || !editName.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (isSavingChannel || !editName.trim()) ? 0.5 : 1,
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  outline: 'none',
                  transition: 'background 150ms',
                }}
                onMouseEnter={(e) => {
                  if (!isSavingChannel && editName.trim()) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {isSavingChannel ? <MD3CircularSpinner size="small" /> : <Check size={20} />}
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
              {(isChannelOwner || isGroupAdmin) && (
                <button
                  type="button"
                  onClick={() => setIsEditingChannel(true)}
                  aria-label={isGroup ? t('groupSettings.edit_group', 'Редактировать группу') : t('channel.edit_channel', 'Редактировать канал')}
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
                  <Pencil size={18} />
                </button>
              )}

              {!isMobileView && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close', 'Закрыть')}
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
              )}
            </div>
          )}

          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              flex: 1,
              overflow: 'hidden',
            }}
            onMouseMove={triggerProfileActive}
            onMouseEnter={triggerProfileActive}
            onMouseLeave={handleProfileMouseLeave}
          >
            <div
              ref={profileScrollRef}
              onScroll={triggerProfileActive}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                flex: 1,
                overflowY: subTab !== null ? 'hidden' : 'auto',
                overflowX: 'hidden',
              }}
              className="chat-list-scrollbar"
            >
              <div
                ref={innerContentRef}
                style={{
                  width: '100%',
                  height: subTab !== null ? '100%' : 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  flex: subTab !== null ? 1 : 'none',
                }}
              >
                {isEditingChannel ? renderEditChannel() : subTab !== null ? renderSubTab() : renderMainContent()}
              </div>
            </div>

            {subTab === null && !isEditingChannel && profileThumb && (
              <>
                <div
                  className="overlay-scroll-track"
                  onMouseDown={(e) => handleScrollbarTrackMouseDown(e, profileScrollRef.current)}
                  style={{
                    top: '6px',
                    bottom: '6px',
                    opacity: isProfileActive ? 1 : 0,
                  }}
                />
                <div
                  className="overlay-scroll-thumb"
                  onMouseDown={(e) => handleScrollbarThumbMouseDown(e, profileScrollRef.current)}
                  style={{
                    top: profileThumb.top + 6,
                    height: profileThumb.height,
                    opacity: isProfileActive ? 1 : 0,
                  }}
                />
              </>
            )}
          </div>

          <DeveloperToast isOpen={devToastOpen} nickname={chat?.name} />
        </motion.div>
      </div>

      {/* Fullscreen Telegram-style Media Viewer for Photos, Videos, GIFs */}
      {viewerState.isOpen && (
        <TelegramMediaViewer
          isOpen={viewerState.isOpen}
          items={viewerState.items}
          initialIndex={viewerState.initialIndex}
          sharedSecret={chat.sharedSecret}
          showCarouselAlways={true}
          onClose={() => setViewerState((prev) => ({ ...prev, isOpen: false }))}
        />
      )}

      {isGroup && chat && (
        <AddGroupMemberModal
          isOpen={isAddMemberModalOpen}
          onClose={() => setIsAddMemberModalOpen(false)}
          group={chat}
        />
      )}

      {isGroup && (
        <DeleteGroupModal
          isOpen={isDeleteGroupModalOpen}
          onClose={() => setIsDeleteGroupModalOpen(false)}
          onConfirm={handleConfirmGroupAction}
          mode={groupModalMode}
        />
      )}
    </>
  );
});