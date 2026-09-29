// components/auth/SpaceBackground.tsx
import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  opacity: number;
  color: 'white' | 'iris';
  angle: number;
  delay: number;
  startTime: number;
}

export const SpaceBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let stars: Star[] = [];
    let meteors: Meteor[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initStars();
    };

    const initStars = () => {
      stars = [];
      // Количество звёзд: ~500
      const count = Math.floor((canvas.width * canvas.height) / 3500);
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.3,
          opacity: Math.random() * 0.5 + 0.15,
          twinkleSpeed: Math.random() * 0.015 + 0.003,
          twinkleOffset: Math.random() * Math.PI * 2,
        });
      }
    };

    const createMeteor = (): Meteor => {
      const fromRight = Math.random() > 0.5;
      return {
        x: fromRight ? canvas.width + Math.random() * 200 : -Math.random() * 200,
        y: Math.random() * canvas.height * 0.6,
        length: Math.random() * 60 + 30,
        // Новая скорость: от 1 до 3 (медленнее)
        speed: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        color: Math.random() > 0.5 ? 'white' : 'iris',
        angle: fromRight ? Math.PI + (Math.random() * 0.3 - 0.15) : Math.random() * 0.3 - 0.15,
        // Новая задержка: от 10 до 25 секунд (реже)
        delay: 10000 + Math.random() * 15000,
        startTime: performance.now(),
      };
    };

    const initMeteors = () => {
      meteors = [];
      // Только один метеор одновременно
      meteors.push(createMeteor());
    };

    const draw = (time: number) => {
      // Если вкладка скрыта, пропускаем кадр для экономии ресурсов
      if (document.hidden) {
        animationIdRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Отрисовка звёзд (без свечения)
      stars.forEach((star) => {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.2 + 0.8;
        const opacity = star.opacity * twinkle;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.fill();
      });

      // Отрисовка метеоров (упрощённая)
      meteors.forEach((meteor, index) => {
        const elapsed = time - meteor.startTime;
        if (elapsed < meteor.delay) return;

        const activeTime = elapsed - meteor.delay;
        const dx = Math.cos(meteor.angle) * meteor.speed;
        const dy = Math.sin(meteor.angle) * meteor.speed;

        const currentX = meteor.x + dx * activeTime;
        const currentY = meteor.y + dy * activeTime;

        if (
          currentX < -200 ||
          currentX > canvas.width + 200 ||
          currentY < -200 ||
          currentY > canvas.height + 200
        ) {
          meteors[index] = createMeteor();
          return;
        }

        const tailX = currentX - Math.cos(meteor.angle) * meteor.length;
        const tailY = currentY - Math.sin(meteor.angle) * meteor.length;

        const color =
          meteor.color === 'white'
            ? `rgba(255, 255, 255, ${meteor.opacity})`
            : `rgba(167, 139, 250, ${meteor.opacity})`;

        // Хвост (линия)
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(currentX, currentY);
        ctx.strokeStyle = color;
        ctx.lineWidth = meteor.color === 'iris' ? 1.5 : 1;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Головка метеора
        ctx.beginPath();
        ctx.arc(currentX, currentY, 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });

      animationIdRef.current = requestAnimationFrame(draw);
    };

    resize();
    initMeteors();
    window.addEventListener('resize', resize);
    animationIdRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        filter: 'blur(0.3px) brightness(0.95)',
      }}
    />
  );
};