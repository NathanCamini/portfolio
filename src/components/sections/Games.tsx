'use client';

import { motion } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { PeekTrainer } from '@/components/siege/PeekTrainer';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Games.module.css';

/** 03d — Games: Rainbow Six Siege, with a playable Siege-style aim trainer. */
export function Games() {
  const { t } = useI18n();
  const g = t.games;

  return (
    <section id="games" className={`section ${styles.section}`}>
      <Reveal className="eyebrow-muted">{g.label}</Reveal>

      <div className={styles.grid}>
        <div className={styles.copy}>
          <Reveal as="h3" delay={80} className={`sub-title ${styles.title}`}>
            {g.title}
          </Reveal>
          <Reveal as="p" delay={140} className={`lead ${styles.body}`}>
            {g.body}
          </Reveal>

          <Reveal delay={200} className={styles.mains}>
            <span className="eyebrow-muted">{g.mainLabel}</span>
            <div className={styles.mainList}>
              {g.mains.map((m) => (
                <span key={m.name} className={styles.main}>
                  <b>{m.name}</b>
                  {m.role}
                </span>
              ))}
            </div>
          </Reveal>

          <motion.ul
            className={styles.facts}
            initial="hidden"
            whileInView="shown"
            viewport={{ once: true, amount: 0.6 }}
            transition={{ staggerChildren: 0.12, delayChildren: 0.2 }}
          >
            {g.facts.map((f) => (
              <motion.li
                key={f.label}
                className={styles.fact}
                variants={{
                  hidden: { opacity: 0, scale: 0.6, rotate: -8 },
                  shown: {
                    opacity: 1,
                    scale: 1,
                    rotate: 0,
                    transition: { type: 'spring', stiffness: 300, damping: 16 },
                  },
                }}
                whileHover={{ y: -4, rotate: -2 }}
              >
                <span className={styles.factValue}>{f.value}</span>
                <span className={styles.factLabel}>{f.label}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <Reveal delay={160} className={styles.trainer}>
          <div className={styles.trainerHead}>
            <span className={styles.trainerTitle}>
              <span className={styles.rec} aria-hidden="true" />
              {g.trainerTitle}
            </span>
            <span className={styles.controls}>{g.controls}</span>
          </div>
          <p className={styles.trainerBody}>{g.trainerBody}</p>
          <div data-no-cursor="">
            <PeekTrainer strings={g.trainer} label={`${g.canvasLabel}. ${g.controls}`} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
