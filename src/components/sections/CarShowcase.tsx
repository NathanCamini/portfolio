'use client';

import { useCallback, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useInView, useScroll } from 'motion/react';
import { Reveal } from '@/components/motion/Reveal';
import { carConfig } from '@/config/site';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './CarShowcase.module.css';

// Three.js + R3F (~250 KB gz) live in their own lazy chunk and never render on the server.
const CarCanvas = dynamic(() => import('@/components/three/CarCanvas'), { ssr: false });

type Status = 'idle' | 'ready' | 'error';

/**
 * 03b — 3D car. A 300vh section whose inner 100vh stage is `position: sticky`:
 * while the page scrolls through the section, the stage stays pinned and the
 * scroll distance is converted into a 0→1 progress value that drives the car.
 */
export function CarShowcase() {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLElement>(null);
  const readoutRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<Status>('idle');

  // 0 when the section's top hits the viewport top, 1 when its bottom hits the viewport bottom.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });

  // Start downloading Three.js one viewport before the section arrives…
  const near = useInView(sectionRef, { once: true, margin: '100% 0px 100% 0px' });
  // …and only run the render loop while it is actually visible.
  const visible = useInView(sectionRef);

  const onReady = useCallback(() => setStatus('ready'), []);
  const onError = useCallback(() => setStatus('error'), []);

  return (
    <section ref={sectionRef} className={styles.section} aria-labelledby="car-title">
      <div className={styles.stage}>
        {near && status !== 'error' && (
          <CarCanvas
            progress={scrollYProgress}
            active={visible}
            color={carConfig.color}
            finish={carConfig.finish}
            label={t.car.canvasLabel}
            readoutRef={readoutRef}
            onReady={onReady}
            onError={onError}
          />
        )}

        <div className={styles.overlay}>
          <div className={styles.copy}>
            <Reveal className="eyebrow-muted">{t.car.label}</Reveal>
            <Reveal as="h3" delay={80} id="car-title" className="sub-title">
              {t.car.title}
            </Reveal>
            <Reveal as="p" delay={140} className={styles.body}>
              {t.car.body}
            </Reveal>
          </div>

          <div className={styles.footer}>
            <div className={styles.status}>
              <span className="tag tag-outline">{t.car.hint}</span>
              {status === 'idle' && <span className={styles.muted}>{t.car.loading}</span>}
              {status === 'error' && <span className={styles.muted}>{t.car.error}</span>}
            </div>
            <code ref={readoutRef} className={styles.readout} aria-hidden="true">
              scroll 0% → track.x 0.00m · spin.y -18°
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}
