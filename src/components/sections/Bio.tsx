'use client';

import { useRef } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Bio.module.css';

/**
 * 01 — Bio: narrative on the left, education cards on the right, then a
 * work-experience timeline whose rail fills in as it scrolls past.
 */
export function Bio() {
  const { t } = useI18n();
  const { bio } = t;
  const timelineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: timelineRef, offset: ['start 80%', 'end 60%'] });
  const railFill = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  return (
    <section id="bio" className="section">
      <Reveal className="eyebrow">{bio.label}</Reveal>

      <div className={styles.grid}>
        <div>
          <Reveal as="h2" delay={80} className="section-title">
            {bio.title}
          </Reveal>
          <Reveal as="p" delay={160} className={`lead ${styles.p1}`}>
            {bio.p1}
          </Reveal>
          <Reveal as="p" delay={220} className={`lead ${styles.p2}`}>
            {bio.p2}
          </Reveal>
        </div>

        <div className={styles.edu}>
          <Reveal className="eyebrow-muted">{bio.eduLabel}</Reveal>
          {bio.edu.map((e, i) => (
            // Reveal wraps the card (instead of being it) so Motion's inline
            // transform doesn't override the CSS hover lift.
            <Reveal key={i} delay={i * 120}>
              <div className={`card ${styles.card}`}>
                <div className={styles.cardHead}>
                  <span className="card-kicker">{e.level}</span>
                  <span className={e.done ? 'tag tag-neutral' : 'tag tag-accent'}>{e.status}</span>
                </div>
                <div className="card-title">{e.course}</div>
                <div className={styles.meta}>
                  {e.school} · {e.years}
                </div>
                {!e.done && (
                  <div
                    className={styles.progress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={e.pct ?? 0}
                    aria-label={e.status}
                  >
                    <Reveal variant="grow" className={styles.progressFill} style={{ width: `${e.pct ?? 0}%` }} />
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <div className={styles.exp}>
        <Reveal className="eyebrow-muted">{bio.expLabel}</Reveal>
        <div ref={timelineRef} className={styles.timeline}>
          <span className={styles.rail} aria-hidden="true">
            <motion.span className={styles.railFill} style={{ scaleY: railFill }} />
          </span>
          <ol className={styles.jobs}>
            {bio.exp.map((job, i) => (
              <Reveal as="li" key={`${job.company}-${job.period}`} delay={i * 80} className={styles.job}>
                <span className={job.current ? `${styles.dot} ${styles.dotCurrent}` : styles.dot} aria-hidden="true" />
                <div className={`card ${styles.card} ${styles.jobCard}`}>
                  <div className={styles.cardHead}>
                    <span className="card-kicker">{job.period}</span>
                    <span className={styles.meta}>{job.place}</span>
                  </div>
                  <h3 className="card-title">
                    {job.role} <span className={styles.company}>@ {job.company}</span>
                  </h3>
                  <p className={styles.jobBody}>{job.body}</p>
                  {job.highlights && (
                    <ul className={styles.highlights}>
                      {job.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                  {job.stack && (
                    <ul className={styles.stack} aria-label="Stack">
                      {job.stack.map((s) => (
                        <li key={s} className="tag tag-neutral">
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
