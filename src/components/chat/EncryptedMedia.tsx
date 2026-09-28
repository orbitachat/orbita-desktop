import React, { useMemo, memo } from 'react';
import { useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { SmartGifPlayer } from './SmartGifPlayer';

interface EncryptedMediaProps {
  url: string;
  type: 'image' | 'video';
  sharedSecret: string | undefined;
  chatId?: string;
  messageId?: string;
  width?: number;
  height?: number;
  timeNode?: React.ReactNode;
  isGif?: boolean;
  onContextMenu?: (e: React.MouseEvent, blobUrl: string) => void;
  onClick?: () => void;
  isOwn?: boolean;
  fileSize?: number;
  blurPreview?: string;
}

export const EncryptedMedia = memo(({
  url,
  type,
  sharedSecret,
  chatId,
  messageId,
  width: msgWidth,
  height: msgHeight,
  timeNode,
  isGif: isGifProp,
  onContextMenu,
  onClick,
  isOwn = false,
  fileSize,
  blurPreview,
}: EncryptedMediaProps) => {
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia(type === 'image' ? 'photo' : 'video', fileSize, isOwn));
  const { blobUrl, load, isLoading, progress, isUnavailable } = useDecryptedMedia(url, sharedSecret, undefined, undefined, chatId, messageId, autoLoad);
  const bubbleRadius = useChatStore.getState().bubbleRadius;

  const isGif = useMemo(() => {
    if (isGifProp !== undefined) return isGifProp;
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('.gif') ||
      lower.includes('image/gif') ||
      lower.includes('giphy.com') ||
      lower.includes('tenor.com')
    );
  }, [isGifProp, url]);

  const aspectRatio = (msgWidth && msgHeight && msgHeight > 0) ? (msgWidth / msgHeight) : 1.333;
  const clampedAspect = Math.max(0.6, Math.min(2.0, aspectRatio));

  if (isGif) {
    return (
      <SmartGifPlayer
        blobUrl={blobUrl}
        width={msgWidth}
        height={msgHeight}
        clampedAspect={clampedAspect}
        bubbleRadius={bubbleRadius}
        timeNode={timeNode}
        onClick={onClick}
        onContextMenu={onContextMenu}
      />
    );
  }

  const initialWidth = (msgWidth && msgHeight && msgHeight > 0)
    ? (clampedAspect < 1 ? Math.min(440, Math.round(380 * clampedAspect)) : Math.min(440, msgWidth))
    : 440;

  return (
    <div
      style={{
        width: `${initialWidth}px`,
        maxWidth: '100%',
        aspectRatio: `${clampedAspect}`,
        maxHeight: '380px',
        borderRadius: bubbleRadius,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--surface-container, rgba(255,255,255,0.06))',
        overflowAnchor: 'none',
      }}
    >
      {!blobUrl && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-10 select-none ${isUnavailable ? 'pointer-events-none' : 'cursor-pointer'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isLoading && !isUnavailable) load();
          }}
        >
          {blurPreview ? (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `url(${blurPreview})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(16px)',
                transform: 'scale(1.15)',
              }}
            />
          ) : (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.22), transparent 70%), radial-gradient(circle at 70% 70%, rgba(59, 130, 246, 0.18), transparent 70%), rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(20px)',
              }}
            />
          )}
          {!isUnavailable && (
            <div className="relative z-10 flex flex-col items-center gap-1.5 pointer-events-auto">
              <AudioCoverWithPlay
                cover={null}
                size={48}
                state={isLoading ? 'downloading' : 'download'}
                progress={isLoading ? progress : undefined}
                onClick={() => { if (!isLoading) load(); }}
                ariaLabel={isLoading ? 'Cancel download' : 'Download media'}
              />
              {fileSize && fileSize > 0 && !isLoading && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(fileSize / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {type === 'image' ? (
        <img
          src={blobUrl || undefined}
          alt=""
          className="w-full h-full object-cover cursor-pointer"
          draggable={false}
          style={{ userSelect: 'none', display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            if (blobUrl) onContextMenu?.(e, blobUrl);
          }}
        />
      ) : (
        <video
          controls={!!blobUrl}
          className="w-full h-full object-cover"
          preload="none"
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: 'block', opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
        >
          {blobUrl && <source src={blobUrl} />}
        </video>
      )}

      {timeNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            borderRadius: '6px',
            padding: '2px 6px',
            color: '#ffffff',
            fontSize: '11px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            lineHeight: 1,
            zIndex: 2,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {timeNode}
        </div>
      )}
    </div>
  );
});
