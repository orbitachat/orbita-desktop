// src/components/common/MediaGroup.tsx
import React, { useMemo } from 'react';
import { Play, Volume2 } from 'lucide-react';
import { useDecryptedMedia } from '../../lib/media-utils';

export interface MediaGroupItem {
  id: string;
  type: 'image' | 'video';
  src: string;
  width: number;
  height: number;
  duration?: number;
  name: string;
}

interface LayoutBox {
  media: MediaGroupItem;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: {
    tl: number;
    tr: number;
    br: number;
    bl: number;
  };
  showOverlay: boolean;
  overlayText?: string;
}

interface LayoutResult {
  boxes: LayoutBox[];
  totalWidth: number;
  totalHeight: number;
  rows: LayoutBox[][];
}

interface RowCandidate {
  items: MediaGroupItem[];
  height: number;
  rawHeight: number;
  tileWidths: number[];
}

interface LayoutCandidate {
  rows: RowCandidate[];
  totalHeight: number;
  cost: number;
}

class MediaLayoutEngine {
  private readonly MIN_TILE_WIDTH = 80;
  private readonly ABSOLUTE_MIN_WIDTH = 30;
  private readonly MAX_HEIGHT = 380;
  private readonly GAP = 4;
  private readonly RADIUS_OUTER = 12;
  private readonly RADIUS_INNER = 0;

  private static compositionCache = new Map<number, number[][]>();

  private generateCompositions(n: number): number[][] {
    const cached = MediaLayoutEngine.compositionCache.get(n);
    if (cached) return cached;

    const result: number[][] = [];
    const backtrack = (remaining: number, current: number[]) => {
      if (remaining === 0) {
        result.push([...current]);
        return;
      }
      for (let take = 1; take <= remaining; take++) {
        current.push(take);
        backtrack(remaining - take, current);
        current.pop();
      }
    };
    backtrack(n, []);
    MediaLayoutEngine.compositionCache.set(n, result);
    return result;
  }

  private computeRow(
    rowItems: MediaGroupItem[],
    containerWidth: number
  ): { height: number; rawHeight: number; tileWidths: number[] } {
    const k = rowItems.length;
    const aspectRatios = rowItems.map((item) => item.width / item.height);
    const sumAspect = aspectRatios.reduce((s, a) => s + a, 0);
    const availableWidth = containerWidth - (k - 1) * this.GAP;
    const rawHeight = availableWidth / sumAspect;
    const height = Math.min(rawHeight, this.MAX_HEIGHT);
    const tileWidths = aspectRatios.map((a) => height * a);
    return { height, rawHeight, tileWidths };
  }

  private computeCost(rows: RowCandidate[], totalHeight: number): number {
    let cost = 0;
    if (totalHeight > this.MAX_HEIGHT) {
      const excess = (totalHeight - this.MAX_HEIGHT) / this.MAX_HEIGHT;
      cost += excess * excess * 200;
    }
    for (const row of rows) {
      for (const w of row.tileWidths) {
        if (w < this.MIN_TILE_WIDTH) {
          const shortage = (this.MIN_TILE_WIDTH - w) / this.MIN_TILE_WIDTH;
          cost += shortage * shortage * 80;
        }
      }
    }
    if (rows.length > 1) {
      const heights = rows.map((r) => r.height);
      const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
      const variance = heights.reduce((sum, h) => sum + (h - avg) ** 2, 0) / heights.length;
      cost += variance * 0.3;
    }
    if (totalHeight < this.MAX_HEIGHT * 0.4) {
      cost += (this.MAX_HEIGHT * 0.4 - totalHeight) / this.MAX_HEIGHT * 15;
    }
    cost += rows.length * 0.8;
    return cost;
  }

  private evaluateComposition(
    items: MediaGroupItem[],
    composition: number[],
    containerWidth: number
  ): LayoutCandidate | null {
    const rows: RowCandidate[] = [];
    let idx = 0;
    for (const rowCount of composition) {
      const rowItems = items.slice(idx, idx + rowCount);
      idx += rowCount;
      const { height, rawHeight, tileWidths } = this.computeRow(rowItems, containerWidth);
      if (tileWidths.some((w) => w < this.ABSOLUTE_MIN_WIDTH)) {
        return null;
      }
      rows.push({ items: rowItems, height, rawHeight, tileWidths });
    }
    const totalHeight = rows.reduce((sum, r) => sum + r.height, 0) + (rows.length - 1) * this.GAP;
    const cost = this.computeCost(rows, totalHeight);
    return { rows, totalHeight, cost };
  }

