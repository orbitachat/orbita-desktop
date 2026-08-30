import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '../../store/useChatStore';
import { useAudioStore, Track } from '../../store/useAudioStore';
import { useTranslation } from 'react-i18next';
import { useDecryptedMedia } from '../../lib/media-utils';
import { AudioCoverWithPlay } from './AudioCoverWithPlay';
import { useShallow } from 'zustand/react/shallow';

interface AudioQueueMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
}

interface AudioItemProps {
  msg: any;
  isCurrent: boolean;
  isPlayingTrack: boolean;
  sharedSecret?: string;
  isVoiceSection?: boolean;
  onTrackClick: (msg: any) => void;
}

const AudioItem: React.FC<AudioItemProps> = ({ msg, isCurrent, isPlayingTrack, sharedSecret, isVoiceSection, onTrackClick }) => {
  const { t } = useTranslation();
  const effectiveSecret = msg.mediaKey || sharedSecret;
  const { blobUrl } = useDecryptedMedia(msg.mediaUrl, effectiveSecret, msg.mediaName);

  const globalStoreDuration = useAudioStore((s) => (isCurrent ? s.duration : 0));
  const currentTime = useAudioStore((s) => s.currentTime);

  const [cover, setCover] = useState<string | null>(msg.audioMetadata?.cover || null);
  const [duration, setDuration] = useState<number>(() => {
    return msg.audioMetadata?.duration || msg.duration || (isCurrent && globalStoreDuration > 0 ? globalStoreDuration : 0);
  });

  const isVoice = Boolean(
    isVoiceSection ||
    msg.mediaType === 'voice' ||
    msg.audioMetadata?.title === 'Voice Message' ||
    msg.mediaName?.startsWith('voice_')
  );

  useEffect(() => {
    if (msg.audioMetadata?.duration) {
      setDuration(msg.audioMetadata.duration);
    } else if (msg.duration) {
      setDuration(msg.duration);
    } else if (isCurrent && globalStoreDuration > 0) {
      setDuration(globalStoreDuration);
    }
  }, [msg.audioMetadata?.duration, msg.duration, isCurrent, globalStoreDuration]);

  useEffect(() => {
    if (!blobUrl) return;
    let cancelled = false;

    if (!cover && !isVoice && typeof window.jsmediatags !== 'undefined') {
      try {
        fetch(blobUrl)
          .then((res) => res.blob())
          .then((blob) => {
            if (cancelled) return;
            window.jsmediatags.read(blob, {
              onSuccess: (tag: any) => {
                if (cancelled) return;
                const picture = tag.tags.picture;
                if (picture) {
                  let binary = '';
                  for (let i = 0; i < picture.data.length; i++) {
                    binary += String.fromCharCode(picture.data[i]);
                  }
                  const coverData = `data:${picture.format};base64,${window.btoa(binary)}`;
                  setCover(coverData);
                }
              },
              onError: () => { },
            });
          })
          .catch(() => { });
      } catch { }
    }

    if (duration === 0) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = blobUrl;
      const onMetadata = () => {
        if (!cancelled && audio.duration && isFinite(audio.duration)) {
          setDuration(Math.round(audio.duration));
        }
      };
      audio.addEventListener('loadedmetadata', onMetadata);
      audio.addEventListener('durationchange', onMetadata);
      audio.addEventListener('canplay', onMetadata);
      audio.load();

      return () => {
        cancelled = true;
        audio.removeEventListener('loadedmetadata', onMetadata);
        audio.removeEventListener('durationchange', onMetadata);
        audio.removeEventListener('canplay', onMetadata);
        audio.src = '';
      };
    }

    return () => {
      cancelled = true;
    };
  }, [blobUrl, cover, duration, isVoice]);

  let title = msg.audioMetadata?.title || msg.mediaName || (isVoice ? t('chatWindow.voice_message', 'Голосовое сообщение') : t('chatWindow.audio', 'Аудио'));
  let artist = msg.audioMetadata?.artist || '';

  if (isVoice) {
    if (msg.sender) {
      artist = msg.sender;
    }
    if (title.startsWith('voice_') || title === 'Voice Message' || title === 'Голосовое сообщение') {
      title = t('chatWindow.voice_message', 'Голосовое сообщение');
    }
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const effectiveDuration = duration > 0 ? duration : (isCurrent && globalStoreDuration > 0 ? globalStoreDuration : 0);

  let timeDisplay: string;
  if (isCurrent) {
    const current = isFinite(currentTime) ? currentTime : 0;
    timeDisplay = `${formatTime(current)} / ${formatTime(effectiveDuration)}`;
  } else {
    timeDisplay = formatTime(effectiveDuration);
  }

  return (
    <div
      className="audio-queue-item"
      onClick={(e) => {
        e.stopPropagation();
        onTrackClick(msg);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 14px',
        cursor: 'pointer',
        color: 'var(--text-main)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <AudioCoverWithPlay cover={cover} isPlayingTrack={isPlayingTrack} size={40} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--text-main)',
          }}
        >
          {artist ? `${artist} – ${title}` : title}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          {timeDisplay}
        </div>
      </div>
    </div>
  );
};

