'use client';

import { useEffect, useState } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import styles from './Cursor.module.css';

/**
 * A soft ring that trails the mouse and swells over anything clickable.
 * Desktop (fine pointer) only; the native cursor stays visible.
 */
export function Cursor() {
  const fine = useMediaQuery('(pointer: fine)');
  const reduce = useReducedMotion();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.5 });
  const [hot, setHot] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!fine || reduce) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const t = e.target as Element | null;
      setHot(!!t?.closest('a, button, label, [role="application"], canvas'));
      // Games draw their own crosshair — step aside there.
      setHidden(!!t?.closest('[data-no-cursor]'));
    };
    const press = () => setDown(true);
    const release = () => setDown(false);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
    };
  }, [fine, reduce, x, y]);

  if (!fine || reduce) return null;
  return (
    <motion.div
      className={styles.ring}
      style={{ x: sx, y: sy }}
      animate={{ scale: down ? 0.7 : hot ? 1.9 : 1, opacity: hidden ? 0 : hot ? 0.9 : 0.55 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      aria-hidden="true"
    />
  );
}
