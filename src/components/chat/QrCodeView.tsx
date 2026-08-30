import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { useToastStore } from '../../store/useToastStore';

interface QrCodeViewProps {
  userId: string;
  avatarUrl?: string | null;
  nickname?: string | null;
}

interface GradientPreset {
  id: string;
  name: string;
  colors: string[];
  cssGradient: string;
  textColor: string;
}

const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'purple-blue',
    name: 'Purple Blue',
    colors: ['#a855f7', '#6366f1', '#38bdf8'],
    cssGradient: 'linear-gradient(135deg, #a855f7 0%, #6366f1 50%, #38bdf8 100%)',
    textColor: '#818cf8',
  },
  {
    id: 'cyan-teal',
    name: 'Cyan Teal',
    colors: ['#22d3ee', '#2dd4bf'],
    cssGradient: 'linear-gradient(135deg, #22d3ee 0%, #2dd4bf 100%)',
    textColor: '#22d3ee',
  },
  {
    id: 'lilac-pink',
    name: 'Lilac Pink',
    colors: ['#c084fc', '#f472b6'],
    cssGradient: 'linear-gradient(135deg, #c084fc 0%, #f472b6 100%)',
    textColor: '#d946ef',
  },
  {
    id: 'emerald-mint',
    name: 'Emerald Mint',
    colors: ['#10b981', '#34d399', '#6ee7b7'],
    cssGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)',
    textColor: '#34d399',
  },
  {
    id: 'sunset-peach',
    name: 'Sunset Peach',
    colors: ['#fb7185', '#f59e0b'],
    cssGradient: 'linear-gradient(135deg, #fb7185 0%, #f59e0b 100%)',
    textColor: '#fb923c',
  },
  {
    id: 'pink-rose',
    name: 'Pink Rose',
    colors: ['#ec4899', '#f43f5e'],
    cssGradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    textColor: '#f43f5e',
  },
  {
    id: 'amber-gold',
    name: 'Amber Gold',
    colors: ['#f59e0b', '#fbbf24'],
    cssGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
    textColor: '#f59e0b',
  },
  {
    id: 'neon-aura',
    name: 'Neon Aura',
    colors: ['#c084fc', '#38bdf8', '#34d399'],
    cssGradient: 'linear-gradient(135deg, #c084fc 0%, #38bdf8 50%, #34d399 100%)',
    textColor: '#38bdf8',
  },
];

const CARD_W = 320;
const CARD_H = 436;

function buildGrad(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  x0: number, y0: number, x1: number, y1: number
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (colors.length === 2) {
    g.addColorStop(0, colors[0]);
    g.addColorStop(1, colors[1]);
  } else {
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.5, colors[1]);
    g.addColorStop(1, colors[2]);
  }
  return g;
}

const logoImageCache = new Map<string, HTMLImageElement>();

function getOrbitaLogoSvg(colors: string[], idSuffix: string = ''): string {
  let stops = '';
  if (colors.length === 2) {
    stops = `<stop offset="0%" stop-color="${colors[0]}" /><stop offset="100%" stop-color="${colors[1]}" />`;
  } else {
    stops = `<stop offset="0%" stop-color="${colors[0]}" /><stop offset="50%" stop-color="${colors[1]}" /><stop offset="100%" stop-color="${colors[2]}" />`;
  }

  const gId = `qr-grad-${idSuffix}`;
  const fClip = `f-clip-${idSuffix}`;
  const bRingMask = `b-mask-${idSuffix}`;
  const pMask = `p-mask-${idSuffix}`;
  const rHole = `r-hole-${idSuffix}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <clipPath id="${fClip}">
      <rect x="-600" y="0" width="1200" height="600" />
    </clipPath>
    <mask id="${bRingMask}">
      <rect x="0" y="0" width="800" height="800" fill="white" />
      <circle cx="400" cy="400" r="192" fill="black" />
    </mask>
    <mask id="${pMask}">
      <rect x="0" y="0" width="800" height="800" fill="white" />
      <g transform="translate(400, 400) rotate(-26)">
        <path d="M 224 0 A 224 59 0 0 1 -224 0 L -376 0 A 376 121 0 0 0 376 0 Z" fill="black" />
      </g>
    </mask>
    <mask id="${rHole}">
      <rect x="-600" y="-600" width="1200" height="1200" fill="white" />
      <ellipse cx="0" cy="0" rx="240" ry="75" fill="black" />
    </mask>
    <linearGradient id="${gId}" x1="0%" y1="0%" x2="100%" y2="100%">
      ${stops}
    </linearGradient>
  </defs>
  <g mask="url(#${bRingMask})">
    <g transform="translate(400, 400) rotate(-26)">
      <ellipse cx="0" cy="0" rx="360" ry="105" fill="url(#${gId})" mask="url(#${rHole})" />
    </g>
  </g>
  <circle cx="400" cy="400" r="175" fill="url(#${gId})" mask="url(#${pMask})" />
  <g transform="translate(400, 400) rotate(-26)">
    <g clip-path="url(#${fClip})">
      <ellipse cx="0" cy="0" rx="360" ry="105" fill="url(#${gId})" mask="url(#${rHole})" />
    </g>
  </g>
</svg>`;
}

