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

export async function loadTgsAnimation(src: string): Promise<any> {
  if (tgsCache.has(src)) {
    return tgsCache.get(src);
  }
  if (pendingRequests.has(src)) {
    return pendingRequests.get(src);
  }

  const promise = (async () => {
    try {
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
  loop = false,
  autoplay = true,
  onClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [animData, setAnimData] = useState<any>(() => tgsCache.get(src) || null);
  const hasPlayedRef = useRef(false);
  const isIntersectingRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => {
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
  }, [src]);

  const playOnce = () => {
    if (!animRef.current) return;
    isPlayingRef.current = true;
    animRef.current.goToAndPlay(0, true);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !animData) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    let anim: AnimationItem | null = null;
    try {
      anim = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop,
        autoplay: false,
        animationData: animData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      });
      anim.setSubframe(false);
      anim.addEventListener('complete', () => {
        isPlayingRef.current = false;
      });
      animRef.current = anim;

      if (isIntersectingRef.current && !document.hidden) {
        if (loop) {
          isPlayingRef.current = true;
          anim.play();
        } else if (!hasPlayedRef.current && autoplay) {
          hasPlayedRef.current = true;
          isPlayingRef.current = true;
          anim.goToAndPlay(0, true);
        }
      }
    } catch (e) {
      console.error('[TgsPlayer] render error:', e);
    }

    return () => {
      if (anim) {
        anim.destroy();
      }
      animRef.current = null;
      isPlayingRef.current = false;
    };
  }, [animData, loop, autoplay]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        isIntersectingRef.current = entry.isIntersecting;

        if (entry.isIntersecting) {
          if (!document.hidden) {
            if (loop) {
              isPlayingRef.current = true;
              animRef.current?.play();
            } else if (!hasPlayedRef.current && autoplay) {
              hasPlayedRef.current = true;
              playOnce();
            } else if (isPlayingRef.current) {
              animRef.current?.play();
            }
          }
        } else {
          if (isPlayingRef.current) {
            animRef.current?.pause();
          }
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [loop, autoplay]);

  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      if (!visible) {
        if (isPlayingRef.current) {
          animRef.current?.pause();
        }
      } else {
        if (isIntersectingRef.current) {
          if (loop) {
            isPlayingRef.current = true;
            animRef.current?.play();
          } else if (!hasPlayedRef.current && autoplay) {
            hasPlayedRef.current = true;
            playOnce();
          } else if (isPlayingRef.current) {
            animRef.current?.play();
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
      playOnce();
    }
  };

  const thumbUrl = src.replace('.tgs', '.webp');

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        ...style,
      }}
    >
      {!animData && (
        <img
          src={thumbUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
    </div>
  );
};
