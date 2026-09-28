'use client';

import { motion, useScroll } from 'motion/react';
import { site } from '@/config/site';
import { locales } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Navbar.module.css';

/**
 * Fixed, translucent top bar: brand, section anchors, PT/EN switch and the
 * page-scroll progress line (a Motion value bound straight to `scaleX`, so it
 * updates on the compositor without re-rendering React).
 */
export function Navbar() {
  const { t, locale, setLocale } = useI18n();
  const { scrollYProgress } = useScroll();

  return (
    <header className={styles.bar}>
      <nav className={styles.nav} aria-label="Main">
        <a href="#top" className={styles.brand}>
          {site.name}
          <span className={styles.dot}>.</span>
        </a>

        <div className={styles.links}>
          <a href="#bio">{t.nav.bio}</a>
          <a href="#projetos">{t.nav.projects}</a>
          <a href="#hobbies">{t.nav.hobbies}</a>
          <a href="#contato">{t.nav.contact}</a>
        </div>

        <div className="seg" role="radiogroup" aria-label={t.nav.language}>
          {locales.map((l) => (
            <label key={l} className={`seg-opt ${styles.langOpt}`}>
              <input
                type="radio"
                name="lang"
                value={l}
                checked={locale === l}
                onChange={() => setLocale(l)}
                lang={l === 'pt' ? 'pt-BR' : 'en'}
              />
              {l.toUpperCase()}
            </label>
          ))}
        </div>
      </nav>

      <div className={styles.track} aria-hidden="true">
        <motion.div className={styles.progress} style={{ scaleX: scrollYProgress }} />
      </div>
    </header>
  );
}
