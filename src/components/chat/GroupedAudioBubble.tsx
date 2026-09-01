import { memo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaItem, Message } from '../../store/useChatStore';
import { useAudioStore } from '../../store/useAudioStore';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { useDecryptedMedia } from '../../lib/media-utils';

interface GroupedAudioBubbleProps {
  items: MediaItem[];
  sharedSecret: string | undefined;
  msg: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
}

const AudioTrackRow = memo(({
  item,
  sharedSecret,
  isCurrentTrack,
  isPlaying,
  msgId,
  isOwn = false,
  onPlayToggle,
}: {
  item: MediaItem;
  sharedSecret: string | undefined;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  msgId?: string;
  isOwn?: boolean;
  onPlayToggle: (resolvedCover: string | null, resolvedDuration: number, resolvedTitle: string, resolvedArtist: string) => void;
}) => {
  const { t } = useTranslation();
  const [cover, setCover] = useState<string | null>(item.audioMetadata?.cover || null);
  const [duration, setDuration] = useState<number>(item.audioMetadata?.duration || item.duration || 0);
  const [title, setTitle] = useState<string>(
    item.audioMetadata?.title || item.name?.replace(/\.[^.]+$/, '') || t('chatWindow.audio', 'Аудио')
  );
  const [artist, setArtist] = useState<string>(item.audioMetadata?.artist || '');

  const { blobUrl } = useDecryptedMedia(
    item.url,
    item.key || sharedSecret,
    item.name,
    item.mime || 'audio/mpeg',
    msgId,
    msgId
  );

  useEffect(() => {
    if (item.audioMetadata?.cover && !cover) {
      setCover(item.audioMetadata.cover);
    }
    if ((item.audioMetadata?.duration || item.duration) && duration === 0) {
      setDuration(item.audioMetadata?.duration || item.duration || 0);
    }
    if (item.audioMetadata?.title && (!title || title === t('chatWindow.audio', 'Аудио'))) {
      setTitle(item.audioMetadata.title);
    }
    if (item.audioMetadata?.artist && !artist) {
      setArtist(item.audioMetadata.artist);
    }
  }, [item.audioMetadata, item.duration, cover, duration, title, artist, t]);

  useEffect(() => {
    if (!blobUrl) return;
    let cancelled = false;

    if (!cover && !item.audioMetadata?.cover && typeof window.jsmediatags !== 'undefined') {
      fetch(blobUrl)
        .then((res) => res.blob())
        .then((blob) => {
          window.jsmediatags?.read(blob, {
            onSuccess: (tag: any) => {
              if (cancelled) return;
              const tags = tag.tags;
              if (tags?.title && (!title || title === t('chatWindow.audio', 'Аудио'))) {
                setTitle(tags.title);
              }
              if (tags?.artist && !artist) {
                setArtist(tags.artist);
              }
              const picture = tags?.picture;
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
    }

    if (duration === 0 && !item.duration && !item.audioMetadata?.duration) {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = blobUrl;
      audio.addEventListener('loadedmetadata', () => {
        if (!cancelled && audio.duration && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [blobUrl, cover, duration, title, artist, t]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleRowClick = () => {
    onPlayToggle(cover, duration, title, artist);
  };

  return (
    <div
      onClick={handleRowClick}
      className="flex items-center gap-2.5 w-full cursor-pointer py-1 px-1 rounded-lg"
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <AudioCoverWithPlay
        cover={cover}
        isPlayingTrack={isCurrentTrack && isPlaying}
        size={40}
        onClick={handleRowClick}
      />

      <div className="flex flex-col min-w-0 flex-1 justify-center overflow-hidden">
        <span className="truncate text-[13px] font-semibold leading-snug" style={{ color: isOwn ? '#ffffff' : 'var(--text-main)' }}>
          {artist ? `${artist} – ${title}` : title}
        </span>
        <span className="text-[11px] font-medium mt-0.5 tabular-nums" style={{ color: isOwn ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-dim)' }}>
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
});

AudioTrackRow.displayName = 'AudioTrackRow';

export const GroupedAudioBubble = memo(({
  items,
  sharedSecret,
  msg,
  timeNode,
  isOwn = false,
}: GroupedAudioBubbleProps) => {
  const currentTrack = useAudioStore((state) => state.currentTrack);
  const isGlobalPlaying = useAudioStore((state) => state.isPlaying);
  const play = useAudioStore((state) => state.play);
  const pause = useAudioStore((state) => state.pause);
  const setQueue = useAudioStore((state) => state.setQueue);

  const handlePlayToggle = (
    item: MediaItem,
    index: number,
    resolvedCover: string | null,
    resolvedDuration: number,
    resolvedTitle: string,
    resolvedArtist: string
  ) => {
    const isThisTrack = Boolean(
      currentTrack && (currentTrack.url === item.url || (item.name && currentTrack.title === item.name))
    );
    if (isThisTrack) {
      if (isGlobalPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    const playlist = items.map((it, idx) => {
      const isSelected = idx === index;
      return {
        id: `${msg.id || 'msg'}_audio_${idx}`,
        chatId: msg.id || '',
        title: isSelected ? resolvedTitle : (it.audioMetadata?.title || it.name?.replace(/\.[^.]+$/, '') || 'Аудио'),
        artist: isSelected ? resolvedArtist : (it.audioMetadata?.artist || ''),
        duration: isSelected ? resolvedDuration : (it.audioMetadata?.duration || it.duration || 0),
        cover: isSelected ? resolvedCover : (it.audioMetadata?.cover || null),
        url: it.url,
        sharedSecret: it.key || msg.mediaKey || sharedSecret || '',
        message: msg,
      };
    });

    setQueue(playlist);
    const selectedTrack = playlist[index];
    if (selectedTrack) {
      play(selectedTrack);
    }
  };

  return (
    <div
      className="grouped-audio-bubble flex flex-col w-[260px] select-none"
      style={{
        width: '260px',
        padding: '6px 8px 6px 8px',
        position: 'relative',
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <style>{`
        .grouped-audio-bubble,
        .grouped-audio-bubble * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
        }
      `}</style>
      <div className="flex flex-col gap-1 w-full">
        {items.map((item, index) => {
          const isThisTrack = Boolean(
            currentTrack && (currentTrack.url === item.url || (item.name && currentTrack.title === item.name))
          );
          return (
            <AudioTrackRow
              key={index}
              item={item}
              sharedSecret={sharedSecret}
              isCurrentTrack={isThisTrack}
              isPlaying={isGlobalPlaying}
              msgId={msg.id}
              isOwn={isOwn}
              onPlayToggle={(resolvedCover, resolvedDuration, resolvedTitle, resolvedArtist) =>
                handlePlayToggle(item, index, resolvedCover, resolvedDuration, resolvedTitle, resolvedArtist)
              }
            />
          );
        })}
      </div>

      {msg.text ? (
        <div className="flex items-end justify-between gap-3 px-1 pt-1 pb-0.5 select-none">
          <div className="text-[13.5px] text-[var(--text-main)] leading-snug break-words flex-1 select-none">
            {msg.text}
          </div>
          <div className="flex items-center justify-end gap-1 flex-shrink-0 mb-0.5 select-none">
            {timeNode}
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            bottom: isOwn ? '2px' : '5px',
            right: isOwn ? '3px' : '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
          }}
        >
          {timeNode}
        </div>
      )}
    </div>
  );
});

GroupedAudioBubble.displayName = 'GroupedAudioBubble';
