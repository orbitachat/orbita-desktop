/** MD3-style tokens derived from palette (Material You–like dynamic color on web). */

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function luminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function applyMd3DynamicTokens(root: HTMLElement, accentHex: string, surfaceHex: string, isLight: boolean): void {
  const accent = hexToRgb(accentHex) ?? [124, 58, 237];
  const surface = hexToRgb(surfaceHex) ?? [18, 19, 26];
  const onSurface = luminance(surface) > 0.5 ? [20, 20, 22] : [230, 230, 235];
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];

  const primaryContainer = rgbToHex(...mixRgb(surface, accent, isLight ? 0.18 : 0.22));
  const onPrimaryContainer = rgbToHex(...mixRgb(accent, onSurface as [number, number, number], isLight ? 0.85 : 0.75));
  const outline = rgbToHex(...mixRgb(surface, accent, isLight ? 0.35 : 0.28));
  const outlineVariant = rgbToHex(...mixRgb(surface, white, isLight ? 0.65 : 0.12));
  const scrim = isLight ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.55)';

  const shadowTint = rgbToHex(...mixRgb(accent, black, 0.55));
  const amb = isLight ? 0.08 : 0.18;
  const key = isLight ? 0.06 : 0.12;

  root.style.setProperty('--md-sys-color-primary', accentHex);
  root.style.setProperty('--md-sys-color-on-primary', luminance(accent) > 0.45 ? '#1a1a1a' : '#fafafa');
  root.style.setProperty('--md-sys-color-primary-container', primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', onPrimaryContainer);
  root.style.setProperty('--md-sys-color-outline', outline);
  root.style.setProperty('--md-sys-color-outline-variant', outlineVariant);
  root.style.setProperty('--md-sys-color-shadow', shadowTint);

  root.style.setProperty('--md-sys-elevation-0', 'none');
  root.style.setProperty(
    '--md-sys-elevation-1',
    `0 1px 2px ${scrim}, 0 1px 3px 1px color-mix(in srgb, var(--md-sys-color-shadow) ${Math.round(amb * 100)}%, transparent)`
  );
  root.style.setProperty(
    '--md-sys-elevation-2',
    `0 1px 2px ${scrim}, 0 2px 6px 2px color-mix(in srgb, var(--md-sys-color-shadow) ${Math.round(key * 100)}%, transparent)`
  );
  root.style.setProperty(
    '--md-sys-elevation-3',
    `0 2px 3px ${scrim}, 0 4px 8px 3px color-mix(in srgb, var(--md-sys-color-shadow) 22%, transparent)`
  );

  root.style.setProperty('--md-sys-shape-corner-extra-small', '4px');
  root.style.setProperty('--md-sys-shape-corner-small', '8px');
  root.style.setProperty('--md-sys-shape-corner-medium', '12px');
  root.style.setProperty('--md-sys-shape-corner-large', '16px');
  root.style.setProperty('--md-sys-shape-corner-extra-large', '28px');
  root.style.setProperty('--md-sys-shape-corner-full', '9999px');
}