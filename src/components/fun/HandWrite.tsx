'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';

/** Seconds the "pen" spends per character. */
export const WRITE_SPEED = 0.055;

/** Time (s) `text` takes to be written, pauses between words included. */
export function writeDuration(text: string) {
  return text.split(' ').reduce((t, w) => t + w.length * WRITE_SPEED + 0.06, 0);
}

// The negative insets leave room for cursive overhangs and descenders; once written the clip is
// dropped (transitionEnd) so glows and shadows are never cut.
const HIDDEN = 'inset(-0.4em 100% -0.4em -0.15em)';
const SHOWN = 'inset(-0.4em -0.15em -0.4em -0.15em)';

const word: Variants = {
  hidden: { clipPath: HIDDEN },
  shown: ({ delay, duration }: { delay: number; duration: number }) => ({
    clipPath: SHOWN,
    transition: { delay, duration, ease: [0.45, 0.05, 0.4, 1] },
    transitionEnd: { clipPath: 'none' },
  }),
};

/**
 * Writes `text` out by hand: each word is uncovered left to right, one after the other, like a
 * pen moving across the page. Screen readers get the plain text; with reduced motion it just shows.
 */
export function HandWrite({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  // Start time of each word: the previous ones' writing time plus a small pause.
  const starts = words.map((_, i) => delay + (i ? writeDuration(words.slice(0, i).join(' ')) : 0));
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i, arr) => {
          const duration = w.length * WRITE_SPEED;
          const start = starts[i];
          return (
            <span key={i}>
              <motion.span
                style={{ display: 'inline-block', whiteSpace: 'pre' }}
                variants={word}
                custom={{ delay: start, duration }}
                initial={reduce ? 'shown' : 'hidden'}
                animate="shown"
              >
                {w}
              </motion.span>
              {i < arr.length - 1 ? ' ' : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
