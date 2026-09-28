'use client';

import { useState } from 'react';
import { motion, type Variants } from 'motion/react';
import { EASE_OUT_SOFT } from '@/components/motion/easing';
import { Tilt } from '@/components/fun/Tilt';
import { Reveal } from '@/components/motion/Reveal';
import { ArrowUpRight } from '@/components/ui/icons';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Projects.module.css';

type Tab = 'past' | 'future';

/**
 * Stagger container: when the grid enters the viewport — or is remounted by a
 * tab switch (`key={tab}`) — cards cascade in 80 ms apart, exactly like the
 * design's tab animation (opacity/y/scale/blur, 600 ms).
 */
const grid: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.08 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.98, filter: 'blur(4px)' },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: EASE_OUT_SOFT },
    transitionEnd: { filter: 'none' },
  },
};

/** Projects: shipped work vs. future ideas behind a segmented control. */
export function Projects() {
  const { t } = useI18n();
  const p = t.projects;
  const [tab, setTab] = useState<Tab>('past');

  return (
    <section id="projetos" className="section">
      <Reveal className="eyebrow path">{p.label}</Reveal>

      <div className={styles.head}>
        <Reveal as="h2" delay={80} className={`section-title ${styles.title}`}>
          {p.title}
        </Reveal>
        <Reveal delay={160} className="seg" role="radiogroup" aria-label={p.label}>
          {(['past', 'future'] as const).map((key) => (
            <label key={key} className={`seg-opt ${styles.tab}`}>
              <input
                type="radio"
                name="project-tab"
                value={key}
                checked={tab === key}
                onChange={() => setTab(key)}
                aria-controls="project-grid"
              />
              {key === 'past' ? p.tabPast : p.tabFuture}
            </label>
          ))}
        </Reveal>
      </div>

      <motion.div
        key={tab}
        id="project-grid"
        className={styles.grid}
        variants={grid}
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, amount: 0.05 }}
      >
        {tab === 'past'
          ? p.past.map((item) => (
              <motion.div key={item.title} variants={card}>
                <Tilt>
                  <article className={`card ${styles.card}`}>
                    <div className="card-kicker">
                      {item.kicker} · {item.type}
                    </div>
                    <h3 className="card-title">{item.title}</h3>
                    <p className="card-body">{item.body}</p>
                    <ul className={styles.stack} aria-label="Stack">
                      {item.stack.map((s) => (
                        <li key={s} className="tag tag-neutral">
                          {s}
                        </li>
                      ))}
                    </ul>
                    {item.href && (
                      <a className={`btn btn-ghost ${styles.caseLink}`} href={item.href}>
                        {p.caseLabel}
                        <ArrowUpRight size={14} />
                      </a>
                    )}
                  </article>
                </Tilt>
              </motion.div>
            ))
          : p.future.map((item) => (
              <motion.div key={item.title} variants={card}>
                <Tilt>
                  <article className={`card ${styles.card} ${styles.future}`}>
                    <div className="card-kicker">{item.n}</div>
                    <h3 className="card-title">{item.title}</h3>
                    <p className="card-body">{item.body}</p>
                    <div className={styles.stage}>
                      <div className={styles.stageRow}>
                        <span>{p.stageLabel}</span>
                        <span className={styles.stageValue}>{item.stage}</span>
                      </div>
                      <div
                        className={styles.bar}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.pct}
                        aria-label={`${p.stageLabel}: ${item.stage}`}
                      >
                        <div className={styles.barFill} style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  </article>
                </Tilt>
              </motion.div>
            ))}
      </motion.div>
    </section>
  );
}
