'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { HandWrite } from './HandWrite';
import styles from './RotatingText.module.css';

/**
 * Cycles through `words`; each phrase is written out by hand (see HandWrite) and fades away
 * before the next one starts. `startDelay` (s) postpones the first phrase, so it can follow text
 * written just before it. Screen readers get all options once, as plain text.
 */
export function RotatingText({
  words,
  interval = 4600,
  startDelay = 0,
}: {
  words: string[];
  interval?: number;
  startDelay?: number;
}) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || words.length < 2) return;
    // The first phrase also waits for `startDelay`, so its slot of time starts after it.
    let id: number;
    const start = window.setTimeout(
      () => {
        setI((n) => (n + 1) % words.length);
        id = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
      },
      interval + startDelay * 1000,
    );
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [words.length, interval, reduce, startDelay]);

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
      <AnimatePresence mode="wait" initial>
        <motion.span
          key={word}
          className={styles.word}
          aria-hidden="true"
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
        >
          <HandWrite text={word} delay={i === 0 ? startDelay : 0.05} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
