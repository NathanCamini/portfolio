'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import styles from './RotatingText.module.css';

/**
 * Cycles through `words`; each one flips in letter by letter (3D tilt + blur)
 * and flips out upward. Screen readers get all options once, as plain text.
 */
export function RotatingText({ words, interval = 3600 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => window.clearInterval(id);
  }, [words.length, interval, reduce]);

  const word = words[i % words.length];

  return (
    <span className={styles.slot}>
      <span className="sr-only">{words.join(' / ')}</span>
      {/* Invisible copies of every phrase share the slot's grid cell, so the slot is
          exactly as tall as the longest phrase at the current width — no jump, no gap. */}
      {words.map((w) => (
        <span key={w} className={styles.ghost} aria-hidden="true">
          {w}
        </span>
      ))}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={word} className={styles.word} aria-hidden="true" initial="in" animate="show" exit="out">
          {word.split(' ').map((w, wi, arr) => (
            <span key={wi} className={styles.chunk}>
              {Array.from(w).map((ch, ci) => (
                <motion.span
                  key={ci}
                  className={styles.char}
                  variants={{
                    in: { y: '0.55em', rotateX: -85, opacity: 0, filter: 'blur(6px)' },
                    // Letters cascade in…
                    show: {
                      y: 0,
                      rotateX: 0,
                      opacity: 1,
                      filter: 'blur(0px)',
                      transition: { duration: 0.45, delay: (wi * 6 + ci) * 0.016, ease: [0.2, 0.7, 0.2, 1] },
                    },
                    // …and leave together, quickly, so each phrase gets most of the interval on screen.
                    out: {
                      y: '-0.45em',
                      rotateX: 70,
                      opacity: 0,
                      filter: 'blur(4px)',
                      transition: { duration: 0.22, delay: (wi * 6 + ci) * 0.004 },
                    },
                  }}
                >
                  {ch}
                </motion.span>
              ))}
              {wi < arr.length - 1 ? ' ' : null}
            </span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