  private buildSingleLayout(item: MediaGroupItem, containerWidth: number): LayoutResult {
    const { height, tileWidths } = this.computeRow([item], containerWidth);
    const box: LayoutBox = {
      media: item,
      x: 0,
      y: 0,
      width: tileWidths[0],
      height,
      borderRadius: {
        tl: this.RADIUS_OUTER,
        tr: this.RADIUS_OUTER,
        br: this.RADIUS_OUTER,
        bl: this.RADIUS_OUTER,
      },
      showOverlay: false,
    };
    return {
      boxes: [box],
      totalWidth: tileWidths[0],
      totalHeight: height,
      rows: [[box]],
    };
  }

  private candidateToLayoutResult(
    candidate: LayoutCandidate,
    containerWidth: number
  ): LayoutResult {
    const boxes: LayoutBox[] = [];
    let y = 0;
    const totalRows = candidate.rows.length;
    for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
      const row = candidate.rows[rowIdx];
      let x = 0;
      for (let colIdx = 0; colIdx < row.items.length; colIdx++) {
        const isFirstCol = colIdx === 0;
        const isLastCol = colIdx === row.items.length - 1;
        const isFirstRow = rowIdx === 0;
        const isLastRow = rowIdx === totalRows - 1;
        const touchesLeft = isFirstCol && Math.abs(x) < 1;
        const touchesRight = isLastCol && Math.abs(x + row.tileWidths[colIdx] - containerWidth) < 1;
        const touchesTop = isFirstRow;
        const touchesBottom = isLastRow;
        boxes.push({
          media: row.items[colIdx],
          x,
          y,
          width: row.tileWidths[colIdx],
          height: row.height,
          borderRadius: {
            tl: touchesTop && touchesLeft ? this.RADIUS_OUTER : this.RADIUS_INNER,
            tr: touchesTop && touchesRight ? this.RADIUS_OUTER : this.RADIUS_INNER,
            br: touchesBottom && touchesRight ? this.RADIUS_OUTER : this.RADIUS_INNER,
            bl: touchesBottom && touchesLeft ? this.RADIUS_OUTER : this.RADIUS_INNER,
          },
          showOverlay: false,
        });
        x += row.tileWidths[colIdx] + this.GAP;
      }
      y += row.height + this.GAP;
    }
    const rowGroups: LayoutBox[][] = [];
    let currentY = -1;
    let currentRow: LayoutBox[] = [];
    for (const box of boxes) {
      if (Math.abs(box.y - currentY) > 1) {
        if (currentRow.length > 0) rowGroups.push(currentRow);
        currentRow = [];
        currentY = box.y;
      }
      currentRow.push(box);
    }
    if (currentRow.length > 0) rowGroups.push(currentRow);
    return {
      boxes,
      totalWidth: containerWidth,
      totalHeight: candidate.totalHeight,
      rows: rowGroups,
    };
  }

  public buildLayout(items: MediaGroupItem[], containerWidth: number): LayoutResult {
    if (items.length === 0) {
      return { boxes: [], totalWidth: 0, totalHeight: 0, rows: [] };
    }
    if (items.length === 1) {
      return this.buildSingleLayout(items[0], containerWidth);
    }
    const compositions = this.generateCompositions(items.length);
    let bestCandidate: LayoutCandidate | null = null;
    let bestCost = Infinity;
    for (const comp of compositions) {
      const candidate = this.evaluateComposition(items, comp, containerWidth);
      if (candidate && candidate.cost < bestCost) {
        bestCost = candidate.cost;
        bestCandidate = candidate;
      }
    }
    if (!bestCandidate) {
      const fallbackComp = [items.length];
      const fallback = this.evaluateComposition(items, fallbackComp, containerWidth);
      if (fallback) {
        bestCandidate = fallback;
      } else {
        const rowItems = items;
        const k = rowItems.length;
        const aspectRatios = rowItems.map((item) => item.width / item.height);
        const sumAspect = aspectRatios.reduce((s, a) => s + a, 0);
        const availableWidth = containerWidth - (k - 1) * this.GAP;
        const h = Math.min(availableWidth / sumAspect, this.MAX_HEIGHT);
        const widths = aspectRatios.map((a) => h * a);
        bestCandidate = {
          rows: [
            {
              items: rowItems,
              height: h,
              rawHeight: h,
              tileWidths: widths,
            },
          ],
          totalHeight: h,
          cost: 0,
        };
      }
    }
    return this.candidateToLayoutResult(bestCandidate, containerWidth);
  }
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface MediaTileProps {
  box: LayoutBox;
  sharedSecret?: string;
}