function getOrCreateLogoImage(preset: GradientPreset, onReady?: () => void): HTMLImageElement | null {
  const cached = logoImageCache.get(preset.id);
  if (cached) {
    if (cached.complete) return cached;
    if (onReady) cached.addEventListener('load', onReady, { once: true });
    return cached;
  }
  const svg = getOrbitaLogoSvg(preset.colors, preset.id);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  if (onReady) {
    img.addEventListener('load', onReady, { once: true });
  }
  img.src = dataUrl;
  logoImageCache.set(preset.id, img);
  return img.complete ? img : null;
}

if (typeof window !== 'undefined') {
  GRADIENT_PRESETS.forEach((p) => {
    getOrCreateLogoImage(p);
  });
}

export const QrCodeView: React.FC<QrCodeViewProps> = memo(({
  userId,
  avatarUrl,
  nickname,
}) => {
  const { t } = useTranslation();
  const [selectedPresetId, setSelectedPresetId] = useState<string>('purple-blue');
  const [qualityLevel, setQualityLevel] = useState<number>(1);
  const [textSize, setTextSize] = useState<number>(15);
  const [showAvatar, setShowAvatar] = useState<boolean>(true);
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [isCopying, setIsCopying] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const avatarImageRef = useRef<HTMLImageElement | null>(null);

  const activePreset = GRADIENT_PRESETS.find((p) => p.id === selectedPresetId) || GRADIENT_PRESETS[0];

  const qrData = React.useMemo(() => {
    if (!userId) return null;
    return QRCode.create(userId, { errorCorrectionLevel: 'H' });
  }, [userId]);

  const renderCardToCanvas = useCallback(
    (targetCanvas: HTMLCanvasElement, scale: number = 2) => {
      if (!userId || !qrData) return;
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return;

      const W = CARD_W * scale;
      const H = CARD_H * scale;
      const br = 14 * scale;

      targetCanvas.width = W;
      targetCanvas.height = H;
      ctx.clearRect(0, 0, W, H);

      if (!transparentBg) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, br);
        ctx.clip();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      const N = qrData.modules.size;

      const hasAvatar = showAvatar && !!avatarUrl;
      const avatarDiam = 66 * scale;
      const avatarRadius = avatarDiam / 2;
      const qrPad = 18 * scale;
      const qrSize = W - qrPad * 2;
      const cellSize = qrSize / N;
      const qrX = qrPad;
      const avTopMargin = 8 * scale;
      const avCX = W / 2;
      const avCY = avTopMargin + avatarRadius;
      const qrY = hasAvatar ? avTopMargin + avatarRadius + 8 * scale : 24 * scale;

      const logoMarginModules = 4;
      const centerModule = Math.floor(N / 2);
      const avatarClearance = 5 * scale;

      const isFinderZone = (r: number, c: number) => {
        if (r < 8 && c < 8) return true;
        if (r < 8 && c >= N - 8) return true;
        if (r >= N - 8 && c < 8) return true;
        return false;
      };

      const isLogoZone = (r: number, c: number) => {
        return Math.abs(r - centerModule) <= logoMarginModules && Math.abs(c - centerModule) <= logoMarginModules;
      };

      const isAvatarZone = (r: number, c: number) => {
        if (!hasAvatar) return false;
        const moduleCenterX = qrX + c * cellSize + cellSize / 2;
        const moduleCenterY = qrY + r * cellSize + cellSize / 2;
        return Math.hypot(moduleCenterX - avCX, moduleCenterY - avCY) < (avatarRadius + avatarClearance);
      };

      const isModuleActive = (r: number, c: number) => {
        if (r < 0 || r >= N || c < 0 || c >= N) return false;
        if (isFinderZone(r, c) || isLogoZone(r, c) || isAvatarZone(r, c)) return false;
        return !!qrData.modules.get(r, c);
      };

      const grad = buildGrad(
        ctx,
        activePreset.colors,
        qrX, qrY,
        qrX + qrSize, qrY + qrSize
      );

      ctx.save();
      ctx.fillStyle = grad;

      const R = cellSize * 0.46;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const x = qrX + c * cellSize;
          const y = qrY + r * cellSize;

          if (isModuleActive(r, c)) {
            const top = isModuleActive(r - 1, c);
            const bot = isModuleActive(r + 1, c);
            const lft = isModuleActive(r, c - 1);
            const rgt = isModuleActive(r, c + 1);

            const tl = !top && !lft;
            const tr = !top && !rgt;
            const bl = !bot && !lft;
            const br2 = !bot && !rgt;

            ctx.beginPath();
            ctx.moveTo(x + (tl ? R : 0), y);
            ctx.lineTo(x + cellSize - (tr ? R : 0), y);
            if (tr) ctx.arcTo(x + cellSize, y, x + cellSize, y + R, R);
            else ctx.lineTo(x + cellSize, y);
            ctx.lineTo(x + cellSize, y + cellSize - (br2 ? R : 0));
            if (br2) ctx.arcTo(x + cellSize, y + cellSize, x + cellSize - R, y + cellSize, R);
            else ctx.lineTo(x + cellSize, y + cellSize);
            ctx.lineTo(x + (bl ? R : 0), y + cellSize);
            if (bl) ctx.arcTo(x, y + cellSize, x, y + cellSize - R, R);
            else ctx.lineTo(x, y + cellSize);
            ctx.lineTo(x, y + (tl ? R : 0));
            if (tl) ctx.arcTo(x, y, x + R, y, R);
            else ctx.lineTo(x, y);
            ctx.closePath();
            ctx.fill();
          } else {
            if (isFinderZone(r, c) || isLogoZone(r, c) || isAvatarZone(r, c)) continue;

            const top = isModuleActive(r - 1, c);
            const bot = isModuleActive(r + 1, c);
            const lft = isModuleActive(r, c - 1);
            const rgt = isModuleActive(r, c + 1);

            const tl = top && lft && isModuleActive(r - 1, c - 1);
            const tr = top && rgt && isModuleActive(r - 1, c + 1);
            const bl = bot && lft && isModuleActive(r + 1, c - 1);
            const br2 = bot && rgt && isModuleActive(r + 1, c + 1);

            if (tl) {
              ctx.beginPath();
              ctx.moveTo(x, y + R);
              ctx.arcTo(x, y, x + R, y, R);
              ctx.lineTo(x, y);
              ctx.closePath();
              ctx.fill();
            }
            if (tr) {
              ctx.beginPath();
              ctx.moveTo(x + cellSize - R, y);
              ctx.arcTo(x + cellSize, y, x + cellSize, y + R, R);
              ctx.lineTo(x + cellSize, y);
              ctx.closePath();
              ctx.fill();
            }
            if (bl) {
              ctx.beginPath();
              ctx.moveTo(x, y + cellSize - R);
              ctx.arcTo(x, y + cellSize, x + R, y + cellSize, R);
              ctx.lineTo(x, y + cellSize);
              ctx.closePath();
              ctx.fill();
            }
            if (br2) {
              ctx.beginPath();
              ctx.moveTo(x + cellSize, y + cellSize - R);
              ctx.arcTo(x + cellSize, y + cellSize, x + cellSize - R, y + cellSize, R);
              ctx.lineTo(x + cellSize, y + cellSize);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }

      const drawFinder = (fx: number, fy: number) => {
        const outerS = 7 * cellSize;
        const outerR = 2.2 * cellSize;
        ctx.beginPath();
        ctx.roundRect(fx, fy, outerS, outerS, outerR);
        ctx.fillStyle = grad;
        ctx.fill();

        const midS = 5 * cellSize;
        const midR = 1.5 * cellSize;
        const midOff = cellSize;
        ctx.beginPath();
        ctx.roundRect(fx + midOff, fy + midOff, midS, midS, midR);
        if (transparentBg) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        const coreS = 3 * cellSize;
        const coreR = 1.1 * cellSize;
        const coreOff = 2 * cellSize;
        ctx.beginPath();
        ctx.roundRect(fx + coreOff, fy + coreOff, coreS, coreS, coreR);
        ctx.fillStyle = grad;
        ctx.fill();
      };

      drawFinder(qrX, qrY);
      drawFinder(qrX + (N - 7) * cellSize, qrY);
      drawFinder(qrX, qrY + (N - 7) * cellSize);

      ctx.restore();

      const logoCellSpan = logoMarginModules * 2 + 1;
      const logoAreaSize = logoCellSpan * cellSize;
      const logoCenterX = qrX + centerModule * cellSize + cellSize / 2;
      const logoCenterY = qrY + centerModule * cellSize + cellSize / 2;
      const logoDrawSize = logoAreaSize * 0.95;

      const logoImg = getOrCreateLogoImage(activePreset, () => {
        if (previewCanvasRef.current) {
          renderCardToCanvas(previewCanvasRef.current, 2);
        }
      });

      if (logoImg && logoImg.complete) {
        ctx.save();
        ctx.drawImage(
          logoImg,
          logoCenterX - logoDrawSize / 2,
          logoCenterY - logoDrawSize / 2,
          logoDrawSize,
          logoDrawSize
        );
        ctx.restore();
      }

      if (hasAvatar && avatarImageRef.current && avatarImageRef.current.complete) {
        ctx.save();
        if (!transparentBg) {
          ctx.beginPath();
          ctx.arc(avCX, avCY, avatarRadius + 3 * scale, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(avCX, avCY, avatarRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          avatarImageRef.current,
          avCX - avatarRadius,
          avCY - avatarRadius,
          avatarDiam,
          avatarDiam
        );
        ctx.restore();
      }

      const displayName = userId || (nickname ? `@${nickname}` : '');
      const lines: string[] = [];
      if (displayName.length > 20) {
        const mid = Math.ceil(displayName.length / 2);
        lines.push(displayName.substring(0, mid));
        lines.push(displayName.substring(mid));
      } else if (displayName) {
        lines.push(displayName);
      }

      const codeFontSize = textSize * scale;
      const lineGap = codeFontSize * 1.25;
      const textBlockHeight = (lines.length - 1) * lineGap;
      const textCenterY = qrY + qrSize + 22 * scale + textBlockHeight / 2;

      ctx.save();
      ctx.font = `700 ${codeFontSize}px "JetBrains Mono", Consolas, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const textGrad = buildGrad(
        ctx,
        activePreset.colors,
        qrX, textCenterY - textBlockHeight / 2,
        qrX + qrSize, textCenterY + textBlockHeight / 2
      );
      ctx.fillStyle = transparentBg ? '#ffffff' : textGrad;

      lines.forEach((line, idx) => {
        const y = textCenterY - textBlockHeight / 2 + idx * lineGap;
        ctx.fillText(line, W / 2, y);
      });
      ctx.restore();
    },
    [userId, qrData, avatarUrl, nickname, showAvatar, transparentBg, activePreset, textSize]
  );

  useEffect(() => {
    if (!avatarUrl) {
      avatarImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      avatarImageRef.current = img;
      if (previewCanvasRef.current) {
        renderCardToCanvas(previewCanvasRef.current, 2);
      }
    };
    img.src = avatarUrl;
  }, [avatarUrl, renderCardToCanvas]);

  useEffect(() => {
    if (previewCanvasRef.current) {
      renderCardToCanvas(previewCanvasRef.current, 2);
    }
  }, [renderCardToCanvas]);

  const handleCopyImage = async () => {
    if (isCopying || !userId) return;
    setIsCopying(true);
    try {
      const scaleMultiplier = qualityLevel === 0 ? 1.5 : qualityLevel === 1 ? 2.5 : 4;
      const exportCanvas = document.createElement('canvas');
      await renderCardToCanvas(exportCanvas, scaleMultiplier);

      const blob = await new Promise<Blob | null>((resolve) => {
        exportCanvas.toBlob((b) => resolve(b), 'image/png');
      });

      if (!blob) throw new Error('no blob');

      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        useToastStore.getState().showToast(t('qrModal.copied', 'QR-код скопирован в буфер обмена'), 'image');
      }
    } catch (_) {
    } finally {
      setIsCopying(false);
    }
  };

  const SectionBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div
      style={{
        backgroundColor: 'var(--md-surface, rgba(255,255,255,0.04))',
        borderRadius: '10px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {children}
    </div>
  );

  const Toggle: React.FC<{
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    ariaLabel: string;
  }> = ({ label, checked, onChange, ariaLabel }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-main, #fff)' }}>
        {label}
      </span>
      <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '24px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={ariaLabel}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: checked ? 'var(--accent-color, #7c54cc)' : 'rgba(255,255,255,0.18)',
            borderRadius: '24px',
            transition: 'background-color 0.2s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '3px',
              left: checked ? '21px' : '3px',
              width: '18px',
              height: '18px',
              backgroundColor: '#fff',
              borderRadius: '50%',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}
          />
        </span>
      </label>
    </div>
  );

  const DottedSlider: React.FC<{
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (v: number) => void;
    ariaLabel: string;
    labels?: string[];
  }> = ({ min, max, step, value, onChange, ariaLabel, labels }) => {
    const steps: number[] = [];
    for (let i = min; i <= max; i += step) steps.push(i);
    const pct = ((value - min) / (max - min)) * 100;

    return (
      <div>
        {labels && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            {labels.map((lbl, idx) => {
              const stepVal = min + idx * step;
              const active = value === stepVal;
              return (
                <span
                  key={lbl}
                  onClick={() => onChange(stepVal)}
                  style={{
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: active ? 'var(--accent-color, #7c54cc)' : 'var(--text-dim, rgba(255,255,255,0.45))',
                    fontWeight: active ? 600 : 400,
                    transition: 'color 0.15s',
                    userSelect: 'none',
                  }}
                >
                  {lbl}
                </span>
              );
            })}
          </div>
        )}
        <div style={{ position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '3px',
              borderRadius: '2px',
              background: `linear-gradient(to right, var(--accent-color, #7c54cc) ${pct}%, rgba(255,255,255,0.15) ${pct}%)`,
            }}
          />
          {steps.map((s) => {
            const dotPct = ((s - min) / (max - min)) * 100;
            const filled = s <= value;
            return (
              <div
                key={s}
                onClick={() => onChange(s)}
                style={{
                  position: 'absolute',
                  left: `${dotPct}%`,
                  transform: 'translateX(-50%)',
                  width: value === s ? '14px' : '8px',
                  height: value === s ? '14px' : '8px',
                  borderRadius: '50%',
                  backgroundColor: filled ? 'var(--accent-color, #7c54cc)' : 'rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  zIndex: 2,
                  transition: 'width 0.15s, height 0.15s, background-color 0.15s',
                  boxShadow: value === s ? '0 0 0 3px rgba(124,84,204,0.3)' : 'none',
                }}
              />
            );
          })}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={ariaLabel}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              width: '100%',
              opacity: 0,
              height: '20px',
              cursor: 'pointer',
              zIndex: 3,
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        padding: '0 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: 'var(--text-main, #ffffff)',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px 0 12px',
        }}
      >
        <canvas
          ref={previewCanvasRef}
          style={{
            width: `${CARD_W}px`,
            height: `${CARD_H}px`,
            borderRadius: '14px',
            boxShadow: transparentBg ? 'none' : '0 12px 36px rgba(0,0,0,0.5)',
            display: 'block',
            flexShrink: 0,
          }}
        />
      </div>

      <SectionBlock>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--accent-color, #9b7dd4)',
            letterSpacing: '0.02em',
          }}
        >
          {t('qrModal.choose_bg', 'Выберите фон')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
          }}
        >
          {GRADIENT_PRESETS.map((preset) => {
            const isSelected = preset.id === selectedPresetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPresetId(preset.id)}
                aria-label={preset.name}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: '10px',
                  background: preset.cssGradient,
                  border: 'none',
                  outline: isSelected ? '2px solid rgba(255,255,255,0.8)' : 'none',
                  outlineOffset: isSelected ? '2px' : '0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'outline 0.1s ease, transform 0.1s ease',
                  transform: isSelected ? 'scale(0.93)' : 'scale(1)',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    borderRadius: '7px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                    <path
                      fill="#ffffff"
                      d="M5 11h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm0 16h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2m0-6h4v4H5zm8-10v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2m6 4h-4V5h4zm-1 12.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5m-8-7v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m3.5 1.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5M13 17.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5m2.5 3.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m2-2h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5m1-6h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5m1 4h1c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5h-1c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5"
                    />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </SectionBlock>

      <SectionBlock>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-color, #9b7dd4)', letterSpacing: '0.02em' }}>
          {t('qrModal.quality', 'Качество')}
        </div>
        <DottedSlider
          min={0}
          max={2}
          step={1}
          value={qualityLevel}
          onChange={setQualityLevel}
          ariaLabel={t('qrModal.quality', 'Качество')}
          labels={[
            t('qrModal.quality_normal', 'Обычное'),
            t('qrModal.quality_high', 'Высокое'),
            t('qrModal.quality_very_high', 'Очень высокое'),
          ]}
        />
      </SectionBlock>

      <SectionBlock>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-color, #9b7dd4)', letterSpacing: '0.02em' }}>
            {t('qrModal.text_size', 'Размер текста')}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim, rgba(255,255,255,0.45))' }}>
            {textSize}px
          </span>
        </div>
        <DottedSlider
          min={11}
          max={19}
          step={1}
          value={textSize}
          onChange={setTextSize}
          ariaLabel={t('qrModal.text_size', 'Размер текста')}
        />
      </SectionBlock>

      <SectionBlock>
        {avatarUrl && (
          <Toggle
            label={t('qrModal.avatar', 'Фото профиля')}
            checked={showAvatar}
            onChange={setShowAvatar}
            ariaLabel={t('qrModal.avatar', 'Фото профиля')}
          />
        )}
        <Toggle
          label={t('qrModal.transparent_bg', 'Прозрачный фон')}
          checked={transparentBg}
          onChange={setTransparentBg}
          ariaLabel={t('qrModal.transparent_bg', 'Прозрачный фон')}
        />
      </SectionBlock>

      <button
        type="button"
        onClick={handleCopyImage}
        disabled={isCopying}
        aria-label={t('qrModal.copy', 'Копировать')}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '10px',
          border: 'none',
          outline: 'none',
          backgroundColor: 'var(--accent-color, #7c54cc)',
          color: '#ffffff',
          fontSize: '15px',
          fontWeight: 600,
          cursor: isCopying ? 'not-allowed' : 'pointer',
          opacity: isCopying ? 0.7 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.15s ease',
          marginTop: '4px',
        }}
      >
        {isCopying ? t('common.loading', 'Загрузка...') : t('qrModal.copy', 'Копировать')}
      </button>
    </div>
  );
});
