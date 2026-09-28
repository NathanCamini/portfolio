'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useI18n } from '@/i18n/I18nProvider';
import { openVolleyball } from '@/lib/volleyball';
import styles from './VolleyFab.module.css';

/**
 * Floating "Play volleyball" pill: shows up once the visitor has scrolled past
 * the hero, and hides while the volleyball section itself (or the footer) is on screen.
 */
export function VolleyFab() {
  const { t } = useI18n();
  const { scrollY } = useScroll();
  const [pastHero, setPastHero] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(false);

  const [atBottom, setAtBottom] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => {
    setPastHero(y > window.innerHeight * 0.8);
    // Step aside over the footer so it never covers "back to top".
    setAtBottom(y + window.innerHeight > document.documentElement.scrollHeight - 260);
  });

  useEffect(() => {
    const el = document.getElementById('volei');
    if (!el) return;
    const io = new IntersectionObserver((entries) => setSectionVisible(entries[entries.length - 1].isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const show = pastHero && !sectionVisible && !atBottom;

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          className={styles.fab}
          onClick={openVolleyball}
          initial={{ opacity: 0, y: 40, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.8 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 380, damping: 24 }}
        >
          <motion.span
            className={styles.ball}
            aria-hidden="true"
            animate={{ y: [0, -7, 0], rotate: [0, 180, 360] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            🏐
          </motion.span>
          {t.volleyball.fab}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
