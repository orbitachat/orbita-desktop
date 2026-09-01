import { createTheme } from '@mui/material/styles';
import { applyMd3DynamicTokens } from '../md3Dynamic';

export type ThemeId = 'system' | 'light' | 'dark';

export interface ThemePreview {
  bg: string;
  surface: string;
  accent: string;
  accentSecondary?: string;
  text: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  preview: ThemePreview;
  vars: Record<string, string>;
  isLight: boolean;
}

export interface ChatColorPreset {
  id: string;
  name: string;
  type: 'solid' | 'gradient';
  value: string;
}

export const DEFAULT_CHAT_COLOR = '#5c54e5';

export const CHAT_COLOR_PRESETS: ChatColorPreset[] = [
  { id: 'iris', name: 'Iris', type: 'solid', value: '#5c54e5' },
  { id: 'ultramarine', name: 'Ultramarine', type: 'solid', value: '#2c6bed' },
  { id: 'crimson', name: 'Crimson', type: 'solid', value: '#c41b4b' },
  { id: 'vermilion', name: 'Vermilion', type: 'solid', value: '#cf3d24' },
  { id: 'burlap', name: 'Burlap', type: 'solid', value: '#69664f' },
  { id: 'forest', name: 'Forest', type: 'solid', value: '#3c6e47' },
  { id: 'wintergreen', name: 'Wintergreen', type: 'solid', value: '#167a5b' },
  { id: 'teal', name: 'Teal', type: 'solid', value: '#0c7285' },
  { id: 'blue', name: 'Blue', type: 'solid', value: '#3761a6' },
  { id: 'indigo', name: 'Indigo', type: 'solid', value: '#5951c8' },
  { id: 'violet', name: 'Violet', type: 'solid', value: '#8038b3' },
  { id: 'plum', name: 'Plum', type: 'solid', value: '#9d3483' },
  { id: 'taupe', name: 'Taupe', type: 'solid', value: '#82626e' },
  { id: 'steel', name: 'Steel', type: 'solid', value: '#596678' },
  { id: 'ember', name: 'Ember', type: 'gradient', value: 'linear-gradient(135deg, #d33c2a 0%, #d87a20 100%)' },
  { id: 'midnight', name: 'Midnight', type: 'gradient', value: 'linear-gradient(135deg, #2b395d 0%, #584f7b 100%)' },
  { id: 'infrared', name: 'Infrared', type: 'gradient', value: 'linear-gradient(135deg, #7c2271 0%, #a42c55 100%)' },
  { id: 'lagoon', name: 'Lagoon', type: 'gradient', value: 'linear-gradient(135deg, #09687e 0%, #158b76 100%)' },
  { id: 'fluorescent', name: 'Fluorescent', type: 'gradient', value: 'linear-gradient(135deg, #762299 0%, #c42978 100%)' },
  { id: 'basil', name: 'Basil', type: 'gradient', value: 'linear-gradient(135deg, #206d4e 0%, #177a33 100%)' },
  { id: 'sublime', name: 'Sublime', type: 'gradient', value: 'linear-gradient(135deg, #4456a2 0%, #90539b 100%)' },
  { id: 'sea', name: 'Sea', type: 'gradient', value: 'linear-gradient(135deg, #246497 0%, #19808a 100%)' },
  { id: 'tangerine', name: 'Tangerine', type: 'gradient', value: 'linear-gradient(135deg, #bd3450 0%, #d86824 100%)' },
];

export const AVAILABLE_FONTS = {
  telegram: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  segoeUi: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
};

export const DEFAULT_FONT = "var(--main-font), 'Apple Color Emoji', sans-serif";

