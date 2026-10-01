import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web';
import { appVisibility } from '../../utils/appVisibility';

interface TgsPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoplay?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const tgsCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();

const MAX_CONCURRENT_DECOMPRESSIONS = 2;
let activeDecompressions = 0;
const decompressionQueue: Array<() => void> = [];

async function acquireDecompressionSlot(): Promise<void> {
  if (activeDecompressions < MAX_CONCURRENT_DECOMPRESSIONS) {
    activeDecompressions++;
    return;
  }
  return new Promise((resolve) => {
    decompressionQueue.push(() => {
      activeDecompressions++;
      resolve();
    });
  });
}

function releaseDecompressionSlot(): void {
  activeDecompressions--;
  const next = decompressionQueue.shift();
  if (next) {
    next();
  }
}

type ObserverCallback = (isIntersecting: boolean) => void;
const observerCallbacks = new Map<Element, ObserverCallback>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const cb = observerCallbacks.get(entry.target);
          if (cb) {
            cb(entry.isIntersecting);
          }
        }
      },
      { rootMargin: '60px 0px 60px 0px', threshold: 0.01 }
    );
  }
  return sharedObserver;
}

function observeElement(el: Element, cb: ObserverCallback): () => void {
  const obs = getSharedObserver();
  if (!obs) {
    cb(true);
    return () => {};
  }
  observerCallbacks.set(el, cb);
  obs.observe(el);
  return () => {
    observerCallbacks.delete(el);
    obs.unobserve(el);
  };
}

const lottieInitQueue: Array<() => void> = [];
let lottieInitScheduled = false;

function processLottieQueue() {
  const batch = lottieInitQueue.splice(0, 3);
  for (let i = 0; i < batch.length; i++) {
    batch[i]();
  }
  if (lottieInitQueue.length > 0) {
    requestAnimationFrame(processLottieQueue);
  } else {
    lottieInitScheduled = false;
  }
}

function scheduleLottieInit(fn: () => void): () => void {
  lottieInitQueue.push(fn);
  if (!lottieInitScheduled) {
    lottieInitScheduled = true;
    requestAnimationFrame(processLottieQueue);
  }
  return () => {
    const idx = lottieInitQueue.indexOf(fn);
    if (idx !== -1) {
      lottieInitQueue.splice(idx, 1);
    }
  };
}

export function prewarmTgsAnimations(urls: string[]): void {
  let idx = 0;
  function step() {
    if (idx >= urls.length) return;
    const url = urls[idx++];
    if (!tgsCache.has(url)) {
      loadTgsAnimation(url).finally(() => {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(step);
        } else {
          setTimeout(step, 30);
        }
      });
    } else {
      step();
    }
  }
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(step);
  } else {
    setTimeout(step, 50);
  }
}

export async function loadTgsAnimation(src: string): Promise<any> {
  if (tgsCache.has(src)) {
    return tgsCache.get(src);
  }
  if (pendingRequests.has(src)) {
    return pendingRequests.get(src);
  }

  const promise = (async () => {
    await acquireDecompressionSlot();
    try {
      if (tgsCache.has(src)) {
        return tgsCache.get(src);
      }
      let res = await fetch(src).catch(() => null);
      if (!res || !res.ok) {
        const alt = src.startsWith('./')
          ? src.slice(1)
          : src.startsWith('/')
          ? `.${src}`
          : `/${src}`;
        res = await fetch(alt).catch(() => null);
      }
      if (!res || !res.ok) {
        throw new Error(`Failed to fetch sticker: ${src}`);
      }

      const blob = await res.blob();
      const ds = new DecompressionStream('gzip');
      const decompressed = blob.stream().pipeThrough(ds);
      const text = await new Response(decompressed).text();
      const json = JSON.parse(text);
      tgsCache.set(src, json);
      return json;
    } finally {
      releaseDecompressionSlot();
      pendingRequests.delete(src);
    }
  })();

  pendingRequests.set(src, promise);
  return promise;
}

