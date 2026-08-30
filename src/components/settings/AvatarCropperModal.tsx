// src/components/settings/AvatarCropperModal.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RotateCw, Crop, FlipHorizontal } from 'lucide-react';

interface AvatarCropperModalProps {
  isOpen: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

const CROP_BOX_SIZE = 340;

export const AvatarCropperModal: React.FC<AvatarCropperModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onSave,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imgNatural, setImgNatural] = useState({ width: 1, height: 1 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  // Calculate base display size (to cover CROP_BOX_SIZE at scale = 1)
  const isRotated90 = rotation % 180 !== 0;
  const effectiveNatW = isRotated90 ? imgNatural.height : imgNatural.width;
  const effectiveNatH = isRotated90 ? imgNatural.width : imgNatural.height;
  const coverScale = Math.max(CROP_BOX_SIZE / effectiveNatW, CROP_BOX_SIZE / effectiveNatH);
  const baseWidth = imgNatural.width * coverScale;
  const baseHeight = imgNatural.height * coverScale;

  // Boundary clamping function (prevents crop frame from going outside image bounds)
  const clampPos = useCallback(
    (x: number, y: number, s: number, rot: number) => {
      const isRot = rot % 180 !== 0;
      const effW = (isRot ? baseHeight : baseWidth) * s;
      const effH = (isRot ? baseWidth : baseHeight) * s;
      const maxX = Math.max(0, (effW - CROP_BOX_SIZE) / 2);
      const maxY = Math.max(0, (effH - CROP_BOX_SIZE) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
    },
    [baseWidth, baseHeight]
  );

  // Reset state when opening a new image
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setRotation(0);
      setIsFlipped(false);
    }
  }, [isOpen, imageSrc]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgNatural({
      width: img.naturalWidth || 1,
      height: img.naturalHeight || 1,
    });
    setPosition({ x: 0, y: 0 });
    setScale(1);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const rawX = dragStartRef.current.posX + dx;
      const rawY = dragStartRef.current.posY + dy;
      setPosition(clampPos(rawX, rawY, scale, rotation));
    },
    [isDragging, clampPos, scale, rotation]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Ctrl + Mouse Wheel zoom (matching chat media viewer)
  useEffect(() => {
    if (!isOpen) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0025;
        setScale((prev) => {
          const next = Math.max(1.0, Math.min(5.0, prev + delta * prev));
          setPosition((pos) => clampPos(pos.x, pos.y, next, rotation));
          return next;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isOpen, clampPos, rotation]);

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setPosition((prev) => clampPos(prev.x, prev.y, scale, nextRot));
  };

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setIsFlipped(false);
  };

  const handleSaveCrop = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    const outputSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = outputSize / CROP_BOX_SIZE;
    const clamped = clampPos(position.x, position.y, scale, rotation);

    ctx.translate(outputSize / 2 + clamped.x * ratio, outputSize / 2 + clamped.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(isFlipped ? -1 : 1, 1);

    const drawW = baseWidth * scale * ratio;
    const drawH = baseHeight * scale * ratio;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    onSave(dataUrl);
    onClose();
  };

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(54, 54, 54, 0.8)',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* Viewport / Crop Area */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          width: `${CROP_BOX_SIZE}px`,
          height: `${CROP_BOX_SIZE}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          overflow: 'visible',
        }}
      >
        {/* Underlying Image */}
        <div
          style={{
            position: 'absolute',
            width: `${baseWidth}px`,
            height: `${baseHeight}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1}) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.05s ease-out',
            pointerEvents: 'none',
          }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={handleImageLoad}
            alt="crop target"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
          />
        </div>

        {/* Anti-aliased Vector SVG Mask & Guide Ring */}
        <svg
          style={{
            position: 'absolute',
            top: '-2000px',
            left: '-2000px',
            width: 'calc(100% + 4000px)',
            height: 'calc(100% + 4000px)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
          viewBox="-2000 -2000 4340 4340"
        >
          <defs>
            <mask id="avatar-crop-mask">
              <rect x="-2000" y="-2000" width="4340" height="4340" fill="#ffffff" />
              <circle cx="170" cy="170" r="170" fill="#000000" />
            </mask>
          </defs>
          <rect
            x="-2000"
            y="-2000"
            width="4340"
            height="4340"
            fill="rgba(0, 0, 0, 0.65)"
            mask="url(#avatar-crop-mask)"
          />
          <circle
            cx="170"
            cy="170"
            r="170"
            fill="none"
            stroke="rgba(255, 255, 255, 0.85)"
            strokeWidth="1.5"
            shapeRendering="geometricPrecision"
          />
        </svg>

        {/* Corner Brackets ┌ ┐ └ ┘ */}
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            left: '-2px',
            width: '24px',
            height: '24px',
            borderTop: '3.5px solid #ffffff',
            borderLeft: '3.5px solid #ffffff',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            width: '24px',
            height: '24px',
            borderTop: '3.5px solid #ffffff',
            borderRight: '3.5px solid #ffffff',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-2px',
            left: '-2px',
            width: '24px',
            height: '24px',
            borderBottom: '3.5px solid #ffffff',
            borderLeft: '3.5px solid #ffffff',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '24px',
            height: '24px',
            borderBottom: '3.5px solid #ffffff',
            borderRight: '3.5px solid #ffffff',
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
      </div>

      {/* Floating Bottom Control Pill (Exact match to Screenshot 3) */}
      <div
        style={{
          position: 'fixed',
          bottom: '36px',
          backgroundColor: 'rgba(24, 20, 34, 0.92)',
          backdropFilter: 'blur(16px)',
          borderRadius: '9999px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
          zIndex: 999999,
        }}
      >
        {/* Отмена */}
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Отмена
        </button>

        {/* Reset / Fit */}
        <button
          type="button"
          onClick={handleReset}
          title="Сбросить масштаб"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
        >
          <Crop size={18} />
        </button>

        {/* Rotate */}
        <button
          type="button"
          onClick={handleRotate}
          title="Повернуть на 90°"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
        >
          <RotateCw size={18} />
        </button>

        {/* Flip */}
        <button
          type="button"
          onClick={handleFlip}
          title="Отразить по горизонтали"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
        >
          <FlipHorizontal size={18} />
        </button>

        {/* Установить фотографию */}
        <button
          type="button"
          onClick={handleSaveCrop}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-color, #7084eb)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          Установить фотографию
        </button>
      </div>
    </div>
  );
};
