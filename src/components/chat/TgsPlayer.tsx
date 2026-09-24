import React, { useEffect, useRef, useState, useCallback } from 'react';
import lottie, { AnimationItem } from 'lottie-web';

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
  loop = true,
  autoplay = true,
  hoverToPlay = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const [animData, setAnimData] = useState<any>(() => tgsCache.get(src) || null);

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
        loop: hoverToPlay ? true : loop,
        autoplay: false,
        animationData: animData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true,
          hideOnTransparent: false,
        },
      });

      if (hoverToPlay) {
        anim.goToAndStop(0, true);
      } else if (autoplay) {
        anim.play();
      } else {
        anim.goToAndStop(0, true);
      }

      animRef.current = anim;
    } catch (e) {
      console.error('[TgsPlayer] render error:', e);
    }

    return () => {
      if (anim) {
        anim.destroy();
      }
      animRef.current = null;
    };
  }, [animData, loop, autoplay, hoverToPlay]);

  const handleMouseEnter = useCallback(() => {
    if (hoverToPlay && animRef.current) {
      animRef.current.goToAndPlay(0, true);
    }
  }, [hoverToPlay]);

  const handleMouseLeave = useCallback(() => {
    if (hoverToPlay && animRef.current) {
      animRef.current.goToAndStop(0, true);
    }
  }, [hoverToPlay]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
};
