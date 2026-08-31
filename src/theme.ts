// src/theme.ts
import { createTheme } from '@mui/material/styles';
import { applyMd3DynamicTokens } from '../md3Dynamic';

export type ThemeId =
  | 'orbita'
  | 'deep-space'
  | 'cyberpunk-neon'
  | 'ghost'
  | 'dark'
  | 'light'
  | 'soft-breeze'
  | 'sunrise'
  | 'warm'
  | 'obsidian'
  | 'anime'
  | 'kernel-panic';

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

export const AVAILABLE_FONTS = {
  telegram: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  segoeUi: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
};

export const DEFAULT_FONT = "var(--main-font), 'Apple Color Emoji', sans-serif";

// ============ Theme palettes ============
export const themePalettes: Record<ThemeId, ThemeDefinition> = {
  orbita: {
    id: 'orbita',
    name: 'Orbita Purple',
    isLight: false,
    preview: {
      bg: '#14111d',
      surface: '#211d2f',
      accent: '#9b7dd4',
      accentSecondary: '#b89fee',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#14111d',
      '--bg-secondary': '#1b1727',
      '--accent-color': '#9b7dd4',
      '--accent-light': '#b89fee',
      '--accent-dark':  '#7d5ebd',
      '--accent-glow':  'rgba(155,125,212,0.32)',
      '--accent-glow-light': 'rgba(155,125,212,0.16)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#9f96b3',
      '--text-offline': '#6f6782',
      '--text-heading': '#ffffff',
      '--surface-container':        '#252033',
      '--surface-container-strong': '#2f2940',
      '--surface-container-soft':   'rgba(155,125,212,0.05)',
      '--surface-muted':            'rgba(155,125,212,0.08)',
      '--surface-muted-strong':     'rgba(155,125,212,0.15)',
      '--surface-subtle':           'rgba(155,125,212,0.04)',
      '--border-color':   'rgba(155,125,212,0.12)',
      '--surface-border': 'rgba(155,125,212,0.10)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(155,125,212,0.18)',
      '--selection-bg':  'rgba(155,125,212,0.28)',
      '--logo-type':     'jupiter',
      '--settings-bg':             '#211d2f',
      '--settings-surface':        '#2a253b',
      '--settings-surface-var':    '#342e47',
      '--settings-outline':        'rgba(155,125,212,0.14)',
      '--settings-outline-med':    'rgba(155,125,212,0.24)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#9f96b3',
      '--settings-primary':        '#9b7dd4',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#42345e',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  'deep-space': {
    id: 'deep-space',
    name: 'Arctic Blue',
    isLight: false,
    preview: {
      bg: '#0f141c',
      surface: '#18222d',
      accent: '#4ea4f6',
      accentSecondary: '#78bcf9',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#0f141c',
      '--bg-secondary': '#141b24',
      '--accent-color': '#4ea4f6',
      '--accent-light': '#78bcf9',
      '--accent-dark':  '#2f87dc',
      '--accent-glow':  'rgba(78,164,246,0.30)',
      '--accent-glow-light': 'rgba(78,164,246,0.15)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#8699ab',
      '--text-offline': '#546677',
      '--text-heading': '#ffffff',
      '--surface-container':        '#1c2836',
      '--surface-container-strong': '#253547',
      '--surface-container-soft':   'rgba(78,164,246,0.05)',
      '--surface-muted':            'rgba(78,164,246,0.08)',
      '--surface-muted-strong':     'rgba(78,164,246,0.15)',
      '--surface-subtle':           'rgba(78,164,246,0.03)',
      '--border-color':   'rgba(78,164,246,0.12)',
      '--surface-border': 'rgba(78,164,246,0.09)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(78,164,246,0.18)',
      '--selection-bg':  'rgba(78,164,246,0.26)',
      '--logo-type':     'classic',
      '--settings-bg':             '#18222d',
      '--settings-surface':        '#212e3d',
      '--settings-surface-var':    '#2b3c4f',
      '--settings-outline':        'rgba(78,164,246,0.14)',
      '--settings-outline-med':    'rgba(78,164,246,0.24)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#8699ab',
      '--settings-primary':        '#78bcf9',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#1d466e',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  'cyberpunk-neon': {
    id: 'cyberpunk-neon',
    name: 'Neon Amethyst',
    isLight: false,
    preview: {
      bg: '#140d18',
      surface: '#221629',
      accent: '#d455b8',
      accentSecondary: '#ea7ad3',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#140d18',
      '--bg-secondary': '#1b1120',
      '--accent-color': '#d455b8',
      '--accent-light': '#ea7ad3',
      '--accent-dark':  '#b03896',
      '--accent-glow':  'rgba(212,85,184,0.36)',
      '--accent-glow-light': 'rgba(212,85,184,0.18)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#ad94b0',
      '--text-offline': '#6f5d72',
      '--text-heading': '#ffffff',
      '--surface-container':        '#26182e',
      '--surface-container-strong': '#33213e',
      '--surface-container-soft':   'rgba(212,85,184,0.05)',
      '--surface-muted':            'rgba(212,85,184,0.08)',
      '--surface-muted-strong':     'rgba(212,85,184,0.16)',
      '--surface-subtle':           'rgba(212,85,184,0.03)',
      '--border-color':   'rgba(212,85,184,0.14)',
      '--surface-border': 'rgba(212,85,184,0.10)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(212,85,184,0.20)',
      '--selection-bg':  'rgba(212,85,184,0.30)',
      '--logo-type':     'classic',
      '--settings-bg':             '#221629',
      '--settings-surface':        '#2c1c35',
      '--settings-surface-var':    '#382444',
      '--settings-outline':        'rgba(212,85,184,0.16)',
      '--settings-outline-med':    'rgba(212,85,184,0.26)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#ad94b0',
      '--settings-primary':        '#ea7ad3',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#522147',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  ghost: {
    id: 'ghost',
    name: 'Graphite',
    isLight: false,
    preview: {
      bg: '#111418',
      surface: '#1c2228',
      accent: '#7e9bb8',
      accentSecondary: '#a0b7d0',
      text: '#e6e9ee',
    },
    vars: {
      '--bg-primary':   '#111418',
      '--bg-secondary': '#161b20',
      '--accent-color': '#7e9bb8',
      '--accent-light': '#a0b7d0',
      '--accent-dark':  '#5f7c9a',
      '--accent-glow':  'rgba(126,155,184,0.30)',
      '--accent-glow-light': 'rgba(126,155,184,0.15)',
      '--text-main':    '#e6e9ee',
      '--text-dim':     '#8b97a6',
      '--text-offline': '#586370',
      '--text-heading': '#ffffff',
      '--surface-container':        '#1f272e',
      '--surface-container-strong': '#29333d',
      '--surface-container-soft':   'rgba(126,155,184,0.05)',
      '--surface-muted':            'rgba(126,155,184,0.08)',
      '--surface-muted-strong':     'rgba(126,155,184,0.15)',
      '--surface-subtle':           'rgba(126,155,184,0.03)',
      '--border-color':   'rgba(126,155,184,0.12)',
      '--surface-border': 'rgba(126,155,184,0.09)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(126,155,184,0.18)',
      '--selection-bg':  'rgba(126,155,184,0.26)',
      '--logo-type':     'classic',
      '--settings-bg':             '#1c2228',
      '--settings-surface':        '#242c34',
      '--settings-surface-var':    '#2e3742',
      '--settings-outline':        'rgba(126,155,184,0.14)',
      '--settings-outline-med':    'rgba(126,155,184,0.24)',
      '--settings-on-surface':     '#e6e9ee',
      '--settings-on-surface-var': '#8b97a6',
      '--settings-primary':        '#a0b7d0',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#2b3e52',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  dark: {
    id: 'dark',
    name: 'Night Sky',
    isLight: false,
    preview: {
      bg: '#0e1621',
      surface: '#17212b',
      accent: '#5288c1',
      accentSecondary: '#6ab2f2',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#0e1621',
      '--bg-secondary': '#17212b',
      '--accent-color': '#5288c1',
      '--accent-light': '#6ab2f2',
      '--accent-dark':  '#3a71ab',
      '--accent-glow':  'rgba(82,136,193,0.30)',
      '--accent-glow-light': 'rgba(82,136,193,0.15)',
      '--text-main':    '#f5f5f5',
      '--text-dim':     '#7f91a4',
      '--text-offline': '#52606f',
      '--text-heading': '#ffffff',
      '--surface-container':        '#1f2c3c',
      '--surface-container-strong': '#28394d',
      '--surface-container-soft':   'rgba(82,136,193,0.05)',
      '--surface-muted':            'rgba(82,136,193,0.08)',
      '--surface-muted-strong':     'rgba(82,136,193,0.15)',
      '--surface-subtle':           'rgba(82,136,193,0.03)',
      '--border-color':   'rgba(82,136,193,0.12)',
      '--surface-border': 'rgba(82,136,193,0.09)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(82,136,193,0.18)',
      '--selection-bg':  'rgba(82,136,193,0.26)',
      '--logo-type':     'classic',
      '--settings-bg':             '#17212b',
      '--settings-surface':        '#202c3a',
      '--settings-surface-var':    '#293849',
      '--settings-outline':        'rgba(82,136,193,0.14)',
      '--settings-outline-med':    'rgba(82,136,193,0.24)',
      '--settings-on-surface':     '#f5f5f5',
      '--settings-on-surface-var': '#7f91a4',
      '--settings-primary':        '#6ab2f2',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#1f3d5e',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  light: {
    id: 'light',
    name: 'Daylight',
    isLight: true,
    preview: {
      bg: '#ffffff',
      surface: '#f4f4f5',
      accent: '#3390ec',
      accentSecondary: '#54a3f5',
      text: '#000000',
    },
    vars: {
      '--bg-primary':   '#ffffff',
      '--bg-secondary': '#f4f4f5',
      '--accent-color': '#3390ec',
      '--accent-light': '#54a3f5',
      '--accent-dark':  '#207cdb',
      '--accent-glow':  'rgba(51,144,236,0.16)',
      '--accent-glow-light': 'rgba(51,144,236,0.08)',
      '--text-main':    '#000000',
      '--text-dim':     '#707579',
      '--text-offline': '#9da3a8',
      '--text-heading': '#000000',
      '--surface-container':        '#eef2f6',
      '--surface-container-strong': '#e3e8ee',
      '--surface-container-soft':   'rgba(51,144,236,0.04)',
      '--surface-muted':            'rgba(51,144,236,0.06)',
      '--surface-muted-strong':     'rgba(51,144,236,0.12)',
      '--surface-subtle':           'rgba(51,144,236,0.02)',
      '--border-color':   'rgba(0,0,0,0.08)',
      '--surface-border': 'rgba(0,0,0,0.06)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(51,144,236,0.14)',
      '--selection-bg':  'rgba(51,144,236,0.16)',
      '--logo-type':     'classic',
      '--settings-bg':             '#ffffff',
      '--settings-surface':        '#f4f4f5',
      '--settings-surface-var':    '#e9edf2',
      '--settings-outline':        'rgba(0,0,0,0.08)',
      '--settings-outline-med':    'rgba(0,0,0,0.16)',
      '--settings-on-surface':     '#000000',
      '--settings-on-surface-var': '#707579',
      '--settings-primary':        '#3390ec',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#d8e8fc',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.10)',
    },
  },
  'soft-breeze': {
    id: 'soft-breeze',
    name: 'Ice Mint',
    isLight: true,
    preview: {
      bg: '#f5f9fa',
      surface: '#e4f1f5',
      accent: '#22a6b3',
      accentSecondary: '#42c0cd',
      text: '#000000',
    },
    vars: {
      '--bg-primary':   '#f5f9fa',
      '--bg-secondary': '#ebf4f7',
      '--accent-color': '#22a6b3',
      '--accent-light': '#42c0cd',
      '--accent-dark':  '#178994',
      '--accent-glow':  'rgba(34,166,179,0.16)',
      '--accent-glow-light': 'rgba(34,166,179,0.08)',
      '--text-main':    '#000000',
      '--text-dim':     '#64747b',
      '--text-offline': '#95a4aa',
      '--text-heading': '#000000',
      '--surface-container':        '#dbeef3',
      '--surface-container-strong': '#cde3e9',
      '--surface-container-soft':   'rgba(34,166,179,0.04)',
      '--surface-muted':            'rgba(34,166,179,0.07)',
      '--surface-muted-strong':     'rgba(34,166,179,0.13)',
      '--surface-subtle':           'rgba(34,166,179,0.02)',
      '--border-color':   'rgba(34,166,179,0.10)',
      '--surface-border': 'rgba(34,166,179,0.07)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(34,166,179,0.14)',
      '--selection-bg':  'rgba(34,166,179,0.16)',
      '--logo-type':     'classic',
      '--settings-bg':             '#f5f9fa',
      '--settings-surface':        '#e4f1f5',
      '--settings-surface-var':    '#d7e9ee',
      '--settings-outline':        'rgba(34,166,179,0.10)',
      '--settings-outline-med':    'rgba(34,166,179,0.18)',
      '--settings-on-surface':     '#000000',
      '--settings-on-surface-var': '#64747b',
      '--settings-primary':        '#22a6b3',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#c8ecf0',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.10)',
    },
  },
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise Glow',
    isLight: true,
    preview: {
      bg: '#fffbf5',
      surface: '#f5edd9',
      accent: '#d97706',
      accentSecondary: '#f59e0b',
      text: '#000000',
    },
    vars: {
      '--bg-primary':   '#fffbf5',
      '--bg-secondary': '#faf3e3',
      '--accent-color': '#d97706',
      '--accent-light': '#f59e0b',
      '--accent-dark':  '#b45309',
      '--accent-glow':  'rgba(217,119,6,0.16)',
      '--accent-glow-light': 'rgba(217,119,6,0.08)',
      '--text-main':    '#000000',
      '--text-dim':     '#786c58',
      '--text-offline': '#a49884',
      '--text-heading': '#000000',
      '--surface-container':        '#ece1c6',
      '--surface-container-strong': '#dfd2b4',
      '--surface-container-soft':   'rgba(217,119,6,0.04)',
      '--surface-muted':            'rgba(217,119,6,0.07)',
      '--surface-muted-strong':     'rgba(217,119,6,0.13)',
      '--surface-subtle':           'rgba(217,119,6,0.02)',
      '--border-color':   'rgba(217,119,6,0.10)',
      '--surface-border': 'rgba(217,119,6,0.07)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(217,119,6,0.14)',
      '--selection-bg':  'rgba(217,119,6,0.16)',
      '--logo-type':     'classic',
      '--settings-bg':             '#fffbf5',
      '--settings-surface':        '#f5edd9',
      '--settings-surface-var':    '#ebdcc0',
      '--settings-outline':        'rgba(217,119,6,0.10)',
      '--settings-outline-med':    'rgba(217,119,6,0.18)',
      '--settings-on-surface':     '#000000',
      '--settings-on-surface-var': '#786c58',
      '--settings-primary':        '#d97706',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#fae5b6',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.10)',
    },
  },
  warm: {
    id: 'warm',
    name: 'Amber',
    isLight: false,
    preview: {
      bg: '#151210',
      surface: '#231c18',
      accent: '#e58c49',
      accentSecondary: '#f5a96e',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#151210',
      '--bg-secondary': '#1c1714',
      '--accent-color': '#e58c49',
      '--accent-light': '#f5a96e',
      '--accent-dark':  '#c46e2f',
      '--accent-glow':  'rgba(229,140,73,0.30)',
      '--accent-glow-light': 'rgba(229,140,73,0.15)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#a4968d',
      '--text-offline': '#6c6159',
      '--text-heading': '#ffffff',
      '--surface-container':        '#2a221d',
      '--surface-container-strong': '#382d27',
      '--surface-container-soft':   'rgba(229,140,73,0.05)',
      '--surface-muted':            'rgba(229,140,73,0.08)',
      '--surface-muted-strong':     'rgba(229,140,73,0.15)',
      '--surface-subtle':           'rgba(229,140,73,0.03)',
      '--border-color':   'rgba(229,140,73,0.12)',
      '--surface-border': 'rgba(229,140,73,0.09)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(229,140,73,0.18)',
      '--selection-bg':  'rgba(229,140,73,0.26)',
      '--logo-type':     'classic',
      '--settings-bg':             '#231c18',
      '--settings-surface':        '#2e2520',
      '--settings-surface-var':    '#3c3029',
      '--settings-outline':        'rgba(229,140,73,0.14)',
      '--settings-outline-med':    'rgba(229,140,73,0.24)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#a4968d',
      '--settings-primary':        '#f5a96e',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#5e381c',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  obsidian: {
    id: 'obsidian',
    name: 'Onyx',
    isLight: false,
    preview: {
      bg: '#000000',
      surface: '#141416',
      accent: '#8774e1',
      accentSecondary: '#ab9df2',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#000000',
      '--bg-secondary': '#0f0f12',
      '--accent-color': '#8774e1',
      '--accent-light': '#ab9df2',
      '--accent-dark':  '#6d58cd',
      '--accent-glow':  'rgba(135,116,225,0.32)',
      '--accent-glow-light': 'rgba(135,116,225,0.16)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#8c8c96',
      '--text-offline': '#585860',
      '--text-heading': '#ffffff',
      '--surface-container':        '#18181c',
      '--surface-container-strong': '#232328',
      '--surface-container-soft':   'rgba(135,116,225,0.05)',
      '--surface-muted':            'rgba(135,116,225,0.08)',
      '--surface-muted-strong':     'rgba(135,116,225,0.15)',
      '--surface-subtle':           'rgba(135,116,225,0.03)',
      '--border-color':   'rgba(255,255,255,0.08)',
      '--surface-border': 'rgba(255,255,255,0.06)',
      '--online-color':  '#7bc862',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(135,116,225,0.18)',
      '--selection-bg':  'rgba(135,116,225,0.28)',
      '--logo-type':     'classic',
      '--settings-bg':             '#141416',
      '--settings-surface':        '#1f1f23',
      '--settings-surface-var':    '#2a2a30',
      '--settings-outline':        'rgba(135,116,225,0.14)',
      '--settings-outline-med':    'rgba(135,116,225,0.24)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#8c8c96',
      '--settings-primary':        '#ab9df2',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#3b3166',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  anime: {
    id: 'anime',
    name: 'Emerald',
    isLight: false,
    preview: {
      bg: '#0e1612',
      surface: '#18241e',
      accent: '#4fae6f',
      accentSecondary: '#72c890',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#0e1612',
      '--bg-secondary': '#131e18',
      '--accent-color': '#4fae6f',
      '--accent-light': '#72c890',
      '--accent-dark':  '#388f55',
      '--accent-glow':  'rgba(79,174,111,0.30)',
      '--accent-glow-light': 'rgba(79,174,111,0.15)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#879e90',
      '--text-offline': '#55685d',
      '--text-heading': '#ffffff',
      '--surface-container':        '#1d2c25',
      '--surface-container-strong': '#273a31',
      '--surface-container-soft':   'rgba(79,174,111,0.05)',
      '--surface-muted':            'rgba(79,174,111,0.08)',
      '--surface-muted-strong':     'rgba(79,174,111,0.15)',
      '--surface-subtle':           'rgba(79,174,111,0.03)',
      '--border-color':   'rgba(79,174,111,0.12)',
      '--surface-border': 'rgba(79,174,111,0.09)',
      '--online-color':  '#4fae6f',
      '--offline-color': '#ff595a',
      '--switch-bg':     'rgba(79,174,111,0.18)',
      '--selection-bg':  'rgba(79,174,111,0.26)',
      '--logo-type':     'classic',
      '--settings-bg':             '#18241e',
      '--settings-surface':        '#203028',
      '--settings-surface-var':    '#2b3e34',
      '--settings-outline':        'rgba(79,174,111,0.14)',
      '--settings-outline-med':    'rgba(79,174,111,0.24)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#879e90',
      '--settings-primary':        '#72c890',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#1f4d30',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
  'kernel-panic': {
    id: 'kernel-panic',
    name: 'Crimson',
    isLight: false,
    preview: {
      bg: '#170e10',
      surface: '#261619',
      accent: '#eb5757',
      accentSecondary: '#f27d7d',
      text: '#ffffff',
    },
    vars: {
      '--bg-primary':   '#170e10',
      '--bg-secondary': '#1f1215',
      '--accent-color': '#eb5757',
      '--accent-light': '#f27d7d',
      '--accent-dark':  '#c93636',
      '--accent-glow':  'rgba(235,87,87,0.32)',
      '--accent-glow-light': 'rgba(235,87,87,0.16)',
      '--text-main':    '#ffffff',
      '--text-dim':     '#aa9194',
      '--text-offline': '#705a5d',
      '--text-heading': '#ffffff',
      '--surface-container':        '#2c191d',
      '--surface-container-strong': '#3a2126',
      '--surface-container-soft':   'rgba(235,87,87,0.05)',
      '--surface-muted':            'rgba(235,87,87,0.08)',
      '--surface-muted-strong':     'rgba(235,87,87,0.15)',
      '--surface-subtle':           'rgba(235,87,87,0.03)',
      '--border-color':   'rgba(235,87,87,0.14)',
      '--surface-border': 'rgba(235,87,87,0.10)',
      '--online-color':  '#7bc862',
      '--offline-color': '#eb5757',
      '--switch-bg':     'rgba(235,87,87,0.20)',
      '--selection-bg':  'rgba(235,87,87,0.28)',
      '--logo-type':     'classic',
      '--settings-bg':             '#261619',
      '--settings-surface':        '#321d21',
      '--settings-surface-var':    '#40242a',
      '--settings-outline':        'rgba(235,87,87,0.16)',
      '--settings-outline-med':    'rgba(235,87,87,0.26)',
      '--settings-on-surface':     '#ffffff',
      '--settings-on-surface-var': '#aa9194',
      '--settings-primary':        '#f27d7d',
      '--settings-on-primary':     '#ffffff',
      '--settings-primary-cont':   '#5e2226',
      '--settings-error':          '#ff595a',
      '--settings-error-cont':     'rgba(255,89,90,0.12)',
    },
  },
};

export const availableThemes = Object.fromEntries(
  Object.values(themePalettes).map(({ id, name, preview }) => [id, { id, name, preview }])
) as Record<ThemeId, { id: ThemeId; name: string; preview: ThemePreview }>;

// ============ Instant application ============
export const applyThemeToRoot = (themeId: ThemeId) => {
  const theme = themePalettes[themeId] || themePalettes.orbita;
  const root = document.documentElement;

  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  root.style.setProperty('--surface-container',        theme.vars['--surface-container'] || theme.vars['--surface-muted'] || 'rgba(255,255,255,0.07)');
  root.style.setProperty('--surface-container-strong', theme.vars['--surface-container-strong'] || theme.vars['--surface-muted-strong'] || 'rgba(255,255,255,0.13)');
  root.style.setProperty('--surface-container-soft',   theme.vars['--surface-container-soft'] || theme.vars['--surface-subtle'] || 'rgba(255,255,255,0.03)');
  root.style.setProperty('--surface-border',           theme.vars['--surface-border'] || theme.vars['--border-color'] || 'rgba(255,255,255,0.10)');

  root.style.setProperty('--md-bg',             theme.vars['--settings-bg']           || theme.vars['--bg-secondary']);
  root.style.setProperty('--md-surface',        theme.vars['--settings-surface']      || theme.vars['--surface-container']);
  root.style.setProperty('--md-surface-var',    theme.vars['--settings-surface-var']  || theme.vars['--surface-container-strong']);
  root.style.setProperty('--md-outline',        theme.vars['--settings-outline']      || theme.vars['--border-color']);
  root.style.setProperty('--md-outline-med',    theme.vars['--settings-outline-med']  || theme.vars['--border-color']);
  root.style.setProperty('--md-on-surface',     theme.vars['--settings-on-surface']   || theme.vars['--text-main']);
  root.style.setProperty('--md-on-surface-var', theme.vars['--settings-on-surface-var'] || theme.vars['--text-dim']);
  root.style.setProperty('--md-primary',        theme.vars['--settings-primary']      || theme.vars['--accent-color']);
  root.style.setProperty('--md-on-primary',     theme.vars['--settings-on-primary']   || '#ffffff');
  root.style.setProperty('--md-primary-cont',   theme.vars['--settings-primary-cont'] || theme.vars['--accent-dark']);
  root.style.setProperty('--md-error',          theme.vars['--settings-error']        || '#ff595a');
  root.style.setProperty('--md-error-cont',     theme.vars['--settings-error-cont']   || 'rgba(255,89,90,0.12)');

  root.style.setProperty('--title-bar-bg', theme.vars['--settings-surface'] || theme.vars['--md-surface'] || theme.vars['--surface-container'] || '#2a253b');

  root.style.setProperty('--theme-id', theme.id);
  root.setAttribute('data-theme', theme.id);
  root.setAttribute('data-theme-light', theme.isLight ? 'true' : 'false');

  try {
    applyMd3DynamicTokens(
      root,
      theme.vars['--accent-color'] || '#3390ec',
      theme.vars['--bg-secondary'] || '#2c2c2c',
      theme.isLight
    );
  } catch (e) {
    console.error('[orbita/theme] applyMd3DynamicTokens failed', e);
  }

  try {
    if (typeof window !== 'undefined' && (window as any).orbita?.setThemeForElectron) {
      (window as any).orbita.setThemeForElectron(theme.id, {
        ...theme.vars,
        '--md-surface': theme.vars['--settings-surface'] || theme.vars['--surface-container'],
        '--md-surface-var': theme.vars['--settings-surface-var'] || theme.vars['--surface-container-strong'],
      });
    }
  } catch (e) {}
};

const defaultFontFamily = DEFAULT_FONT;

const md3Theme = createTheme({
  cssVariables: false,
  shape: { borderRadius: 12 },
  palette: {
    mode: 'dark',
    primary: {
      main: themePalettes.orbita.vars['--accent-color'],
      light: themePalettes.orbita.vars['--accent-light'],
      dark: themePalettes.orbita.vars['--accent-dark'],
    },
    background: {
      default: themePalettes.orbita.vars['--bg-primary'],
      paper:   themePalettes.orbita.vars['--bg-secondary'],
    },
    text: {
      primary:   themePalettes.orbita.vars['--text-main'],
      secondary: themePalettes.orbita.vars['--text-dim'],
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