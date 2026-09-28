'use client';

import { useRef } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from 'motion/react';
import styles from './Marquee.module.css';

/**
 * Infinite ticker whose speed (and direction) follows the page's scroll
 * velocity: idle it drifts, scroll fast and it races, scroll up and it
 * reverses. Two copies of the content make the loop seamless.
 */
function Row({ items, baseSpeed, reverse }: { items: string[]; baseSpeed: number; reverse?: boolean }) {
  const reduce = useReducedMotion();
  const offset = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(velocity, [-2000, 0, 2000], [-4, 0, 4], { clamp: false });
  const direction = useRef(reverse ? -1 : 1);
  const x = useTransform(offset, (v) => `${wrap(-50, 0, v)}%`);

  useAnimationFrame((_, delta) => {
    if (reduce) return;
    const b = boost.get();
    if (b < 0) direction.current = reverse ? 1 : -1;
    else if (b > 0) direction.current = reverse ? -1 : 1;
    const move = direction.current * baseSpeed * (delta / 1000) * (1 + Math.abs(b));
    offset.set(offset.get() - move);
  });

  const content = items.map((it, i) => (
    <span key={i} className={styles.item}>
      {it}
      <span className={styles.star} aria-hidden="true">
        ✦
      </span>
    </span>
  ));

  return (
    <div className={styles.row}>
      <motion.div className={styles.track} style={{ x }}>
        {content}
        {content}
      </motion.div>
    </div>
  );
}

export function Marquee({ items }: { items: string[] }) {
  return (
    <div className={styles.band} aria-label={items.join(', ')} role="marquee">
      <div className={styles.tilted}>
        <Row items={items} baseSpeed={3} />
      </div>
      <div className={`${styles.tilted} ${styles.second}`} aria-hidden="true">
        <Row items={[...items].reverse()} baseSpeed={2.2} reverse />
      </div>
    </div>
  );
}