export const TgsPlayer: React.FC<TgsPlayerProps> = ({
  src,
  className = '',
  style,
  loop = true,
  autoplay = true,
  onClick,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [shouldLoad, setShouldLoad] = useState<boolean>(() => tgsCache.has(src));
  const [animData, setAnimData] = useState<any>(() => tgsCache.get(src) || null);
  const [isReady, setIsReady] = useState(false);
  const hasPlayedRef = useRef(false);
  const isIntersectingRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!shouldLoad) return;
    let isMounted = true;
    if (!tgsCache.has(src)) {
      loadTgsAnimation(src)
        .then((data) => {
          if (isMounted) {
            setAnimData(data);
          }
        })
        .catch((err) => {
          console.error('[TgsPlayer] load error:', src, err);
        });
    } else {
      setAnimData(tgsCache.get(src));
    }
    return () => {
      isMounted = false;
    };
  }, [src, shouldLoad]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animData) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    let anim: AnimationItem | null = null;
    const cancelSchedule = scheduleLottieInit(() => {
      if (!containerRef.current) return;
      try {
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'canvas',
          loop,
          autoplay: false,
          animationData: animData,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            clearCanvas: true,
            progressiveLoad: true,
          },
        });
        anim.setSubframe(false);
        anim.addEventListener('DOMLoaded', () => {
          setIsReady(true);
          const canPlay = appVisibility.getIsVisible() && !document.hidden && isIntersectingRef.current;
          if (!canPlay) {
            anim?.goToAndStop(0, true);
          } else if (loop) {
            isPlayingRef.current = true;
            anim?.play();
          } else if (autoplay && !hasPlayedRef.current) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            anim?.goToAndPlay(0, true);
          }
        });
        anim.addEventListener('complete', () => {
          if (!loop) {
            isPlayingRef.current = false;
          }
        });
        animRef.current = anim;

        const isAppVis = appVisibility.getIsVisible() && !document.hidden;
        if (isIntersectingRef.current && isAppVis) {
          if (loop) {
            isPlayingRef.current = true;
            anim.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            anim.goToAndPlay(0, true);
          }
        } else {
          anim.goToAndStop(0, true);
        }
      } catch (e) {
        console.error('[TgsPlayer] render error:', e);
      }
    });

    return () => {
      cancelSchedule();
      if (anim) {
        anim.destroy();
      }
      animRef.current = null;
      isPlayingRef.current = false;
      setIsReady(false);
    };
  }, [animData, loop, autoplay]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) {
      setShouldLoad(true);
      isIntersectingRef.current = true;
      return;
    }

    return observeElement(el, (isIntersecting) => {
      isIntersectingRef.current = isIntersecting;
      if (isIntersecting) {
        setShouldLoad(true);
        const isAppVis = appVisibility.getIsVisible() && !document.hidden;
        if (isAppVis && animRef.current) {
          if (loop) {
            isPlayingRef.current = true;
            animRef.current.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            animRef.current.goToAndPlay(0, true);
          } else if (isPlayingRef.current) {
            animRef.current.play();
          }
        }
      } else {
        isPlayingRef.current = false;
        animRef.current?.pause();
      }
    });
  }, [loop, autoplay]);

  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      if (!visible) {
        isPlayingRef.current = false;
        animRef.current?.pause();
        try {
          (lottie as any).freeze?.();
        } catch {}
      } else {
        try {
          (lottie as any).unfreeze?.();
        } catch {}
        if (isIntersectingRef.current && animRef.current) {
          if (loop) {
            isPlayingRef.current = true;
            animRef.current.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            isPlayingRef.current = true;
            animRef.current.goToAndPlay(0, true);
          } else if (isPlayingRef.current) {
            animRef.current.play();
          }
        }
      }
    };

    return appVisibility.subscribe(handleVisibility);
  }, [loop, autoplay]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (animRef.current) {
      isPlayingRef.current = true;
      animRef.current.goToAndPlay(0, true);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
          opacity: isReady ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
