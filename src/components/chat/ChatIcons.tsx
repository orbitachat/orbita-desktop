import React from 'react';

export const CustomPinIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="m11.294.984l3.722 3.722a1.75 1.75 0 0 1-.504 2.826l-1.327.613a3.09 3.09 0 0 0-1.707 2.084l-.584 2.454c-.317 1.332-1.972 1.8-2.94.832L5.75 11.311L1.78 15.28a.749.749 0 1 1-1.06-1.06l3.969-3.97l-2.204-2.204c-.968-.968-.5-2.623.832-2.94l2.454-.584a3.08 3.08 0 0 0 2.084-1.707l.613-1.327a1.75 1.75 0 0 1 2.826-.504M6.283 9.723l2.732 2.731a.25.25 0 0 0 .42-.119l.584-2.454a4.59 4.59 0 0 1 2.537-3.098l1.328-.613a.25.25 0 0 0 .072-.404l-3.722-3.722a.25.25 0 0 0-.404.072l-.613 1.328a4.58 4.58 0 0 1-3.098 2.537l-2.454.584a.25.25 0 0 0-.119.42l2.731 2.732Z" />
  </svg>
);

export const CustomUnpinIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} style={style}>
    <path d="m1.655.595l13.75 13.75q.22.219.22.53t-.22.53q-.219.22-.53.22t-.53-.22L.595 1.655q-.22-.219-.22-.53t.22-.53q.219-.22.53-.22t.53.22M.72 14.22l4.5-4.5q.219-.22.53-.22t.53.22q.22.219.22.53t-.22.53l-4.5 4.5q-.219.22-.53.22t-.53-.22q-.22-.219-.22-.53t.22-.53" />
    <path d="m5.424 6.146l-1.759.419q-.143.034-.183.175t.064.245l5.469 5.469q.104.104.245.064t.175-.183l.359-1.509q.072-.302.337-.465q.264-.163.567-.091t.465.337t.09.567l-.359 1.509q-.238.999-1.226 1.278q-.988.28-1.714-.446L2.485 8.046q-.726-.726-.446-1.714t1.278-1.226l1.759-.419q.303-.072.567.091q.265.163.337.465t-.091.567q-.163.264-.465.336M7.47 3.47q.155-.156.247-.355l.751-1.627Q8.851.659 9.75.498q.899-.16 1.544.486l3.722 3.722q.646.645.486 1.544t-.99 1.282l-1.627.751q-.199.092-.355.247q-.219.22-.53.22t-.53-.22q-.22-.219-.22-.53t.22-.53q.344-.345.787-.549l1.627-.751q.118-.055.141-.183t-.069-.221l-3.722-3.722q-.092-.092-.221-.069q-.128.023-.183.141l-.751 1.627q-.204.443-.549.787q-.219.22-.53.22t-.53-.22T7.25 4t.22-.53" />
  </svg>
);

export const CustomEditIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" className={className} style={style}>
    <path d="M3.782 16.31L3 21l4.69-.782a3.96 3.96 0 0 0 2.151-1.106L20.42 8.532a1.98 1.98 0 0 0 0-2.8L18.269 3.58a1.98 1.98 0 0 0-2.802 0L4.888 14.16a3.96 3.96 0 0 0-1.106 2.15M14 6l4 4" />
  </svg>
);

export const CustomReplyIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className} style={style}>
    <path d="M28.88 30a1 1 0 0 1-.88-.5A15.19 15.19 0 0 0 15 22v6a1 1 0 0 1-.62.92a1 1 0 0 1-1.09-.21l-12-12a1 1 0 0 1 0-1.42l12-12a1 1 0 0 1 1.09-.21A1 1 0 0 1 15 4v6.11a17.19 17.19 0 0 1 15 17a16 16 0 0 1-.13 2a1 1 0 0 1-.79.86ZM14.5 20A17.62 17.62 0 0 1 28 26a15.31 15.31 0 0 0-14.09-14a1 1 0 0 1-.91-1V6.41L3.41 16L13 25.59V21a1 1 0 0 1 1-1h.54Z" />
  </svg>
);

export const CustomClearHistoryIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" className={className} style={style}>
    <path d="M29.707 2.293a1 1 0 0 0-1.414 0l-9.341 9.34c-2.905-2.205-7.014-1.873-9.647.747l-1.368 1.277l-5.35 2.433a1 1 0 0 0-.294 1.617l12 12a1 1 0 0 0 1.617-.293l2.425-5.335l1.372-1.372a7.336 7.336 0 0 0 .66-9.66l9.34-9.34a1 1 0 0 0 0-1.414M8.283 15.697l8.02 8.02l-1.616 3.555l-9.96-9.959zm9.217 6.389l-7.561-7.561l.743-.694l.025-.024c2.13-2.13 5.497-2.188 7.586-.1a5.34 5.34 0 0 1 0 7.586z" />
  </svg>
);

export const CustomMuteIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className={className} style={style}>
    <path d="M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602A5 5 0 0 1 15 16m2.7-11a9 9 0 0 1 2.362 11.086m-1.676 2.299A9 9 0 0 1 17.7 19M9.069 5.054L9.5 4.5A.8.8 0 0 1 11 5v2m0 4v8a.8.8 0 0 1-1.5.5L6 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2l1.294-1.664M3 3l18 18" />
  </svg>
);

export const CustomUnmuteIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 16, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className={className} style={style}>
    <path d="M15 8a5 5 0 0 1 0 8m2.7-11a9 9 0 0 1 0 14M6 15H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h2l3.5-4.5A.8.8 0 0 1 11 5v14a.8.8 0 0 1-1.5.5z" />
  </svg>
);
