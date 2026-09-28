'use client';

import { Reveal } from '@/components/motion/Reveal';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Bio.module.css';

/** 01 — Bio: narrative on the left, education timeline cards on the right. */
export function Bio() {
  const { t } = useI18n();
  const { bio } = t;

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
    </section>
  );
}
