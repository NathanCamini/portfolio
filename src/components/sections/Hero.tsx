'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { ArrowDown, ArrowRight } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Hero.module.css';

/**
 * Hero: pointer-following glow + scroll parallax + staggered reveals.
 * All motion is driven by Motion values (no React re-render per frame).
 */
export function Hero() {
  const { t } = useI18n();
  const heroRef = useRef<HTMLElement>(null);

  // --- Glow follows the pointer (spring-smoothed), relative to the hero box.
  const glowX = useMotionValue(0);
  const glowY = useMotionValue(0);
  const x = useSpring(glowX, { stiffness: 220, damping: 30, mass: 0.6 });
  const y = useSpring(glowY, { stiffness: 220, damping: 30, mass: 0.6 });

  useEffect(() => {
    // Initial resting point from the design: 30vw / 45vh.
    glowX.jump(window.innerWidth * 0.3);
    glowY.jump(window.innerHeight * 0.45);
    x.jump(glowX.get());
    y.jump(glowY.get());

    const onMove = (e: PointerEvent) => {
      const hero = heroRef.current;
      if (!hero) return;
      const r = hero.getBoundingClientRect();
      if (r.bottom < 0) return; // hero scrolled away — nothing to update
      glowX.set(e.clientX - r.left);
      glowY.set(e.clientY - r.top);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [glowX, glowY, x, y]);

  // --- Parallax: content drifts down at 25% of scroll speed during the first viewport.
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, (v) =>
    typeof window === 'undefined' ? 0 : Math.min(v, window.innerHeight) * 0.25,
  );

  return (
    <section id="top" ref={heroRef} className={styles.hero}>
      <motion.div className={styles.glow} style={{ x, y }} aria-hidden="true" />

      <motion.div className={styles.inner} style={{ y: parallaxY }}>
        <Reveal delay={0} className={styles.tags}>
          <span className="tag tag-accent">{t.hero.tag1}</span>
          <span className="tag tag-neutral">{t.hero.tag2}</span>
        </Reveal>

        <Reveal as="h1" delay={120} className={styles.title}>
          {t.hero.title}
        </Reveal>

        <Reveal as="p" delay={260} className={styles.sub}>
          {t.hero.sub}
        </Reveal>

        <Reveal delay={400} className={styles.ctas}>
          <a className="btn btn-primary btn-lg" href="#projetos">
            {t.hero.cta1}
            <ArrowRight />
          </a>
          <a className="btn btn-secondary btn-lg" href="#volei">
            {t.hero.cta2}
          </a>
        </Reveal>

        <Reveal delay={700} className={styles.hint}>
          <ArrowDown size={14} />
          {t.hero.scrollHint}
        </Reveal>
      </motion.div>
    </section>
  );
}
