'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { useTypewriter } from '@/hooks/useTypewriter';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Hobbies.module.css';

/** Hobbies header + AI. The car, volleyball and games are their own sections. */
export function Hobbies() {
  const { t } = useI18n();

  return (
    <section id="hobbies" className={`section ${styles.section}`}>
      <Reveal className="eyebrow path">{t.hobbies.label}</Reveal>
      <Reveal as="h2" delay={80} className={`section-title ${styles.title}`}>
        {t.hobbies.title}
      </Reveal>
      <AiLab />
    </section>
  );
}

/**
 * AI — "AI lab": a fake terminal that types a prompt, then reveals the
 * outcome. The typing state is isolated here so ~36 renders/s touch only
 * this subtree, and it pauses while off-screen.
 */
function AiLab() {
  const { t } = useI18n();
  const { ai } = t;
  const terminalRef = useRef<HTMLDivElement>(null);
  const inView = useInView(terminalRef, { margin: '100px' });
  const reduce = useReducedMotion();

  const { index, text, done, pick } = useTypewriter(
    ai.flows.map((f) => f.prompt),
    { paused: !inView, instant: !!reduce },
  );
  const flow = ai.flows[index];

  return (
    <div className={styles.aiGrid}>
      <div>
        <Reveal className="eyebrow-muted path">{ai.label}</Reveal>
        <Reveal as="h3" delay={80} className="sub-title">
          {ai.title}
        </Reveal>
        <Reveal as="p" delay={140} className={`lead ${styles.aiBody}`}>
          {ai.body}
        </Reveal>
        <Reveal delay={200} className={styles.flows}>
          {ai.flows.map((f, i) => (
            <button
              key={f.label}
              type="button"
              className={i === index ? 'btn btn-primary' : 'btn btn-secondary'}
              aria-pressed={i === index}
              onClick={() => pick(i)}
            >
              {f.label}
            </button>
          ))}
        </Reveal>
      </div>

      <Reveal delay={160} className={`card elev-md ${styles.terminal}`}>
        <div ref={terminalRef} className={styles.termBar} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={`${styles.dot} ${styles.dotAccent}`} />
          <span className={styles.termName}>ai-lab.session</span>
        </div>

        <div className={styles.termBody}>
          <div className={styles.termLabel}>{ai.promptLabel}</div>
          {/* Screen readers get the full prompt once, not a character stream. */}
          <p className="sr-only">{flow.prompt}</p>
          <div className={styles.typed} aria-hidden="true">
            {text}
            <span className={styles.caret} style={{ opacity: done ? 0.35 : 1 }} />
          </div>

          <motion.div
            className={styles.result}
            initial={false}
            animate={{ opacity: done ? 1 : 0, y: done ? 0 : 8 }}
            transition={{ duration: 0.5 }}
          >
            <div className={styles.termLabel}>{ai.resultLabel}</div>
            <div className={styles.resultText}>{flow.result}</div>
          </motion.div>
        </div>
      </Reveal>
    </div>
  );
}
