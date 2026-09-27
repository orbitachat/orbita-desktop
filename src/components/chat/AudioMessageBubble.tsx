import { useEffect, useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { useAudioStore } from '../../store/useAudioStore';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';

const orbitFs = (px: number) => `calc(${px}px * var(--text-scale, 1))`;

interface AudioMessageBubbleProps {
  msg: Message;
  sharedSecret: string | undefined;
  bubbleRadius: number | string;
  onContextMenu?: (e: React.MouseEvent) => void;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  onCancelUpload?: () => void;
}

export const AudioMessageBubble = memo(({
  msg,
  sharedSecret,
  bubbleRadius,
  onContextMenu,
  timeNode,
  isOwn = false,
  onCancelUpload,
}: AudioMessageBubbleProps) => {
  const { t } = useTranslation();
  const [cover, setCover] = useState<string | null>(msg.audioMetadata?.cover || null);
  const [duration, setDuration] = useState<number>(msg.audioMetadata?.duration || 0);
  const [isLoading, setIsLoading] = useState(false);

  const trackId = msg.id;
  const isCurrentTrack = useAudioStore((state) => state.currentTrack?.id === trackId);
  const isPlaying = useAudioStore((state) => (isCurrentTrack ? state.isPlaying : false));
  const currentTime = useAudioStore((state) => (isCurrentTrack ? state.currentTime : 0));

  const play = useAudioStore((state) => state.play);
  const pause = useAudioStore((state) => state.pause);
  const addToQueue = useAudioStore((state) => state.addToQueue);

  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia('audio', msg.fileSize || (msg as any).size, isOwn));

  const title = msg.audioMetadata?.title || msg.mediaName?.replace(/\.[^.]+$/, '') || t('chatWindow.audio');
  const artist = msg.audioMetadata?.artist || '';

  const effectiveSecret = msg.mediaKey || sharedSecret;

  const { blobUrl, load, isLoading: mediaLoading, progress } = useDecryptedMedia(
    msg.mediaUrl!,
    effectiveSecret,
    msg.mediaName,
    msg.mime,
    msg.id,
    msg.id,
    autoLoad
  );

  const isDownloading = isLoading || mediaLoading;

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsLoading(true);
    try {
      await load();
    } catch (err) {
      console.error('Failed to load audio:', err);
    } finally {
      setIsLoading(false);
    }
  }, [load, isDownloading]);

  useEffect(() => {
    if (!blobUrl) return;
    let cancelled = false;

    if (!cover && !msg.audioMetadata?.cover && typeof window.jsmediatags !== 'undefined') {
      const extractCover = async () => {
        try {
          const response = await fetch(blobUrl);
          const blob = await response.blob();
          window.jsmediatags.read(blob, {
            onSuccess: (tag: any) => {
              if (cancelled) return;
              const picture = tag.tags?.picture;
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
        } catch {}
      };
      extractCover();
    }

    if (duration === 0 && !msg.duration && !msg.audioMetadata?.duration) {
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
  }, [blobUrl, duration, cover, msg.duration, msg.audioMetadata]);

  const showPause = isCurrentTrack && isPlaying;

  const handlePlay = () => {
    if (showPause) {
      pause();
    } else if (blobUrl) {
      if (isCurrentTrack) {
        play();
      } else {
        const activeChatId = useChatStore.getState().activeChatId || '';
        const chatMessages = activeChatId ? useChatStore.getState().messagesByChatId[activeChatId] || [] : [];
        const audioMsgs = chatMessages.filter(
          (m) => (m.mediaType === 'audio' || m.mediaType === 'voice') && m.mediaUrl
        );

        const currentTrackObj = {
          id: msg.id!,
          chatId: activeChatId,
          title,
          artist,
          duration,
          cover,
          url: msg.mediaUrl!,
          sharedSecret: effectiveSecret || '',
          message: msg,
        };

        if (audioMsgs.length > 0) {
          const playlist = audioMsgs.map((m) => {
            if (m.id === msg.id) return currentTrackObj;
            return {
              id: m.id!,
              chatId: activeChatId,
              title: m.audioMetadata?.title || m.mediaName?.replace(/\.[^.]+$/, '') || t('chatWindow.audio'),
              artist: m.audioMetadata?.artist || '',
              duration: m.audioMetadata?.duration || 0,
              cover: m.audioMetadata?.cover || null,
              url: m.mediaUrl!,
              sharedSecret: m.mediaKey || sharedSecret || '',
              message: m,
            };
          });
          useAudioStore.getState().setQueue(playlist);
        }

        addToQueue(currentTrackObj);
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  let timeDisplay: string;
  if (isCurrentTrack) {
    const current = isFinite(currentTime) ? currentTime : 0;
    timeDisplay = `${formatTime(current)} / ${formatTime(duration)}`;
  } else {
    timeDisplay = formatTime(duration);
  }

  const isUploading = Boolean(
    msg.uploading && (msg.status === 'sending' || msg.status === 'pending')
  );
  const itemTotalSize = msg.audioMetadata?.size || (msg as any).size || msg.fileSize || 0;
  const sizeMbStr = itemTotalSize > 0 ? (itemTotalSize / (1024 * 1024)).toFixed(1) : '0.0';
  const uploadedMbStr = (msg.uploadedMb || 0).toFixed(1);
  const uploadProgress = itemTotalSize > 0 ? Math.min(1, Math.max(0.04, ((msg.uploadedMb || 0) * 1024 * 1024) / itemTotalSize)) : 0.08;

  const coverState = isUploading
    ? 'uploading'
    : (!blobUrl
      ? (isDownloading ? 'downloading' : 'download')
      : (showPause ? 'pause' : 'play'));

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none"
      style={{
        borderRadius: bubbleRadius,
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        border: 'none',
        padding: '8px 12px 8px 8px',
        position: 'relative',
        width: '330px',
        maxWidth: '100%',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onContextMenu={onContextMenu}
    >
      <div className="flex items-start gap-2">
        <AudioCoverWithPlay
          cover={cover}
          isPlayingTrack={showPause}
          size={48}
          onClick={!blobUrl ? handleDownload : handlePlay}
          onCancel={onCancelUpload}
          state={coverState}
          progress={isUploading ? uploadProgress : (isDownloading ? progress : undefined)}
          isOwn={isOwn}
          ariaLabel={isDownloading ? 'Cancel download' : (!blobUrl ? 'Download audio' : (showPause ? 'Pause' : 'Play'))}
        />
        <div className="flex flex-col min-w-0 flex-1 gap-1 overflow-hidden" style={{ maxWidth: '100%' }}>
          <div
            className="font-semibold truncate"
            style={{
              fontSize: orbitFs(13),
              color: isOwn ? '#ffffff' : 'var(--text-main)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              overflowWrap: 'break-word',
            }}
          >
            {artist ? `${artist} – ${title}` : title}
          </div>
          <div style={{ fontSize: orbitFs(11), color: isOwn ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-dim)' }}>
            {isUploading ? `${uploadedMbStr} / ${sizeMbStr} MB` : (isLoading ? t('chatWindow.loading') : timeDisplay)}
          </div>
        </div>
      </div>

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
        {timeNode ? (
          timeNode
        ) : (
          <span style={{ fontSize: orbitFs(11), color: isOwn ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-dim)' }}>
            {formatTimeOfDay(msg.time)}
          </span>
        )}
      </div>
    </div>
  );
});

function formatTimeOfDay(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}