import { readPalette } from './palette';

/**
 * Confetti burst in the design-system colours. `canvas-confetti` is imported
 * lazily (only when a burst actually fires) and skipped for users who prefer
 * reduced motion.
 */
export async function celebrate(origin?: { x: number; y: number }, intensity = 1) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { default: confetti } = await import('canvas-confetti');
  const C = readPalette();
  const colors = [C.accent, C.a300, C.n100, '#f5c542', '#3aa0ff'];
  const base = { origin: origin ?? { x: 0.5, y: 0.6 }, colors, disableForReducedMotion: true, zIndex: 80 };
  confetti({ ...base, particleCount: Math.round(90 * intensity), spread: 75, startVelocity: 45 });
  confetti({ ...base, particleCount: Math.round(40 * intensity), spread: 120, startVelocity: 30, scalar: 0.8 });
}

/** Helper: confetti origin (0–1 viewport coords) at the centre of an element. */
export function originOf(el: Element | null): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}
