'use client';

import { motion, useReducedMotion } from 'motion/react';
import styles from './VolleyTeaser.module.css';

// Ball path: a parabola from the left player over the net to the right one and back.
const N = 12;
const arc = (from: number, to: number) =>
  Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    return { x: from + (to - from) * t, y: 178 - 4 * 118 * t * (1 - t) };
  });
const path = [...arc(118, 362), ...arc(362, 118).slice(1)];
const XS = path.map((p) => p.x);
const YS = path.map((p) => p.y);
const DURATION = 2.6;

const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: (i * 97) % 480,
  y: (i * 53) % 130,
  r: 0.6 + ((i * 7) % 5) / 5,
  d: 1.5 + (i % 4),
}));

/**
 * Attract-mode poster for the volleyball game: a looping SVG rally (no game
 * code runs here). Purely decorative — the real game mounts only when opened.
 */
export function VolleyTeaser({ label }: { label: string }) {
  const reduce = useReducedMotion();
  const loop = reduce ? undefined : { duration: DURATION, repeat: Infinity, ease: 'linear' as const };
  // Each player hops just before touching the ball (start of each half of the loop).
  const hop = (phase: number) =>
    reduce
      ? undefined
      : {
          y: [0, 0, -26, 0, 0],
          transition: {
            duration: DURATION,
            repeat: Infinity,
            times: [0, Math.max(0, phase - 0.08), phase, Math.min(1, phase + 0.1), 1],
          },
        };

  return (
    <svg className={styles.scene} viewBox="0 0 480 270" role="img" aria-label={label}>
      <defs>
        <linearGradient id="vt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-bg)" />
          <stop offset="1" stopColor="var(--color-section)" />
        </linearGradient>
        <radialGradient id="vt-moon">
          <stop offset="0.35" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vt-ball">
          <stop offset="0.45" stopColor="var(--color-accent)" stopOpacity="0.6" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="480" height="210" fill="url(#vt-sky)" />
      {STARS.map((s, i) => (
        <motion.circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="var(--color-neutral-300)"
          animate={reduce ? undefined : { opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: s.d, repeat: Infinity, delay: i * 0.13 }}
        />
      ))}
      <circle cx="405" cy="52" r="40" fill="url(#vt-moon)" />
      <circle cx="405" cy="52" r="15" fill="var(--color-neutral-200)" />

      {/* Sea with drifting wave dashes */}
      <rect y="186" width="480" height="24" fill="var(--color-section-glow)" />
      {[192, 198, 204].map((y, i) => (
        <motion.line
          key={y}
          x1="0"
          x2="480"
          y1={y}
          y2={y}
          stroke="var(--color-accent-700)"
          strokeWidth="1.5"
          strokeDasharray="22 38"
          animate={reduce ? undefined : { strokeDashoffset: [0, i % 2 ? 60 : -60] }}
          transition={{ duration: 3 + i, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* Sand */}
      <rect y="210" width="480" height="60" fill="var(--color-neutral-800)" />
      <rect y="210" width="480" height="2" fill="var(--color-neutral-700)" />

      {/* Net */}
      <rect x="238" y="140" width="4" height="72" fill="var(--color-neutral-500)" />
      <rect x="236" y="140" width="8" height="34" fill="var(--color-accent-700)" />
      <rect x="235" y="138" width="10" height="4" fill="var(--color-neutral-100)" />

      {/* Ball shadow follows the ball's x and shrinks when it's high */}
      <motion.ellipse
        cy="214"
        rx="9"
        ry="2.5"
        fill="rgba(0,0,0,0.4)"
        initial={{ cx: XS[0] }}
        animate={loop ? { cx: XS, scaleX: YS.map((y) => 0.4 + (y / 178) * 0.6) } : undefined}
        transition={loop}
      />

      {/* Players (slime style) */}
      <motion.g animate={hop(0.02)}>
        <path d="M 88 212 A 30 30 0 0 1 148 212 Z" fill="var(--color-accent)" />
        <circle cx="130" cy="196" r="5.5" fill="var(--color-neutral-100)" />
        <circle cx="132" cy="195" r="2.6" fill="var(--color-bg)" />
      </motion.g>
      <motion.g animate={hop(0.5)}>
        <path d="M 332 212 A 30 30 0 0 1 392 212 Z" fill="var(--color-neutral-500)" />
        <circle cx="350" cy="196" r="5.5" fill="var(--color-neutral-100)" />
        <circle cx="348" cy="195" r="2.6" fill="var(--color-bg)" />
      </motion.g>

      {/* Ball */}
      <motion.g initial={{ x: XS[0], y: YS[0] }} animate={loop ? { x: XS, y: YS } : undefined} transition={loop}>
        <circle r="18" fill="url(#vt-ball)" />
        <motion.g
          animate={reduce ? undefined : { rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        >
          <circle r="8" fill="var(--color-neutral-100)" />
          <path d="M -8 0 A 8 8 0 0 1 8 0" fill="none" stroke="var(--color-accent-600)" strokeWidth="1.4" />
          <path d="M 0 -8 A 8 8 0 0 1 0 8" fill="none" stroke="var(--color-accent-600)" strokeWidth="1.4" />
        </motion.g>
      </motion.g>
    </svg>
  );
}
