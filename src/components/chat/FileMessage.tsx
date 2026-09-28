import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { mediaManager } from '../../services/mediaManager';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { arrayBufferToBase64 } from '../../utils/messageUtils';
import { orbitFs } from './chatUtils';

interface FileMessageProps {
  url: string;
  fileName?: string;
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  size?: number | null;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  customRadius?: string;
}

export const FileMessage = memo(({
  url,
  fileName,
  sharedSecret,
  chatId,
  messageId,
  size: initialSize,
  timeNode,
  isOwn = false,
  customRadius,
}: FileMessageProps) => {
  const { t } = useTranslation();
  const bubbleRadius = useChatStore((state) => state.bubbleRadius);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(() => {
    if (typeof initialSize === 'number' && initialSize > 0) return initialSize;
    return null;
  });
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia('file', fileSizeBytes, isOwn));
  const { blobUrl, blob, load, isLoading: mediaLoading, progress } = useDecryptedMedia(url, sharedSecret, fileName, undefined, chatId, messageId, autoLoad);
  const [isLoading, setIsLoading] = useState(false);
  const displayName = fileName || t('chatWindow.file');
  const ext = fileName?.split('.').pop()?.toUpperCase() || 'FILE';

  useEffect(() => {
    if (typeof initialSize === 'number' && initialSize > 0) {
      setFileSizeBytes(initialSize);
    }
  }, [initialSize]);

  useEffect(() => {
    if (fileSizeBytes && fileSizeBytes > 0) return;
    if (blob && blob.size > 0) {
      setFileSizeBytes(blob.size);
      return;
    }

    let cancelled = false;

    const probeSize = async () => {
      if (url) {
        const cached = mediaManager.getCachedMedia(url, sharedSecret || '');
        if (cached?.size && cached.size > 0) {
          if (!cancelled) setFileSizeBytes(cached.size);
          return;
        }
      }

      if (window.orbita?.getFileSize && url && !url.startsWith('http') && !url.startsWith('orbita-media:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        try {
          const sz = await window.orbita.getFileSize(url);
          if (!cancelled && sz > 0) {
            setFileSizeBytes(sz);
            return;
          }
        } catch {}
      }

      const targetUrl = blobUrl || (url && (url.startsWith('http') || url.startsWith('orbita-media:') || url.startsWith('blob:')) ? url : null);
      if (targetUrl) {
        try {
          const res = await fetch(targetUrl, { method: 'HEAD' });
          if (cancelled) return;
          const cl = res.headers.get('content-length');
          if (cl) {
            const parsed = parseInt(cl, 10);
            if (!isNaN(parsed) && parsed > 0) {
              setFileSizeBytes(parsed);
              return;
            }
          }
        } catch {}
      }
    };

    probeSize();

    return () => {
      cancelled = true;
    };
  }, [blob, blobUrl, url, sharedSecret, fileSizeBytes]);

  const fileSize = useMemo(() => {
    const bytes = fileSizeBytes || (blob ? blob.size : null);
    if (!bytes || isNaN(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb >= 10 ? gb.toFixed(1) : gb.toFixed(2)} GB`;
  }, [fileSizeBytes, blob]);

  const isDownloading = isLoading || mediaLoading;

  const handleOpenFile = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!blobUrl) {
      if (isDownloading) return;
      setIsLoading(true);
      try {
        await load();
      } catch (err) {
        console.error('Failed to load file:', err);
      } finally {
        setIsLoading(false);
      }
      return;
    }
    try {
      const response = await fetch(blobUrl);
      const fileBlob = await response.blob();
      const arrayBuffer = await fileBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      if (window.orbita && window.orbita.openFile) {
        await window.orbita.openFile(base64, displayName);
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = displayName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [blobUrl, displayName, isDownloading, load]);

  return (
    <div
      className="group relative flex flex-col cursor-pointer select-none"
      style={{
        borderRadius: customRadius || bubbleRadius,
        background: isOwn
          ? 'var(--chat-bubble-own-bg, #2c6bed)'
          : 'var(--chat-bubble-incoming-bg, var(--surface-container))',
        border: 'none',
        padding: '8px 12px 8px 8px',
        position: 'relative',
        width: '260px',
        height: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
      onClick={handleOpenFile}
    >
      <div className="flex items-start gap-2">
        <AudioCoverWithPlay
          cover={null}
          isPlayingTrack={false}
          size={48}
          onClick={handleOpenFile}
          state={!blobUrl ? (isDownloading ? 'downloading' : 'download') : 'file'}
          progress={isDownloading ? progress : undefined}
          isOwn={isOwn}
          ariaLabel={isDownloading ? 'Cancel download' : (!blobUrl ? 'Download file' : 'Open file')}
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
            {displayName}
          </div>
          <div style={{ fontSize: orbitFs(11), color: isOwn ? 'rgba(255, 255, 255, 0.7)' : 'var(--text-dim)' }}>
            {fileSize ? (ext ? `${fileSize} • ${ext}` : fileSize) : ext || t('chatWindow.document')}
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
        {timeNode}
      </div>
    </div>
  );
});
