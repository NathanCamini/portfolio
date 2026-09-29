'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Magnetic } from '@/components/fun/Magnetic';
import { EASE_OUT_SOFT } from '@/components/motion/easing';
import { Reveal } from '@/components/motion/Reveal';
import { roomFromHash } from '@/components/volleyball/online/link';
import { VolleyballGame } from '@/components/volleyball/VolleyballGame';
import { VolleyTeaser } from '@/components/volleyball/VolleyTeaser';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import { scrollToElement } from '@/lib/scroll';
import { OPEN_VOLLEYBALL } from '@/lib/volleyball';
import styles from './VolleyballSection.module.css';

const PANEL_ID = 'volleyball-game';

/**
 * Beach volleyball, presented as an "arcade stage": an animated rally
 * poster, a pulsing Play button and a floating shortcut elsewhere on the page
 * (VolleyFab). Opening expands the same game panel as before (height 0 → auto,
 * 650 ms) and scrolls it into view. The game is only mounted while open.
 * A room link (`#volei-CODE`, docs/volei-online.md) opens it on the online tab.
 */
export function VolleyballSection() {
  const { t } = useI18n();
  const vb = t.volleyball;
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  const openGame = (fromEl?: Element | null) => {
    setOpen(true);
    celebrate(originOf(fromEl ?? toggleRef.current), 0.6);
    // Bring the panel up under the fixed navbar as it starts expanding (design: 80 ms after the click).
    window.setTimeout(() => {
      const el = document.getElementById(PANEL_ID);
      if (el) scrollToElement(el, { reduceMotion: !!reduce });
    }, 80);
  };
  const openRef = useRef(openGame);
  useEffect(() => {
    openRef.current = openGame;
  });

  // Hero CTA and the floating button open the game through a window event.
  useEffect(() => {
    const onOpen = () => openRef.current();
    window.addEventListener(OPEN_VOLLEYBALL, onOpen);
    return () => window.removeEventListener(OPEN_VOLLEYBALL, onOpen);
  }, []);

  // A room link, on arrival or pasted into this tab's address bar: the online tab, on that room.
  useEffect(() => {
    const onHash = () => {
      const code = roomFromHash(location.hash);
      if (!code) return;
      setJoinCode(code);
      openRef.current();
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  return (
    <section id="volei" className={`section ${styles.section}`}>
      <Reveal className="eyebrow-muted path">{vb.label}</Reveal>

      <Reveal delay={80}>
        <div className={styles.stage}>
          <div className={styles.copy}>
            <span className={styles.badge}>
              <span className={styles.liveDot} aria-hidden="true" />
              {vb.badge}
            </span>
            <h3 className={styles.title}>{vb.title}</h3>
            <p className={styles.body}>{vb.body}</p>
            <Magnetic strength={0.4}>
              <button
                ref={toggleRef}
                type="button"
                className={`${styles.play} ${open ? styles.playOpen : ''}`}
                aria-expanded={open}
                aria-controls={PANEL_ID}
                onClick={(e) => (open ? close() : openGame(e.currentTarget))}
              >
                {!open && <span className={styles.pulse} aria-hidden="true" />}
                <span aria-hidden="true">{open ? '✕' : '▶'}</span>
                {open ? vb.closeBtn : vb.play}
              </button>
            </Magnetic>
          </div>

          <button
            type="button"
            className={styles.poster}
            onClick={(e) => (open ? undefined : openGame(e.currentTarget))}
            tabIndex={-1}
            aria-hidden="true"
          >
            <VolleyTeaser label={vb.teaserAlt} />
          </button>
        </div>
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
            {/* A new room link remounts the panel on it. */}
            <VolleyballGame key={joinCode ?? 'local'} id={PANEL_ID} onClose={close} joinCode={joinCode} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
