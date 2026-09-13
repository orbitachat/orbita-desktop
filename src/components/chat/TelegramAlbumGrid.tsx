import { memo, useMemo } from 'react';
import { MediaItem, Message } from '../../store/useChatStore';
import { useDecryptedMedia } from '../../lib/media-utils';
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
}: {
  item: MediaItem;
  sharedSecret: string | undefined;
  onClick: () => void;
  style: React.CSSProperties;
}) => {
  const { blobUrl } = useDecryptedMedia(item.url, item.key || sharedSecret, item.name, item.mime);
  const isVideo = item.type === 'video';

  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec)) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer bg-[var(--surface-muted,rgba(0,0,0,0.2))] group"
      style={{
        ...style,
        position: 'relative',
      }}
    >
      {blobUrl ? (
        isVideo ? (
          <video
            src={blobUrl}
            className="w-full h-full object-cover pointer-events-none"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={blobUrl}
            alt={item.name || ''}
            className="w-full h-full object-cover pointer-events-none"
            loading="lazy"
            decoding="async"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[var(--surface-container-soft)]">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-color)] border-t-transparent animate-spin" />
        </div>
      )}

      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
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
}: TelegramAlbumGridProps) => {
  const rows = useMemo(() => partitionAlbum(items), [items]);
  const hasCaption = !!msg.text;

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
    const cTL = Math.max(0, tl - 1);
    const cTR = Math.max(0, tr - 1);
    return {
      photoBorderRadius: `${cTL}px ${cTR}px 4px 4px`,
      innerTL: cTL,
      innerTR: cTR,
    };
  }, [customRadius]);

  return (
    <div
      className="flex flex-col overflow-hidden w-full select-none"
      style={{
        width: '100%',
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
          gap: '1px',
          borderRadius: photoBorderRadius,
        }}
      >
        {rows.map((rowIndices, rIdx) => {
          const rowCount = rowIndices.length;
          let rowAspectRatio = '2 / 1';
          if (rowCount === 1) {
            rowAspectRatio = items.length === 1 ? '16 / 11' : '16 / 9';
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
                gap: '1px',
                aspectRatio: rowAspectRatio,
                maxHeight: rowCount === 1 && items.length === 1 ? '340px' : undefined,
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
          className="flex items-end justify-between gap-3 px-2.5 pt-1 pb-0.5"
          style={{
            backgroundColor: 'inherit',
          }}
        >
          <div className="text-[13.5px] text-[var(--text-main)] leading-snug break-words flex-1 select-text">
            {msg.text}
          </div>
          <div className="flex items-center justify-end gap-1 flex-shrink-0 select-none">
            {timeNode}
          </div>
        </div>
      ) : (
        <div
          className="flex items-center justify-end px-2 pt-1 pb-0.5"
          style={{
            backgroundColor: 'inherit',
          }}
        >
          <div className="flex items-center justify-end gap-1 select-none">
            {timeNode}
          </div>
        </div>
      )}
    </div>
  );
});

TelegramAlbumGrid.displayName = 'TelegramAlbumGrid';
