'use client';

import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import { EASE_OUT_SOFT } from './easing';

/**
 * Scroll-reveal primitive — the design's `data-reveal` attribute as a component.
 *
 *  variant="fade" (default): opacity 0 → 1, y 28px → 0, blur 6px → 0 in 850 ms.
 *  variant="grow":           scaleX 0 → 1 from the left in 1.4 s (progress bars).
 *
 * Plays once when the element enters the viewport. `delay` is in **ms** so it
 * reads exactly like the design's `data-delay`. When the animation ends the
 * filter is reset to `none` (transitionEnd) so revealed elements don't keep a
 * compositing layer / stacking context forever.
 */

const fade: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(6px)' },
  shown: (delay: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.85, delay: delay / 1000, ease: EASE_OUT_SOFT },
    transitionEnd: { filter: 'none' },
  }),
};

const grow: Variants = {
  hidden: { scaleX: 0 },
  shown: (delay: number) => ({
    scaleX: 1,
    transition: { duration: 1.4, delay: delay / 1000, ease: EASE_OUT_SOFT },
  }),
};

const TAGS = {
  div: motion.div,
  span: motion.span,
  p: motion.p,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
  article: motion.article,
  li: motion.li,
} as const;

type RevealProps = Omit<HTMLMotionProps<'div'>, 'custom' | 'variants' | 'initial' | 'whileInView'> & {
  as?: keyof typeof TAGS;
  delay?: number;
  variant?: 'fade' | 'grow';
};

export function Reveal({ as = 'div', delay = 0, variant = 'fade', viewport, style, ...rest }: RevealProps) {
  const Tag = TAGS[as] as typeof motion.div;
  return (
    <Tag
      {...rest}
      style={variant === 'grow' ? { transformOrigin: 'left', ...style } : style}
      custom={delay}
      variants={variant === 'grow' ? grow : fade}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.01, ...viewport }}
    />
  );
}
