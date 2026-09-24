import React, { useEffect, useRef, useState, useCallback } from 'react';
import lottie, { AnimationItem } from 'lottie-web/build/player/lottie_light';

interface TgsPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoplay?: boolean;
  hoverToPlay?: boolean;
}

const tgsCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();
const queue: (() => Promise<void>)[] = [];
let activeWorkers = 0;
const MAX_CONCURRENT_DECOMPRESS = 3;

function runQueue() {
  while (activeWorkers < MAX_CONCURRENT_DECOMPRESS && queue.length > 0) {
    const task = queue.shift();
    if (task) {
      activeWorkers++;
      task().finally(() => {
        activeWorkers--;
        runQueue();
      });
    }
  }
}

export function loadTgsAnimation(src: string): Promise<any> {
  if (tgsCache.has(src)) {
    return Promise.resolve(tgsCache.get(src));
  }
  if (pendingRequests.has(src)) {
    return pendingRequests.get(src)!;
  }

  const promise = new Promise<any>((resolve, reject) => {
    queue.push(async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const ds = new DecompressionStream('gzip');
        const decompressed = blob.stream().pipeThrough(ds);
        const text = await new Response(decompressed).text();
        const json = JSON.parse(text);
        tgsCache.set(src, json);
        resolve(json);
      } catch (err) {
        reject(err);
      } finally {
        pendingRequests.delete(src);
      }
    });
    runQueue();
  });

  pendingRequests.set(src, promise);
  return promise;
}

export const TgsPlayer: React.FC<TgsPlayerProps> = ({
  src,
  className = '',
  style,
  loop = true,
  autoplay = true,
  hoverToPlay = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const isHoveredRef = useRef<boolean>(false);
  const isInViewRef = useRef<boolean>(false);
  const [animData, setAnimData] = useState<any>(() => tgsCache.get(src) || null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      isInViewRef.current = true;
      if (!animData) {
        loadTgsAnimation(src).then(setAnimData).catch(() => {});
      }
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const inView = entry.isIntersecting;
        isInViewRef.current = inView;

        if (inView) {
          if (!tgsCache.has(src)) {
            loadTgsAnimation(src)
              .then(setAnimData)
              .catch(() => {});
          } else {
            setAnimData(tgsCache.get(src));
          }

          if (animRef.current && autoplay && !hoverToPlay) {
            animRef.current.play();
          }
        } else {
          if (animRef.current) {
            animRef.current.pause();
          }
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [src, autoplay, hoverToPlay, animData]);

  useEffect(() => {
    if (!containerRef.current || !animData || !isInViewRef.current) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    try {
      const anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop,
        autoplay: false,
        animationData: animData,
      });

      anim.setSubframe(false);

      if (hoverToPlay) {
        anim.goToAndStop(0, true);
        if (isHoveredRef.current) {
          anim.play();
        }
      } else if (autoplay) {
        anim.play();
      } else {
        anim.goToAndStop(0, true);
      }

      animRef.current = anim;
    } catch {}

    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [animData, loop, autoplay, hoverToPlay]);

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
    if (hoverToPlay && animRef.current) {
      animRef.current.play();
    }
  }, [hoverToPlay]);

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
    if (hoverToPlay && animRef.current) {
      animRef.current.goToAndStop(0, true);
    }
  }, [hoverToPlay]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        contain: 'layout style paint',
        willChange: hoverToPlay ? 'auto' : 'contents',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
};
