import React, { useEffect, useRef, useState } from 'react';
import lottie, { AnimationItem } from 'lottie-web/build/player/lottie_light';

interface TgsPlayerProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  loop?: boolean;
  autoplay?: boolean;
  renderer?: 'svg' | 'canvas';
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
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Failed to load ${src}`);
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
  renderer = 'svg',
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
        .catch(() => {});
    } else {
      setAnimData(tgsCache.get(src));
    }
    return () => {
      isMounted = false;
    };
  }, [src]);

  useEffect(() => {
    if (!containerRef.current || !animData) return;

    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
    }

    try {
      animRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer,
        loop,
        autoplay: hoverToPlay ? false : autoplay,
        animationData: animData,
      });
    } catch {}

    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
  }, [animData, loop, autoplay, renderer, hoverToPlay]);

  const handleMouseEnter = () => {
    if (hoverToPlay && animRef.current) {
      animRef.current.play();
    }
  };

  const handleMouseLeave = () => {
    if (hoverToPlay && animRef.current) {
      animRef.current.stop();
    }
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
};
