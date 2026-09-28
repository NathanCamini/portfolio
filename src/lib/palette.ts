/**
 * Reads the design tokens (CSS custom properties) so imperative renderers —
 * the WebGL scene and the 2D volleyball canvas — paint with exactly the same
 * colours as the DOM. Fallbacks mirror globals.css for SSR/tests.
 */
export interface Palette {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  a300: string;
  a600: string;
  a700: string;
  n100: string;
  n200: string;
  n300: string;
  n400: string;
  n500: string;
  n700: string;
  n800: string;
  n900: string;
  section: string;
  sectionGlow: string;
}

const FALLBACK: Palette = {
  bg: '#161826',
  surface: '#232532',
  text: '#e9e9ed',
  accent: '#9184d9',
  a300: '#d2cefd',
  a600: '#796cbf',
  a700: '#5d5294',
  n100: '#f3f5fe',
  n200: '#e4e7f5',
  n300: '#cfd3e5',
  n400: '#b2b6ca',
  n500: '#9397ab',
  n700: '#595d6c',
  n800: '#3f424d',
  n900: '#292b31',
  section: '#262a60',
  sectionGlow: '#353b80',
};

const TOKENS: Record<keyof Palette, string> = {
  bg: '--color-bg',
  surface: '--color-surface',
  text: '--color-text',
  accent: '--color-accent',
  a300: '--color-accent-300',
  a600: '--color-accent-600',
  a700: '--color-accent-700',
  n100: '--color-neutral-100',
  n200: '--color-neutral-200',
  n300: '--color-neutral-300',
  n400: '--color-neutral-400',
  n500: '--color-neutral-500',
  n700: '--color-neutral-700',
  n800: '--color-neutral-800',
  n900: '--color-neutral-900',
  section: '--color-section',
  sectionGlow: '--color-section-glow',
};

export function readPalette(): Palette {
  if (typeof window === 'undefined') return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const key of Object.keys(TOKENS) as (keyof Palette)[]) {
    const v = cs.getPropertyValue(TOKENS[key]).trim();
    if (v) out[key] = v;
  }
  return out;
}