export const themePalettes: Record<ThemeId, ThemeDefinition> = {
  system: {
    id: 'system',
    name: 'System',
    isLight: false,
    preview: {
      bg: '#121212',
      surface: '#1b1b1b',
      accent: '#5c54e5',
      accentSecondary: '#7c75f2',
      text: '#f6f6f6',
    },
    vars: {
      '--bg-primary': '#121212',
      '--bg-secondary': '#1b1b1b',
      '--accent-color': '#5c54e5',
      '--accent-light': '#7c75f2',
      '--accent-dark': '#443db8',
      '--accent-glow': 'rgba(92,84,229,0.30)',
      '--accent-glow-light': 'rgba(92,84,229,0.15)',
      '--text-main': '#f6f6f6',
      '--text-dim': '#8e8e93',
      '--text-offline': '#636366',
      '--text-heading': '#ffffff',
      '--surface-container': '#282828',
      '--surface-container-strong': '#323232',
      '--surface-container-soft': 'rgba(255,255,255,0.05)',
      '--surface-muted': 'rgba(255,255,255,0.08)',
      '--surface-muted-strong': 'rgba(255,255,255,0.14)',
      '--surface-subtle': 'rgba(255,255,255,0.03)',
      '--border-color': '#242424',
      '--surface-border': '#282828',
      '--online-color': '#4caf50',
      '--offline-color': '#f44336',
      '--switch-bg': 'rgba(255,255,255,0.16)',
      '--selection-bg': 'rgba(92,84,229,0.28)',
      '--logo-type': 'classic',
      '--settings-bg': '#1b1b1b',
      '--settings-surface': '#262626',
      '--settings-surface-var': '#323232',
      '--settings-outline': '#282828',
      '--settings-outline-med': '#343434',
      '--settings-on-surface': '#f6f6f6',
      '--settings-on-surface-var': '#8e8e93',
      '--settings-primary': '#5c54e5',
      '--settings-on-primary': '#ffffff',
      '--settings-primary-cont': '#383296',
      '--settings-error': '#f44336',
      '--settings-error-cont': 'rgba(244,67,54,0.12)',
    },
  },
  light: {
    id: 'light',
    name: 'Daylight',
    isLight: true,
    preview: {
      bg: '#ffffff',
      surface: '#f5f5f5',
      accent: '#2c6bed',
      accentSecondary: '#548bf5',
      text: '#1b1b1b',
    },
    vars: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f7f7f8',
      '--accent-color': '#2c6bed',
      '--accent-light': '#548bf5',
      '--accent-dark': '#1f4bb6',
      '--accent-glow': 'rgba(44,107,237,0.25)',
      '--accent-glow-light': 'rgba(44,107,237,0.10)',
      '--text-main': '#1b1b1b',
      '--text-dim': '#6e6e73',
      '--text-offline': '#8e8e93',
      '--text-heading': '#000000',
      '--surface-container': '#f0f0f0',
      '--surface-container-strong': '#e5e5e7',
      '--surface-container-soft': 'rgba(0,0,0,0.04)',
      '--surface-muted': 'rgba(0,0,0,0.06)',
      '--surface-muted-strong': 'rgba(0,0,0,0.10)',
      '--surface-subtle': 'rgba(0,0,0,0.02)',
      '--border-color': '#e5e5e7',
      '--surface-border': '#e0e0e0',
      '--online-color': '#4caf50',
      '--offline-color': '#f44336',
      '--switch-bg': 'rgba(0,0,0,0.16)',
      '--selection-bg': 'rgba(44,107,237,0.20)',
      '--logo-type': 'classic',
      '--settings-bg': '#f7f7f8',
      '--settings-surface': '#ffffff',
      '--settings-surface-var': '#f0f0f0',
      '--settings-outline': '#e5e5e7',
      '--settings-outline-med': '#d1d1d6',
      '--settings-on-surface': '#1b1b1b',
      '--settings-on-surface-var': '#6e6e73',
      '--settings-primary': '#2c6bed',
      '--settings-on-primary': '#ffffff',
      '--settings-primary-cont': '#d9e6fd',
      '--settings-error': '#f44336',
      '--settings-error-cont': 'rgba(244,67,54,0.10)',
    },
  },
  dark: {
    id: 'dark',
    name: 'Night Sky',
    isLight: false,
    preview: {
      bg: '#121212',
      surface: '#1b1b1b',
      accent: '#5c54e5',
      accentSecondary: '#7c75f2',
      text: '#f6f6f6',
    },
    vars: {
      '--bg-primary': '#121212',
      '--bg-secondary': '#1b1b1b',
      '--accent-color': '#5c54e5',
      '--accent-light': '#7c75f2',
      '--accent-dark': '#443db8',
      '--accent-glow': 'rgba(92,84,229,0.30)',
      '--accent-glow-light': 'rgba(92,84,229,0.15)',
      '--text-main': '#f6f6f6',
      '--text-dim': '#8e8e93',
      '--text-offline': '#636366',
      '--text-heading': '#ffffff',
      '--surface-container': '#282828',
      '--surface-container-strong': '#323232',
      '--surface-container-soft': 'rgba(255,255,255,0.05)',
      '--surface-muted': 'rgba(255,255,255,0.08)',
      '--surface-muted-strong': 'rgba(255,255,255,0.14)',
      '--surface-subtle': 'rgba(255,255,255,0.03)',
      '--border-color': '#242424',
      '--surface-border': '#282828',
      '--online-color': '#4caf50',
      '--offline-color': '#f44336',
      '--switch-bg': 'rgba(255,255,255,0.16)',
      '--selection-bg': 'rgba(92,84,229,0.28)',
      '--logo-type': 'classic',
      '--settings-bg': '#1b1b1b',
      '--settings-surface': '#262626',
      '--settings-surface-var': '#323232',
      '--settings-outline': '#282828',
      '--settings-outline-med': '#343434',
      '--settings-on-surface': '#f6f6f6',
      '--settings-on-surface-var': '#8e8e93',
      '--settings-primary': '#5c54e5',
      '--settings-on-primary': '#ffffff',
      '--settings-primary-cont': '#383296',
      '--settings-error': '#f44336',
      '--settings-error-cont': 'rgba(244,67,54,0.12)',
    },
  },
};

