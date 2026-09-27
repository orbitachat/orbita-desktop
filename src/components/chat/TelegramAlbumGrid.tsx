import { memo, useMemo, useState } from 'react';
import { MediaItem, Message, useChatStore } from '../../store/useChatStore';
import { useDecryptedMedia } from '../../lib/media-utils';
import { AudioCoverWithPlay } from '../audio/AudioCoverWithPlay';
import { Play } from 'lucide-react';

interface TelegramAlbumGridProps {
  items: MediaItem[];
  sharedSecret: string | undefined;
  msg: Message;
  timeNode?: React.ReactNode;
  isOwn?: boolean;
  onMediaClick: (index: number) => void;
  maxWidth?: number;
  customRadius?: string;
}

const AlbumTile = memo(({
  item,
  sharedSecret,
  onClick,
  style,
  isOwn = false,
}: {
  item: MediaItem;
  sharedSecret: string | undefined;
  onClick: () => void;
  style: React.CSSProperties;
  isOwn?: boolean;
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const autoLoad = useChatStore((state) => state.shouldAutoLoadMedia(item.type === 'video' ? 'video' : 'photo', item.size, isOwn));
  const { blobUrl, load, isLoading, progress, isUnavailable } = useDecryptedMedia(item.url, item.key || sharedSecret, item.name, item.mime, undefined, undefined, autoLoad);
  const isVideo = item.type === 'video';

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isUploading = Boolean(item.uploading);
  const isDownloading = isLoading;
  const blurSrc = item.blurPreview || item.thumbnail || (item.url?.startsWith('data:') ? item.url : null);
  const mediaSrc = blobUrl || (item.url?.startsWith('data:') || item.url?.startsWith('blob:') ? item.url : undefined);

  const itemTotalSize = item.size || (item.audioMetadata?.size || 0);
  const uploadProgress = itemTotalSize > 0 ? Math.min(1, Math.max(0.04, ((item.uploadedMb || 0) * 1024 * 1024) / itemTotalSize)) : 0.08;

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer bg-[var(--surface-muted,rgba(0,0,0,0.2))] group"
      style={{
        ...style,
        position: 'relative',
      }}
    >
      {blurSrc ? (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${blurSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(10px)',
            transform: 'scale(1.12)',
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

      {mediaSrc && (
        isVideo ? (
          <video
            src={mediaSrc}
            className="w-full h-full object-cover pointer-events-none relative z-[1] transition-opacity duration-200"
            style={{ opacity: isLoaded ? 1 : 0 }}
            onLoadedData={() => setIsLoaded(true)}
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={mediaSrc}
            alt={item.name || ''}
            className="w-full h-full object-cover pointer-events-none relative z-[1] transition-opacity duration-200"
            style={{ opacity: isLoaded ? 1 : 0 }}
            onLoad={() => setIsLoaded(true)}
            loading="lazy"
            decoding="async"
          />
        )
      )}

      {(!blobUrl || isUploading) && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center z-[2] select-none ${isUnavailable ? 'pointer-events-none' : 'cursor-pointer'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!isDownloading && !isUploading && !isUnavailable) load();
          }}
        >
          {!isUnavailable && (
            <div className="relative z-10 flex flex-col items-center gap-1">
              <AudioCoverWithPlay
                cover={null}
                size={44}
                state={isUploading ? 'uploading' : (isDownloading ? 'downloading' : 'download')}
                progress={isUploading ? uploadProgress : progress}
                onClick={() => { if (!isDownloading && !isUploading) load(); }}
                ariaLabel={isDownloading ? 'Cancel download' : (!blobUrl ? 'Download' : 'Open')}
              />
              {item.size && item.size > 0 && !isDownloading && !isUploading && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(item.size / (1024 * 1024)).toFixed(1)} MB
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isVideo && isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20 z-[2]">
          <div className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
            <Play size={18} fill="white" className="ml-0.5" />
          </div>
          {item.duration ? (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium tabular-nums">
              {formatDuration(item.duration)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});

AlbumTile.displayName = 'AlbumTile';

function partitionAlbum(items: MediaItem[]): number[][] {
  const count = items.length;
  if (count <= 1) return [[0]];
  if (count === 2) return [[0, 1]];
  if (count === 3) return [[0], [1, 2]];
  if (count === 4) return [[0, 1], [2, 3]];
  if (count === 5) return [[0, 1], [2, 3, 4]];
  if (count === 6) return [[0, 1, 2], [3, 4, 5]];
  if (count === 7) return [[0], [1, 2, 3], [4, 5, 6]];
  if (count === 8) return [[0, 1], [2, 3, 4], [5, 6, 7]];
  if (count === 9) return [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
  if (count === 10) return [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]];

  const rows: number[][] = [];
  let curr: number[] = [];
  for (let i = 0; i < count; i++) {
    curr.push(i);
    if (curr.length === 3 || i === count - 1) {
      rows.push(curr);
      curr = [];
    }
  }
  return rows;
}

export const TelegramAlbumGrid = memo(({
  items,
  sharedSecret,
  msg,
  timeNode,
  onMediaClick,
  maxWidth = 440,
  customRadius,
  isOwn,
}: TelegramAlbumGridProps) => {
  const rows = useMemo(() => partitionAlbum(items), [items]);
  const cleanCaption = msg.text ? msg.text.replace(/^\[(?:Photo|GIF|Sticker|Video)\]\s*(https?:\/\/[^\s]+)?/i, '').trim() : '';
  const hasCaption = Boolean(cleanCaption);

  const { photoBorderRadius, innerTL, innerTR } = useMemo(() => {
    let tl = 16;
    let tr = 16;
    if (customRadius) {
      const parts = customRadius.trim().split(/\s+/);
      const parseVal = (v?: string) => {
        if (!v) return 16;
        const n = parseFloat(v);
        return isNaN(n) ? 16 : n;
      };
      tl = parseVal(parts[0]);
      tr = parseVal(parts[1] || parts[0]);
    }
    const cTL = Math.max(0, tl - 2);
    const cTR = Math.max(0, tr - 2);
    return {
      photoBorderRadius: `${cTL}px ${cTR}px 4px 4px`,
      innerTL: cTL,
      innerTR: cTR,
    };
  }, [customRadius]);

  const containerWidth = useMemo(() => {
    if (items.length === 1 && items[0].width && items[0].height && items[0].height > 0) {
      const r = items[0].width / items[0].height;
      if (r < 1) {
        const clampedR = Math.max(0.6, r);
        const w = Math.round(380 * clampedR);
        return `min(${w}px, 100%)`;
      }
      return `min(${Math.min(maxWidth, Math.max(260, items[0].width))}px, 100%)`;
    }
    return `min(${maxWidth}px, 100%)`;
  }, [items, maxWidth]);

  return (
    <div
      className="flex flex-col overflow-hidden w-full select-none"
      style={{
        width: containerWidth,
        maxWidth: `${maxWidth}px`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="flex flex-col w-full overflow-hidden"
        style={{
          width: '100%',
          gap: '2px',
          borderRadius: photoBorderRadius,
        }}
      >
        {rows.map((rowIndices, rIdx) => {
          const rowCount = rowIndices.length;
          let rowAspectRatio = '2 / 1';
          if (rowCount === 1) {
            if (items.length === 1 && items[0].width && items[0].height) {
              const r = items[0].width / items[0].height;
              const clamped = Math.max(0.6, Math.min(2.2, r));
              rowAspectRatio = `${clamped} / 1`;
            } else {
              rowAspectRatio = items.length === 1 ? '16 / 11' : '16 / 9';
            }
          } else if (rowCount === 2) {
            rowAspectRatio = '2 / 1';
          } else if (rowCount === 3) {
            rowAspectRatio = '3 / 1';
          } else {
            rowAspectRatio = `${rowCount} / 1`;
          }

          return (
            <div
              key={rIdx}
              className="flex w-full overflow-hidden"
              style={{
                width: '100%',
                gap: '2px',
                aspectRatio: rowAspectRatio,
                maxHeight: rowCount === 1 && items.length === 1 ? '380px' : undefined,
              }}
            >
              {rowIndices.map((itemIdx, colIdx) => {
                const item = items[itemIdx];
                const isTopRow = rIdx === 0;
                const isFirstCol = colIdx === 0;
                const isLastCol = colIdx === rowCount - 1;
                const tileRadius = `${isTopRow && isFirstCol ? innerTL : 0}px ${isTopRow && isLastCol ? innerTR : 0}px 0 0`;
                return (
                  <div
                    key={itemIdx}
                    style={{
                      flex: 1,
                      height: '100%',
                      minWidth: 0,
                      borderRadius: tileRadius,
                      overflow: 'hidden',
                    }}
                  >
                    <AlbumTile
                      item={item}
                      sharedSecret={sharedSecret}
                      onClick={() => onMediaClick(itemIdx)}
                      style={{ width: '100%', height: '100%', borderRadius: tileRadius }}
                      isOwn={isOwn}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {hasCaption ? (
        <div
          className="flex items-end justify-between gap-3 px-2 pt-1 pb-0.5 select-none"
          style={{
            backgroundColor: 'inherit',
          }}
        >
          <div className="text-[13.5px] text-[var(--text-main)] leading-snug break-words flex-1 select-text">
            {cleanCaption}
          </div>
          <div
            className="flex items-center justify-end gap-1 flex-shrink-0 select-none message-time-badge"
            style={{
              marginRight: isOwn ? '1px' : '3px',
              marginBottom: '-2px',
            }}
          >
            {timeNode}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-end select-none"
          style={{
            backgroundColor: 'inherit',
            paddingTop: '2px',
            paddingBottom: '0px',
            paddingLeft: '4px',
            paddingRight: '1px',
          }}
        >
          <div
            className="flex items-center justify-end gap-1 select-none message-time-badge"
            style={{
              lineHeight: 1,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              marginRight: isOwn ? '1px' : '3px',
              marginBottom: '-1px',
            }}
          >
            {timeNode}
          </div>
        </div>
      )}
    </div>
  );
});

TelegramAlbumGrid.displayName = 'TelegramAlbumGrid';