export const AudioQueueMenu: React.FC<AudioQueueMenuProps> = ({ position, onClose }) => {
  const { t } = useTranslation();
  const activeChatId = useChatStore((s) => s.activeChatId);
  const chats = useChatStore((s) => s.chats);
  const messagesByChatId = useChatStore(useShallow((s) => s.messagesByChatId));

  const currentTrack = useAudioStore((s) => s.currentTrack);
  const queue = useAudioStore((s) => s.queue);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const effectiveChatId = activeChatId || currentTrack?.chatId || null;
  const targetChat = useMemo(() => chats.find(c => c.id === effectiveChatId), [chats, effectiveChatId]);
  const sharedSecret = targetChat?.sharedSecret || currentTrack?.sharedSecret || '';

  const isVoice = Boolean(
    currentTrack?.mediaType === 'voice' ||
    currentTrack?.message?.mediaType === 'voice' ||
    currentTrack?.title === 'Voice Message' ||
    currentTrack?.title === 'Голосовое сообщение' ||
    currentTrack?.title?.startsWith('voice_') ||
    currentTrack?.url?.includes('voice_')
  );
  const targetMediaType: 'audio' | 'voice' = isVoice ? 'voice' : 'audio';

  const audioMessages = useMemo(() => {
    const messages = effectiveChatId ? messagesByChatId[effectiveChatId] || [] : [];
    const list: any[] = [];

    messages.forEach((msg) => {
      if (msg.mediaItems && msg.mediaItems.length > 0) {
        msg.mediaItems.forEach((item, idx) => {
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

          if (isVoice && itemIsVoice) {
            list.push({
              ...msg,
              id: `${msg.id || msg.time}_audio_${idx}`,
              mediaUrl: item.url,
              mediaName: item.name || 'Voice Message',
              mime: item.mime,
              duration: item.duration,
              mediaKey: item.key || msg.mediaKey,
              mediaType: 'voice',
              audioMetadata: {
                title: item.name?.replace(/\.[^.]+$/, '') || 'Voice Message',
                artist: msg.sender || '',
                duration: item.duration,
                cover: null,
              },
            });
          } else if (!isVoice && itemIsAudio) {
            list.push({
              ...msg,
              id: `${msg.id || msg.time}_audio_${idx}`,
              mediaUrl: item.url,
              mediaName: item.name || 'Audio',
              mime: item.mime,
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
          }
        });
      } else if (msg.mediaUrl) {
        const msgIsVoice =
          msg.mediaType === 'voice' ||
          msg.audioMetadata?.title === 'Voice Message' ||
          msg.audioMetadata?.title === 'Голосовое сообщение' ||
          msg.mediaName?.startsWith('voice_') ||
          msg.mediaUrl?.includes('voice_');

        if (isVoice && msgIsVoice) {
          list.push(msg);
        } else if (!isVoice && !msgIsVoice && msg.mediaType === 'audio') {
          list.push(msg);
        }
      }
    });

    if (list.length > 0) return list;

    if (queue.length > 0) {
      const filteredQueue = queue.filter((t) => {
        const itemIsVoice = Boolean(
          t.mediaType === 'voice' ||
          t.message?.mediaType === 'voice' ||
          t.title === 'Voice Message' ||
          t.title === 'Голосовое сообщение' ||
          t.title?.startsWith('voice_') ||
          t.url?.includes('voice_')
        );
        return isVoice ? itemIsVoice : !itemIsVoice;
      });

      if (filteredQueue.length > 0) {
        return filteredQueue.map((track) => ({
          id: track.id,
          mediaUrl: track.url,
          mediaName: track.title,
          mediaType: targetMediaType,
          audioMetadata: {
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            cover: track.cover,
          },
          ...track.message,
        }));
      }
    }

    if (currentTrack) {
      return [{
        id: currentTrack.id,
        mediaUrl: currentTrack.url,
        mediaName: currentTrack.title,
        mediaType: targetMediaType,
        audioMetadata: {
          title: currentTrack.title,
          artist: currentTrack.artist,
          duration: currentTrack.duration,
          cover: currentTrack.cover,
        },
        ...currentTrack.message,
      }];
    }

    return [];
  }, [effectiveChatId, messagesByChatId, queue, currentTrack, isVoice, targetMediaType]);

  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const menuStyle = useMemo(() => {
    const MAX_WIDTH = 320;
    const MIN_WIDTH = 200;
    const MENU_HEIGHT = 300;
    const HORIZONTAL_MARGIN = 10;
    const VERTICAL_MARGIN = 10;

    const availableWidth = window.innerWidth - HORIZONTAL_MARGIN * 2;
    const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, availableWidth));

    let left = position.x;
    let top = position.y;

    if (left + width > window.innerWidth - HORIZONTAL_MARGIN) {
      left = window.innerWidth - width - HORIZONTAL_MARGIN;
    }
    if (top + MENU_HEIGHT > window.innerHeight - VERTICAL_MARGIN) {
      top = window.innerHeight - MENU_HEIGHT - VERTICAL_MARGIN;
    }
    if (left < HORIZONTAL_MARGIN) left = HORIZONTAL_MARGIN;
    if (top < VERTICAL_MARGIN) top = VERTICAL_MARGIN;

    return { left, top, width };
  }, [position]);

  const handleTrackClick = (msg: any) => {
    const title = msg.audioMetadata?.title || msg.mediaName || (isVoice ? t('chatWindow.voice_message', 'Голосовое сообщение') : t('chatWindow.audio', 'Аудио'));
    const artist = msg.audioMetadata?.artist || (isVoice ? (msg.sender || '') : '');
    const duration = msg.audioMetadata?.duration || msg.duration || 0;
    const url = msg.mediaUrl;
    const secret = sharedSecret || currentTrack?.sharedSecret;

    if (!url) return;

    const track: Track = {
      id: msg.id || `track_${Date.now()}`,
      chatId: effectiveChatId || currentTrack?.chatId || '',
      title,
      artist,
      duration,
      cover: msg.audioMetadata?.cover || null,
      url,
      sharedSecret: secret || '',
      mediaType: targetMediaType,
      message: msg,
    };

    if (currentTrack?.id === track.id) {
      if (isPlaying) useAudioStore.getState().pause();
      else useAudioStore.getState().play();
      return;
    }

    useAudioStore.getState().addToQueue(track);
    useAudioStore.getState().play(track);
  };

  const [renderedCount, setRenderedCount] = useState(25);

  const visibleAudioMessages = useMemo(() => {
    return audioMessages.slice(0, renderedCount);
  }, [audioMessages, renderedCount]);

  const unrenderedBottomCount = audioMessages.length - visibleAudioMessages.length;
  const virtualBottomHeight = unrenderedBottomCount > 0 ? unrenderedBottomCount * 48 : 0;

  const TRACK_INSET = 6;

  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  const updateThumb = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null);
      return;
    }

    const trackHeight = clientHeight - TRACK_INSET * 2;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - thumbHeight;
    const scrollableDistance = scrollHeight - clientHeight;
    const ratio = scrollableDistance > 0 ? scrollTop / scrollableDistance : 0;

    setThumb({ top: maxTop * ratio, height: thumbHeight });
  };

  useEffect(() => {
    updateThumb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAudioMessages.length, virtualBottomHeight]);

  const [isAudioMenuHovered, setIsAudioMenuHovered] = useState(false);
  const [isAudioMenuScrolling, setIsAudioMenuScrolling] = useState(false);
  const audioMenuScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMenuScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    updateThumb();
    setIsAudioMenuScrolling(true);
    if (audioMenuScrollTimerRef.current) clearTimeout(audioMenuScrollTimerRef.current);
    audioMenuScrollTimerRef.current = setTimeout(() => {
      setIsAudioMenuScrolling(false);
    }, 500);

    const renderedHeight = renderedCount * 48;
    if (el.scrollTop + el.clientHeight >= renderedHeight - 200) {
      if (renderedCount < audioMessages.length) {
        setRenderedCount((prev) => Math.min(audioMessages.length, prev + 25));
      }
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      onMouseEnter={() => setIsAudioMenuHovered(true)}
      onMouseLeave={() => setIsAudioMenuHovered(false)}
      className="audio-queue-menu select-none"
      style={{
        position: 'fixed',
        left: menuStyle.left,
        top: menuStyle.top,
        width: menuStyle.width,
        maxHeight: '320px',
        backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 12%, var(--bg-secondary, #1a1625))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: 'none',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
        zIndex: 1000,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .audio-queue-menu,
        .audio-queue-menu * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
        }

        .audio-queue-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .audio-queue-scroll::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .audio-queue-item {
          transition: background-color 0.15s ease;
          background-color: transparent;
        }

        .audio-queue-item:hover {
          background-color: rgba(135, 116, 225, 0.14);
        }
      `}</style>

      <div
        ref={scrollRef}
        onScroll={handleMenuScroll}
        className="audio-queue-scroll"
        style={{
          maxHeight: '320px',
          overflowY: 'scroll',
          overflowX: 'hidden',
          padding: '6px 0',
        }}
      >
        {audioMessages.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            {isVoice
              ? t('chatWindow.no_voice_messages', 'Нет голосовых сообщений')
              : t('chatWindow.no_audio_messages', 'Нет аудиосообщений')}
          </div>
        ) : (
          <>
            {visibleAudioMessages.map((msg) => {
              const isCurrent = currentTrack?.id === msg.id;
              const isPlayingTrack = isCurrent && isPlaying;
              return (
                <AudioItem
                  key={msg.id}
                  msg={msg}
                  isCurrent={isCurrent}
                  isPlayingTrack={isPlayingTrack}
                  sharedSecret={sharedSecret}
                  isVoiceSection={isVoice}
                  onTrackClick={handleTrackClick}
                />
              );
            })}
            {virtualBottomHeight > 0 && (
              <div style={{ height: `${virtualBottomHeight}px`, flexShrink: 0 }} />
            )}
          </>
        )}
      </div>

      {thumb && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            bottom: '6px',
            right: '2px',
            width: '4px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            pointerEvents: 'none',
            opacity: (isAudioMenuHovered || isAudioMenuScrolling) ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}

      {thumb && (
        <div
          style={{
            position: 'absolute',
            top: thumb.top + 6,
            right: '2px',
            width: '4px',
            height: thumb.height,
            borderRadius: '9999px',
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
            pointerEvents: 'none',
            opacity: (isAudioMenuHovered || isAudioMenuScrolling) ? 1 : 0,
            transition: 'opacity 0.2s ease, background-color 0.15s ease',
          }}
        />
      )}
    </div>,
    document.body
  );
};