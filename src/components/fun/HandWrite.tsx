'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion, type Variants } from 'motion/react';
import styles from './HandWrite.module.css';

/** Seconds the "pen" spends per character. */
export const WRITE_SPEED = 0.075;

/** Pause (s) between words, while the pen lifts and moves on. */
const WORD_GAP = 0.09;

/** Time (s) `text` takes to be written, pauses between words included. */
export function writeDuration(text: string, speed = WRITE_SPEED) {
  return text.split(' ').reduce((t, w) => t + w.length * speed + WORD_GAP, 0);
}

// The negative insets leave room for cursive overhangs and descenders; once written the clip is
// dropped (transitionEnd) so glows and shadows are never cut.
const HIDDEN = 'inset(-0.4em 100% -0.4em -0.15em)';
const SHOWN = 'inset(-0.4em -0.15em -0.4em -0.15em)';

interface Timing {
  delay: number;
  duration: number;
}

const ink: Variants = {
  hidden: { clipPath: HIDDEN },
  shown: ({ delay, duration }: Timing) => ({
    clipPath: SHOWN,
    // Linear: a hand moves at a fairly steady speed along a word.
    transition: { delay, duration, ease: 'linear' },
    transitionEnd: { clipPath: 'none' },
  }),
};

// The nib travels with the edge of the ink, bobbing up and down like it is following the strokes.
const pen: Variants = {
  hidden: { left: '0%', opacity: 0, y: 0 },
  shown: ({ delay, duration }: Timing) => ({
    left: ['0%', '100%'],
    opacity: [0, 1, 1, 0],
    y: ['0em', '-0.22em', '0.04em', '-0.16em', '0.08em', '-0.2em', '0.02em', '-0.1em', '0em'],
    transition: {
      delay,
      duration,
      ease: 'linear',
      opacity: { delay, duration, times: [0, 0.04, 0.94, 1], ease: 'linear' },
    },
  }),
};

/**
 * Writes `text` out by hand, once it scrolls into view: each word is uncovered left to right, one after the other, with a
 * pen nib riding the edge of the ink. Screen readers get the plain text; with reduced motion
 * it just shows.
 */
export function HandWrite({
  text,
  delay = 0,
  speed = WRITE_SPEED,
  className,
}: {
  text: string;
  delay?: number;
  /** Seconds per character. */
  speed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  // Starts writing when the text scrolls into view, once. Watched on the container: the words
  // themselves are fully clipped at first, and a clipped element never counts as visible.
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const animate = reduce || seen ? 'shown' : 'hidden';
  // Start time of each word: the previous ones' writing time plus the pauses.
  const starts = words.map((_, i) => delay + (i ? writeDuration(words.slice(0, i).join(' '), speed) : 0));
  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i, arr) => {
          const timing: Timing = { delay: starts[i], duration: w.length * speed };
          const initial = reduce ? 'shown' : 'hidden';
          return (
            <span key={i}>
              <span className={styles.word}>
                <motion.span className={styles.ink} variants={ink} custom={timing} initial={initial} animate={animate}>
                  {w}
                </motion.span>
                {reduce ? null : (
                  <motion.span
                    className={styles.pen}
                    variants={pen}
                    custom={timing}
                    initial="hidden"
                    animate={animate}
                  />
                )}
              </span>
              {i < arr.length - 1 ? ' ' : null}
            </span>
          );
        })}
      </span>
    </span>
  );
}
