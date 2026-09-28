'use client';

import { useCallback, useEffect, useState } from 'react';

interface Options {
  /** Delay between characters (design: 28 ms). */
  charMs?: number;
  /** Pause on the finished prompt before cycling to the next one (design: 4200 ms). */
  holdMs?: number;
  /** Pause everything (e.g. while the terminal is off-screen). */
  paused?: boolean;
  /** Skip the animation and show full text (prefers-reduced-motion). */
  instant?: boolean;
}

/**
 * Cycles through `texts`, typing each one character by character.
 * One timer at a time (setTimeout chain), so there is never a stale interval,
 * and the state lives only in the component that renders the terminal.
 */
export function useTypewriter(
  texts: string[],
  { charMs = 28, holdMs = 4200, paused = false, instant = false }: Options = {},
) {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);

  const safeIndex = index % texts.length;
  const full = texts[safeIndex] ?? '';
  // Clamp: switching language can make the current prompt shorter.
  const shown = instant ? full.length : Math.min(count, full.length);
  const done = shown >= full.length;

  useEffect(() => {
    if (paused) return;
    const id = done
      ? window.setTimeout(() => {
          setIndex((i) => (i + 1) % texts.length);
          setCount(0);
        }, holdMs)
      : window.setTimeout(() => setCount(shown + 1), charMs);
    return () => window.clearTimeout(id);
  }, [paused, done, shown, charMs, holdMs, texts.length]);

  const pick = useCallback((i: number) => {
    setIndex(i);
    setCount(0);
  }, []);

  return { index: safeIndex, text: full.slice(0, shown), done, pick };
}
