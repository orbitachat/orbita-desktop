import { useState, useEffect } from 'react';

type VisibilityListener = (visible: boolean) => void;

class AppVisibilityManager {
  private isVisible: boolean = typeof document !== 'undefined' ? !document.hidden : true;
  private isElectronWindowVisible: boolean = true;
  private listeners: Set<VisibilityListener> = new Set();
  private initialized: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    const update = () => {
      const docVisible = typeof document !== 'undefined' ? !document.hidden : true;
      const effectiveVisible = docVisible && this.isElectronWindowVisible;
      if (this.isVisible !== effectiveVisible) {
        this.isVisible = effectiveVisible;
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('app-paused', !effectiveVisible);
        }
        this.listeners.forEach((listener) => {
          try {
            listener(effectiveVisible);
          } catch {}
        });
        window.dispatchEvent(new CustomEvent('orbita:app-visibility', { detail: { visible: effectiveVisible } }));
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', update);
      window.addEventListener('pagehide', () => {
        this.isElectronWindowVisible = false;
        update();
      });
      window.addEventListener('pageshow', () => {
        this.isElectronWindowVisible = true;
        update();
      });
    }

    const orbita = (window as any)?.orbita;
    if (orbita?.onAppVisibilityChanged) {
      orbita.onAppVisibilityChanged((visible: boolean) => {
        this.isElectronWindowVisible = visible;
        update();
      });
    }

    const docVisible = typeof document !== 'undefined' ? !document.hidden : true;
    this.isVisible = docVisible && this.isElectronWindowVisible;
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
