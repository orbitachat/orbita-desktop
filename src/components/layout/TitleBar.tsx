// src/components/layout/TitleBar.tsx
import React, { useEffect, useState } from 'react';

export const isElectronApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).__ELECTRON_RENDERER__ ||
    (window as any).orbita?.getDesktopSources ||
    (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent))
  );
};

export const TitleBar = () => {
  const isElectron = isElectronApp();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoverSuppressed, setIsHoverSuppressed] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    const orbita = (window as any).orbita;

    const checkMaximized = async () => {
      try {
        if (orbita?.isWindowMaximized) {
          const result = await orbita.isWindowMaximized();
          setIsMaximized(result);
        }
      } catch {}
    };
    checkMaximized();

    let unsubscribe: (() => void) | undefined;
    try {
      if (orbita?.onWindowStateChange) {
        unsubscribe = orbita.onWindowStateChange((maximized: boolean) => {
          setIsMaximized(maximized);
          setIsHoverSuppressed(true);
        });
      }
    } catch {}

    const handleMouseMove = () => {
      setIsHoverSuppressed(false);
    };

    const handleBlur = () => {
      setIsHoverSuppressed(true);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('blur', handleBlur);

    return () => {
      unsubscribe?.();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const handleMinimize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.minimizeWindow?.()); } catch {}
  };

  const handleMaximize = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.maximizeWindow?.()); } catch {}
  };

  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.closeWindow?.()); } catch {}
  };

  const handleDoubleClick = () => {
    setIsHoverSuppressed(true);
    try { ((window as any).orbita?.doubleClickTitleBar?.()); } catch {}
  };

  const MinimizeIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 5H10" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
    </svg>
  );

  const MaximizeIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
    </svg>
  );

  const RestoreIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 0.5H9.5V7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
      <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="var(--title-bar-bg, var(--md-surface, #2a253b))" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" strokeLinecap="square" />
    </svg>
  );

  const btnClass = `orbita-titlebar-btn ${isHoverSuppressed ? 'hover-suppressed' : ''}`;

  if (!isElectron) {
    return null;
  }

  return (
    <div
      className="flex items-center justify-end flex-shrink-0 select-none"
      style={{
        height: '30px',
        width: '100%',
        backgroundColor: 'var(--title-bar-bg, var(--md-surface, #2a253b))',
        padding: 0,
        margin: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <style>{`
        .orbita-titlebar-btn {
          width: 30px;
          height: 30px;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text-dim, #9f96b3);
          cursor: pointer;
          padding: 0;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.12s ease, color 0.12s ease;
          -webkit-app-region: no-drag;
          user-select: none;
        }
        .orbita-titlebar-btn:not(.hover-suppressed):hover {
          background-color: rgba(255, 255, 255, 0.08);
          color: var(--text-main, #ffffff);
        }
        .orbita-titlebar-btn:not(.hover-suppressed):active {
          background-color: rgba(255, 255, 255, 0.16);
        }
        .orbita-titlebar-btn:focus {
          outline: none;
        }
      `}</style>
      <div
        className="flex items-center h-full"
        style={{
          height: '100%',
          // @ts-ignore
          WebkitAppRegion: 'no-drag',
        }}
      >
        <button
          onClick={handleMinimize}
          className={btnClass}
          aria-label="Minimize"
        >
          <MinimizeIcon />
        </button>

        <button
          onClick={handleMaximize}
          className={btnClass}
          aria-label="Maximize"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        <button
          onClick={handleClose}
          className={btnClass}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
};