const MediaTile = React.memo(({ box, sharedSecret }: MediaTileProps) => {
  const { media, x, y, width, height, borderRadius, showOverlay, overlayText } = box;
  const { blobUrl } = useDecryptedMedia(media.src, sharedSecret, media.name);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: `${borderRadius.tl}px ${borderRadius.tr}px ${borderRadius.br}px ${borderRadius.bl}px`,
    overflow: 'hidden',
    backgroundColor: '#2a2a2a',
    cursor: 'pointer',
    contain: 'content',
  };

  return (
    <div style={style} className="group relative">
      <div 
        className="absolute inset-0 flex items-center justify-center bg-[var(--surface-muted)] z-10 pointer-events-none"
        style={{ opacity: blobUrl ? 0 : 1, transition: 'opacity 0.2s', visibility: blobUrl ? 'hidden' : 'visible' }}
      >
        <span className="text-[var(--text-dim)] text-xs">Загрузка...</span>
      </div>
      
      {media.type === 'image' ? (
        <img
          src={blobUrl || undefined}
          alt={media.name}
          className="w-full h-full object-cover"
          style={{ opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
        />
      ) : (
        <>
          <img
            src={blobUrl || undefined}
            alt={media.name}
            className="w-full h-full object-cover"
            style={{ opacity: blobUrl ? 1 : 0, transition: 'opacity 0.2s' }}
          />
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <Play className="w-8 h-8 text-white" fill="white" />
          </div>
          {media.duration && (
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none">
              <Volume2 className="w-3 h-3" />
              {formatDuration(media.duration)}
            </div>
          )}
        </>
      )}
      {showOverlay && overlayText && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none z-20">
          <span className="text-white text-2xl font-bold">{overlayText}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none z-30" />
    </div>
  );
});

interface MediaGroupProps {
  items: MediaGroupItem[];
  sharedSecret?: string;
  containerWidth?: number;
  onMediaClick?: (media: MediaGroupItem) => void;
  maxDisplay?: number;
}

const MediaGroup = React.memo(({
  items,
  sharedSecret,
  containerWidth = 360,
  onMediaClick,
  maxDisplay = 6,
}: MediaGroupProps) => {
  const layoutEngine = useMemo(() => new MediaLayoutEngine(), []);

  const displayItems = useMemo(() => {
    if (items.length <= maxDisplay) return items;
    return items.slice(0, maxDisplay);
  }, [items, maxDisplay]);

  const hiddenCount = items.length - maxDisplay;

  // We calculate layout based on a fixed containerWidth (e.g., 360px).
  // Then we use CSS percentages to make it perfectly responsive!
  const layout = useMemo(() => {
    return layoutEngine.buildLayout(displayItems, containerWidth);
  }, [displayItems, containerWidth, layoutEngine]);

  if (items.length === 0) return null;

  return (
    <div
      className="relative w-full"
      style={{
        aspectRatio: `${containerWidth} / ${layout.totalHeight}`,
        maxWidth: '100%',
        overflowAnchor: 'none',
      }}
    >
      {layout.boxes.map((box, idx) => {
        const isLast = idx === layout.boxes.length - 1;
        const enhancedBox: LayoutBox = {
          ...box,
          showOverlay: isLast && hiddenCount > 0,
          overlayText: isLast && hiddenCount > 0 ? `+${hiddenCount}` : undefined,
        };
        
        // Convert static px layout to responsive percentages
        const leftPct = (box.x / containerWidth) * 100;
        const topPct = (box.y / layout.totalHeight) * 100;
        const widthPct = (box.width / containerWidth) * 100;
        const heightPct = (box.height / layout.totalHeight) * 100;

        return (
          <div
            key={box.media.id}
            onClick={() => onMediaClick?.(box.media)}
            role="button"
            tabIndex={0}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
            }}
          >
            {/* The tile itself fills this percentage-based wrapper */}
            <MediaTile 
              box={{...enhancedBox, x: 0, y: 0, width: '100%' as any, height: '100%' as any}} 
              sharedSecret={sharedSecret} 
            />
          </div>
        );
      })}
    </div>
  );
});

export { MediaGroup, MediaLayoutEngine };
export type { LayoutBox, LayoutResult };