// src/components/auth/OrbitaLogo.tsx
import React from 'react';

interface OrbitaLogoProps {
  size?: number;
  className?: string;
}

export const OrbitaLogo: React.FC<OrbitaLogoProps> = ({ size = 40, className = '' }) => {

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Внешнее янтарное свечение */}
      <div
        className="absolute -inset-4 rounded-full planet-glow"
        style={{
          background: 'radial-gradient(circle, rgba(120,53,15,0.22) 0%, rgba(120,53,15,0.08) 55%, transparent 80%)',
        }}
      />
      <div
        className="absolute -inset-8 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(124,45,18,0.10) 0%, rgba(124,45,18,0.04) 50%, transparent 75%)',
        }}
      />

      {/* Секция эллиптических колец (2 кольца вокруг орбиты) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Первое эллиптическое кольцо */}
        <div className="absolute w-[120%] h-[30%] orbit-ring" style={{ animationDuration: '12s' }}>
          <div className="w-full h-full rounded-[50%]" style={{
            transform: 'rotateX(78deg)',
            border: '1px solid rgba(200,170,120,0.3)',
            boxShadow: '0 0 10px rgba(180,140,80,0.15), 0 0 20px rgba(180,140,80,0.05)'
          }} />
        </div>
        {/* Второе эллиптическое кольцо */}
        <div className="absolute w-[120%] h-[30%] orbit-ring" style={{ animationDuration: '18s', animationDirection: 'reverse' }}>
          <div className="w-full h-full rounded-[50%]" style={{
            transform: 'rotateX(72deg) rotateZ(30deg)',
            border: '1px solid rgba(200,170,120,0.2)',
            boxShadow: '0 0 8px rgba(180,140,80,0.1), 0 0 16px rgba(180,140,80,0.03)'
          }} />
        </div>
      </div>

      {/* Секция круговых орбит с точками-спутниками */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Внутренняя орбита с желтой точкой */}
        <div className="absolute w-[110%] h-[110%] orbit-ring" style={{ animationDuration: '10s' }}>
          <div className="w-full h-full rounded-full" style={{
            border: '1.5px solid rgba(200,170,120,0.5)',
            boxShadow: '0 0 15px rgba(180,140,80,0.3)'
          }} />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
        </div>
        {/* Внешняя орбита со светло-желтой точкой */}
        <div className="absolute w-[140%] h-[140%] orbit-ring" style={{ animationDuration: '16s', animationDirection: 'reverse' }}>
          <div className="w-full h-full rounded-full" style={{
            border: '1px solid rgba(200,170,120,0.35)',
            boxShadow: '0 0 12px rgba(180,140,80,0.2)'
          }} />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,0.7)]" />
        </div>
      </div>

      {/* Центральное тело планеты (цвета из CSS-переменных темы) */}
      <div className="absolute inset-4 rounded-full overflow-hidden" style={{
        background: 'radial-gradient(circle at 38% 32%, var(--accent-light, #A78BFA) 0%, var(--accent-light, #A78BFA) 8%, var(--accent-color, #7C3AED) 20%, var(--accent-color, #7C3AED) 35%, var(--accent-dark, #5B21B6) 55%, var(--accent-dark, #5B21B6) 75%, var(--accent-dark, #5B21B6) 90%, var(--accent-dark, #5B21B6) 100%)',
        boxShadow: 'inset -25px -20px 50px rgba(0,0,0,0.8), inset 15px 15px 40px rgba(255,255,255,0.15), 0 0 50px var(--accent-glow, rgba(124,58,237,0.5)), 0 0 100px var(--accent-glow-light, rgba(124,58,237,0.3)), 0 0 150px rgba(0,0,0,0.15)'
      }}>
        {/* Дымчатая атмосфера */}
        <div className="absolute inset-0 opacity-30" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 60%, var(--accent-color, #7C3AED) 0%, transparent 70%)'
        }} />
        
        {/* Слой глубокой тени */}
        <div className="absolute inset-0 rounded-full" style={{
          background: 'radial-gradient(ellipse 85% 85% at 32% 28%, transparent 15%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.65) 80%, rgba(0,0,0,0.9) 100%)'
        }} />
        
        {/* Главный блик */}
        <div className="absolute top-[18%] left-[28%] w-[18%] h-[14%] rounded-full" style={{
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 30%, transparent 70%)',
          filter: 'blur(3px)'
        }} />
        
        {/* Маленькая точка света */}
        <div className="absolute top-[22%] left-[32%] w-[8%] h-[6%] rounded-full bg-white/60" style={{ filter: 'blur(2px)' }} />
      </div>
    </div>
  );
};