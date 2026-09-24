import { useState, useEffect } from 'react';

type VisibilityListener = (visible: boolean) => void;

class AppVisibilityManager {
  private isVisible: boolean = typeof document !== 'undefined' ? (!document.hidden && (document.hasFocus ? document.hasFocus() : true)) : true;
  private isElectronWindowVisible: boolean = true;
  private isElectronWindowFocused: boolean = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  private listeners: Set<VisibilityListener> = new Set();
  private blurTimeout: ReturnType<typeof setTimeout> | null = null;
  private initialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    const applyState = (target: boolean) => {
      if (this.isVisible !== target) {
        this.isVisible = target;
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('app-paused', !target);
        }
        this.listeners.forEach((listener) => {
          try {
            listener(target);
          } catch {}
        });
        window.dispatchEvent(new CustomEvent('orbita:app-visibility', { detail: { visible: target } }));
      }
    };

    const update = (immediate: boolean = false) => {
      const docVisible = typeof document !== 'undefined' ? !document.hidden : true;
      const docFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      const targetState = docVisible && this.isElectronWindowVisible && this.isElectronWindowFocused && docFocused;

      if (this.blurTimeout) {
        clearTimeout(this.blurTimeout);
        this.blurTimeout = null;
      }

      if (targetState) {
        applyState(true);
      } else if (immediate) {
        applyState(false);
      } else {
        this.blurTimeout = setTimeout(() => {
          this.blurTimeout = null;
          const freshDocVisible = typeof document !== 'undefined' ? !document.hidden : true;
          const freshDocFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
          const freshTargetState = freshDocVisible && this.isElectronWindowVisible && this.isElectronWindowFocused && freshDocFocused;
          applyState(freshTargetState);
        }, 150);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => update());
      window.addEventListener('focus', () => {
        this.isElectronWindowFocused = true;
        update(true);
      });
      window.addEventListener('blur', () => {
        this.isElectronWindowFocused = false;
        update(false);
      });
      window.addEventListener('pagehide', () => {
        this.isElectronWindowVisible = false;
        update(true);
      });
      window.addEventListener('pageshow', () => {
        this.isElectronWindowVisible = true;
        update(true);
      });
    }

    const orbita = (window as any)?.orbita;
    if (orbita?.onAppVisibilityChanged) {
      orbita.onAppVisibilityChanged((visible: boolean) => {
        this.isElectronWindowVisible = visible;
        update(!visible);
      });
    }

    if (orbita?.onAppFocusChanged) {
      orbita.onAppFocusChanged((focused: boolean) => {
        this.isElectronWindowFocused = focused;
        update(focused);
      });
    }

    const docVisible = typeof document !== 'undefined' ? !document.hidden : true;
    const docFocused = typeof document !== 'undefined' && typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    this.isVisible = docVisible && this.isElectronWindowVisible && this.isElectronWindowFocused && docFocused;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('app-paused', !this.isVisible);
    }
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public subscribe(listener: VisibilityListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const appVisibility = new AppVisibilityManager();

export function useAppVisibility(): boolean {
  const [visible, setVisible] = useState(() => appVisibility.getIsVisible());

  useEffect(() => {
    return appVisibility.subscribe((v) => setVisible(v));
  }, []);

  return visible;
}
