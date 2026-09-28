'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Magnetic } from '@/components/fun/Magnetic';
import { RotatingText } from '@/components/fun/RotatingText';
import { Reveal } from '@/components/motion/Reveal';
import { ArrowDown, ArrowRight } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import { openTerminal } from '@/lib/terminal';
import styles from './Hero.module.css';

type Tone = 'danger' | 'warn' | 'ok';

interface Token {
  text: string;
  x: string;
  y: string;
  /** Pointer-parallax strength (px at the screen edge): nearer stickers move more. */
  depth: number;
  /** Idle float amplitude (px). */
  float: number;
  tone?: Tone;
  /** Long stickers only appear on wide screens, where they don't cover the headline. */
  wide?: boolean;
}

/** Back-end flavoured "stickers" floating around the headline, each at its own depth. */
const TOKENS: Token[] = [
  // The query is wrong on purpose (`DELETE *`, `;` before WHERE) — the emoji sells the joke.
  {
    text: 'DELETE * from USERS; WHERE name = "NATHAN CAMINI" 🫢',
    x: '47%',
    y: '9%',
    depth: 30,
    float: 6,
    tone: 'danger',
    wide: true,
  },
  { text: 'GET /api/v1', x: '74%', y: '20%', depth: 40, float: 9 },
  { text: 'queue.publish()', x: '59%', y: '33%', depth: 18, float: 7 },
  { text: '200 OK', x: '87%', y: '33%', depth: 70, float: 12, tone: 'ok' },
  { text: '200 - Error 🤔', x: '77%', y: '47%', depth: 50, float: 10, tone: 'warn' },
  { text: 'SELECT *', x: '61%', y: '60%', depth: 25, float: 8 },
  { text: '404 - NOT FOUND', x: '83%', y: '67%', depth: 65, float: 11, tone: 'danger' },
  { text: '{ "json": true }', x: '68%', y: '78%', depth: 55, float: 10 },
  { text: 'git push --force 😬', x: '55%', y: '89%', depth: 35, float: 9, tone: 'warn', wide: true },
  { text: '🏎️', x: '93%', y: '11%', depth: 90, float: 14 },
  { text: '🎮', x: '95%', y: '56%', depth: 60, float: 11 },
  { text: '🐛', x: '52%', y: '48%', depth: 45, float: 13 },
  { text: '☕', x: '90%', y: '82%', depth: 75, float: 12 },
  { text: '🏐', x: '76%', y: '92%', depth: 80, float: 16 },
];

function FloatingToken({
  token,
  px,
  py,
  index,
}: {
  token: Token;
  px: MotionValue<number>;
  py: MotionValue<number>;
  index: number;
}) {
  const x = useTransform(px, (v) => v * token.depth);
  const y = useTransform(py, (v) => v * token.depth);
  const emoji = !/[a-z{]/i.test(token.text);
  const className = [
    emoji ? styles.emoji : styles.token,
    token.tone ? styles[token.tone] : '',
    token.wide ? styles.wide : '',
  ].join(' ');
  return (
    <motion.span
      className={`${styles.tokenWrap} ${token.wide ? styles.wide : ''}`}
      style={{ left: token.x, top: token.y, x, y }}
    >
      <motion.span
        className={className}
        // Poke a sticker and it wobbles.
        whileHover={{
          scale: 1.15,
          rotate: index % 2 ? -8 : 8,
          transition: { type: 'spring', stiffness: 400, damping: 10 },
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1, y: [0, -token.float, 0], rotate: [0, index % 2 ? 4 : -4, 0] }}
        transition={{
          opacity: { delay: 0.8 + index * 0.08, duration: 0.6 },
          scale: { delay: 0.8 + index * 0.08, duration: 0.6 },
          y: { duration: 3 + (index % 3), repeat: Infinity, ease: 'easeInOut' },
          rotate: { duration: 4 + (index % 2), repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        {token.text}
      </motion.span>
    </motion.span>
  );
}

/**
 * Hero: rotating headline, floating back-end "stickers" with pointer parallax,
 * magnetic CTAs, and a scroll-out transition (content shrinks, blurs and fades
 * while the marquee band slides over it) so the hand-off to the Bio feels
 * continuous instead of a hard cut. All motion runs on Motion values.
 */
export function Hero() {
  const { t, locale } = useI18n();
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

  // --- Pointer position normalised to -0.5…0.5 for the floating tokens' parallax.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 60, damping: 20 });
  const spy = useSpring(py, { stiffness: 60, damping: 20 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      px.set(e.clientX / window.innerWidth - 0.5);
      py.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [px, py]);

  // --- Scroll-out transition: 0 while the hero fills the screen → 1 once it has left.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const parallaxY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const fade = useTransform(scrollYProgress, [0.2, 0.8], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.88]);
  const blur = useTransform(scrollYProgress, [0.25, 0.85], ['blur(0px)', 'blur(10px)']);

  return (
    <section id="top" ref={heroRef} className={styles.hero}>
      <motion.div className={styles.glow} style={{ x, y, opacity: fade }} aria-hidden="true" />

      <motion.div className={styles.tokens} style={{ opacity: fade }} aria-hidden="true">
        {TOKENS.map((token, i) => (
          <FloatingToken key={token.text} token={token} px={spx} py={spy} index={i} />
        ))}
      </motion.div>

      <motion.div className={styles.inner} style={{ y: parallaxY, opacity: fade, scale, filter: blur }}>
        <Reveal delay={0} className={styles.tags}>
          <span className="tag tag-accent">{t.hero.tag1}</span>
          <span className="tag tag-neutral">{t.hero.tag2}</span>
        </Reveal>

        <Reveal as="h1" delay={120} className={styles.title}>
          {t.hero.titleLead} <RotatingText key={locale} words={t.hero.titleWords} />
        </Reveal>

        <Reveal as="p" delay={260} className={styles.sub}>
          {t.hero.sub}
        </Reveal>

        <Reveal delay={400} className={styles.ctas}>
          <Magnetic>
            <a className="btn btn-primary btn-lg" href="#projetos">
              {t.hero.cta1}
              <ArrowRight />
            </a>
          </Magnetic>
          <Magnetic>
            <button type="button" className={`btn btn-secondary btn-lg ${styles.termBtn}`} onClick={openTerminal}>
              <span className={styles.termIcon} aria-hidden="true">
                &gt;
              </span>
              {t.hero.cta2}
              <kbd className={styles.kbd} aria-hidden="true">
                ~
              </kbd>
            </button>
          </Magnetic>
        </Reveal>

        <Reveal delay={700} className={styles.hint}>
          <motion.span
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ display: 'inline-flex' }}
          >
            <ArrowDown size={14} />
          </motion.span>
          {t.hero.scrollHint}
        </Reveal>
      </motion.div>
    </section>
  );
}
