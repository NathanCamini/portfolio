'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT_SOFT } from '@/components/motion/easing';
import { Reveal } from '@/components/motion/Reveal';
import { VolleyballGame } from '@/components/volleyball/VolleyballGame';
import { useI18n } from '@/i18n/I18nProvider';
import { scrollToElement } from '@/lib/scroll';
import styles from './VolleyballSection.module.css';

const PANEL_ID = 'volleyball-game';

/**
 * 03c — Beach volleyball. A large card-button expands (height 0 → auto, 650 ms)
 * into a near-full-viewport game panel, scrolls it into view and offers the
 * Fullscreen API. The game is only mounted while open.
 */
export function VolleyballSection() {
  const { t } = useI18n();
  const vb = t.volleyball;
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  const openGame = () => {
    setOpen(true);
    // Bring the panel up under the fixed navbar as it starts expanding (design: 80 ms after the click).
    window.setTimeout(() => {
      const el = document.getElementById(PANEL_ID);
      if (el) scrollToElement(el, { reduceMotion: !!reduce });
    }, 80);
  };

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  return (
    <section id="volei" className={`section ${styles.section}`}>
      <Reveal className="eyebrow-muted">{vb.label}</Reveal>

      <Reveal delay={80}>
        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={PANEL_ID}
          onClick={open ? close : openGame}
        >
          <span className={styles.copy}>
            <span className={styles.title}>{vb.title}</span>
            <span className={styles.body}>{vb.body}</span>
          </span>
          <span className={`btn btn-primary btn-lg ${styles.cta}`}>{open ? vb.closeBtn : vb.open}</span>
        </button>
      </Reveal>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="panel"
            className={styles.expander}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.65, ease: EASE_OUT_SOFT }}
          >
            <VolleyballGame id={PANEL_ID} onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
