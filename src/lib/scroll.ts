import { animate } from 'motion/react';
import { EASE_OUT_SOFT } from '@/components/motion/easing';

/**
 * Smoothly scrolls the window so `el` sits just below the fixed navbar
 * (offset = the element's CSS `scroll-margin-top`).
 *
 * Why not `scrollIntoView({ behavior: 'smooth' })`? Browsers abort native
 * smooth scrolling when the document height changes mid-flight — exactly what
 * happens while a panel expands. A Motion tween writing `scrollTo` each frame
 * is immune to that, and it's cancelled as soon as the user scrolls themselves.
 */
export function scrollToElement(el: HTMLElement, { reduceMotion = false } = {}) {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const target = el.getBoundingClientRect().top + window.scrollY - margin;
  if (reduceMotion) {
    window.scrollTo({ top: target, behavior: 'instant' });
    return;
  }

  const controls = animate(window.scrollY, target, {
    duration: 0.75,
    ease: EASE_OUT_SOFT,
    // 'instant' bypasses the global `scroll-behavior: smooth` for each step.
    onUpdate: (y) => window.scrollTo({ top: y, behavior: 'instant' }),
  });

  const cancel = () => controls.stop();
  const opts = { once: true, passive: true } as const;
  window.addEventListener('wheel', cancel, opts);
  window.addEventListener('touchstart', cancel, opts);
  controls.then(() => {
    window.removeEventListener('wheel', cancel);
    window.removeEventListener('touchstart', cancel);
  });
}