export const availableThemes = Object.fromEntries(
  Object.values(themePalettes).map(({ id, name, preview }) => [id, { id, name, preview }])
) as Record<ThemeId, { id: ThemeId; name: string; preview: ThemePreview }>;

let systemThemeListenerAttached = false;

export const applyThemeToRoot = (themeId: ThemeId, chatColor?: string) => {
  let resolvedMode: 'light' | 'dark' = 'dark';
  if (themeId === 'system') {
    const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolvedMode = isDark ? 'dark' : 'light';
    if (!systemThemeListenerAttached && typeof window !== 'undefined' && window.matchMedia) {
      systemThemeListenerAttached = true;
      try {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        mql.addEventListener('change', () => {
          const activeThemeSetting = document.documentElement.getAttribute('data-theme-setting');
          if (activeThemeSetting === 'system' || !activeThemeSetting) {
            applyThemeToRoot('system');
          }
        });
      } catch (e) { }
    }
  } else if (themeId === 'light' || themeId === 'dark') {
    resolvedMode = themeId;
  }

  const theme = themePalettes[resolvedMode] || themePalettes.dark;
  const root = document.documentElement;

  root.setAttribute('data-theme-setting', themeId);
  root.setAttribute('data-theme', resolvedMode);
  root.setAttribute('data-theme-light', resolvedMode === 'light' ? 'true' : 'false');
  root.style.setProperty('--theme-id', themeId);

  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  const effectiveChatColor = chatColor || root.style.getPropertyValue('--chat-bubble-own-bg') || DEFAULT_CHAT_COLOR;
  root.style.setProperty('--chat-bubble-own-bg', effectiveChatColor);
  root.style.setProperty('--chat-bubble-incoming-bg', theme.vars['--surface-container'] || (resolvedMode === 'light' ? '#f0f0f0' : '#33363f'));
  root.style.setProperty('--chat-bubble-incoming-text', resolvedMode === 'light' ? '#1b1b1b' : '#f6f6f6');

  const solidAccent = effectiveChatColor.startsWith('linear-gradient')
    ? (effectiveChatColor.match(/#[a-fA-F0-9]{6}/)?.[0] || DEFAULT_CHAT_COLOR)
    : effectiveChatColor;

  root.style.setProperty('--accent-color', solidAccent);
  root.style.setProperty('--accent-glow', `color-mix(in srgb, ${solidAccent} 30%, transparent)`);
  root.style.setProperty('--accent-glow-light', `color-mix(in srgb, ${solidAccent} 15%, transparent)`);
  root.style.setProperty('--selection-bg', `color-mix(in srgb, ${solidAccent} 28%, transparent)`);
  root.style.setProperty('--settings-primary', solidAccent);

  root.style.setProperty('--surface-container', theme.vars['--surface-container'] || '#2e2e2e');
  root.style.setProperty('--surface-container-strong', theme.vars['--surface-container-strong'] || '#343434');
  root.style.setProperty('--surface-container-soft', theme.vars['--surface-container-soft'] || 'rgba(255,255,255,0.05)');
  root.style.setProperty('--surface-border', theme.vars['--surface-border'] || '#2e2e2e');

  root.style.setProperty('--md-bg', theme.vars['--settings-bg'] || theme.vars['--bg-secondary']);
  root.style.setProperty('--md-surface', theme.vars['--settings-surface'] || theme.vars['--surface-container']);
  root.style.setProperty('--md-surface-var', theme.vars['--settings-surface-var'] || theme.vars['--surface-container-strong']);
  root.style.setProperty('--md-outline', theme.vars['--settings-outline'] || theme.vars['--border-color']);
  root.style.setProperty('--md-outline-med', theme.vars['--settings-outline-med'] || theme.vars['--border-color']);
  root.style.setProperty('--md-on-surface', theme.vars['--settings-on-surface'] || theme.vars['--text-main']);
  root.style.setProperty('--md-on-surface-var', theme.vars['--settings-on-surface-var'] || theme.vars['--text-dim']);
  root.style.setProperty('--md-primary', solidAccent);
  root.style.setProperty('--md-on-primary', '#ffffff');
  root.style.setProperty('--md-primary-cont', solidAccent);
  root.style.setProperty('--md-error', theme.vars['--settings-error'] || '#f44336');
  root.style.setProperty('--md-error-cont', theme.vars['--settings-error-cont'] || 'rgba(244,67,54,0.12)');

  root.style.setProperty('--title-bar-bg', theme.vars['--settings-surface'] || theme.vars['--md-surface'] || theme.vars['--surface-container'] || '#1b1b1b');

  try {
    applyMd3DynamicTokens(
      root,
      solidAccent,
      theme.vars['--bg-secondary'] || '#1b1b1b',
      theme.isLight
    );
  } catch (e) { }

  try {
    if (typeof window !== 'undefined' && (window as any).orbita?.setThemeForElectron) {
      (window as any).orbita.setThemeForElectron(resolvedMode, {
        ...theme.vars,
        '--chat-bubble-own-bg': effectiveChatColor,
        '--md-surface': theme.vars['--settings-surface'] || theme.vars['--surface-container'],
        '--md-surface-var': theme.vars['--settings-surface-var'] || theme.vars['--surface-container-strong'],
      });
    }
  } catch (e) { }
};

const defaultFontFamily = DEFAULT_FONT;

const md3Theme = createTheme({
  cssVariables: false,
  shape: { borderRadius: 12 },
  palette: {
    mode: 'dark',
    primary: {
      main: themePalettes.dark.vars['--accent-color'],
      light: themePalettes.dark.vars['--accent-light'],
      dark: themePalettes.dark.vars['--accent-dark'],
    },
    background: {
      default: themePalettes.dark.vars['--bg-primary'],
      paper: themePalettes.dark.vars['--bg-secondary'],
    },
    text: {
      primary: themePalettes.dark.vars['--text-main'],
      secondary: themePalettes.dark.vars['--text-dim'],
    },
  },
  typography: {
    fontFamily: defaultFontFamily,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { fontSize: '16px' },
        body: { fontFamily: defaultFontFamily, fontSize: 'calc(14px * var(--text-scale, 1))' },
        '*, *::before, *::after': { fontFamily: defaultFontFamily },
      },
    },
    MuiButtonBase: {
      styleOverrides: { root: { fontSize: '14px', lineHeight: '20px' } },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '20px',
          padding: '10px 24px',
          minHeight: '40px',
          maxHeight: '40px',
          boxSizing: 'border-box',
          fontSize: '14px',
          lineHeight: '20px',
          fontFamily: defaultFontFamily,
          textTransform: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        },
        sizeSmall: { padding: '8px 16px', minHeight: '32px', maxHeight: '32px', fontSize: '13px', lineHeight: '18px' },
        sizeLarge: { padding: '12px 28px', minHeight: '44px', maxHeight: '44px', fontSize: '15px', lineHeight: '22px' },
        text: { padding: '10px 16px', minHeight: '40px', maxHeight: 'none', whiteSpace: 'normal' },
        contained: {
          background: 'linear-gradient(135deg, var(--md-sys-color-primary, var(--accent-color)) 0%, var(--accent-dark) 100%)',
          boxShadow: 'var(--md-sys-elevation-2, 0 2px 6px rgba(0,0,0,0.22))',
          '&:hover': {
            background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent-dark) 100%)',
            boxShadow: 'var(--md-sys-elevation-3, 0 4px 8px rgba(0,0,0,0.28))',
          },
        },
        outlined: {
          border: 'none',
          backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 10%, transparent)',
          color: 'var(--text-main, #fff)',
          '&:hover': {
            border: 'none',
            backgroundColor: 'color-mix(in srgb, var(--accent-color, #7C3AED) 16%, transparent)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { padding: '8px', fontSize: '18px', width: '40px', height: '40px', minWidth: '40px', minHeight: '40px', maxWidth: '40px', maxHeight: '40px', boxSizing: 'border-box', overflow: 'hidden', borderRadius: '12px' },
        sizeSmall: { padding: '4px', fontSize: '16px', width: '32px', height: '32px', minWidth: '32px', minHeight: '32px', maxWidth: '32px', maxHeight: '32px' },
        sizeLarge: { padding: '10px', fontSize: '22px', width: '48px', height: '48px', minWidth: '48px', minHeight: '48px', maxWidth: '48px', maxHeight: '48px' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--surface-container, rgba(255,255,255,0.05))',
          borderRadius: 'var(--md-sys-shape-corner-medium, 12px)',
          '& .MuiOutlinedInput-root': {
            fontFamily: defaultFontFamily,
            '& fieldset': { borderColor: 'var(--surface-border, rgba(255,255,255,0.15))' },
            '&:hover fieldset': { borderColor: 'var(--accent-color)' },
            '&.Mui-focused fieldset': { borderColor: 'var(--accent-color)' },
          },
          '& .MuiInputLabel-root': { fontFamily: defaultFontFamily },
          '& .MuiTypography-root': { fontFamily: defaultFontFamily },
        },
      },
    },
    MuiTypography: {
      styleOverrides: { root: { fontFamily: defaultFontFamily, fontWeight: 400 } },
    },
    MuiInputBase: {
      styleOverrides: { root: { fontFamily: defaultFontFamily } },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 52, height: 32, padding: 0,
          '& .MuiSwitch-switchBase': {
            padding: 4,
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: '#fff',
              '& + .MuiSwitch-track': { backgroundColor: 'var(--accent-color)', opacity: 1 },
            },
          },
          '& .MuiSwitch-thumb': { width: 24, height: 24, boxShadow: 'var(--md-sys-elevation-1, 0 1px 3px rgba(0,0,0,0.35))' },
          '& .MuiSwitch-track': {
            borderRadius: 'var(--md-sys-shape-corner-full, 9999px)',
            backgroundColor: 'var(--switch-bg, rgba(255,255,255,0.14))',
            opacity: 1,
          },
        },
      },
    },
  },
});

export default md3Theme;