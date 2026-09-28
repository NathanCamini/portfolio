'use client';

import { Reveal } from '@/components/motion/Reveal';
import { site } from '@/config/site';
import { useI18n } from '@/i18n/I18nProvider';
import styles from './Contact.module.css';

/** 04 — Contact + footer. Links come from src/config/site.ts. */
export function Contact() {
  const { t } = useI18n();

  return (
    <section id="contato" className={`section ${styles.section}`}>
      <Reveal className="eyebrow">{t.contact.label}</Reveal>
      <Reveal as="h2" delay={80} className={styles.title}>
        {t.contact.title}
      </Reveal>
      <Reveal delay={160} className={styles.links}>
        <a className="btn btn-primary btn-lg" href={`mailto:${site.email}`}>
          {site.email}
        </a>
        <a className="btn btn-secondary btn-lg" href={site.links.github} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        <a className="btn btn-secondary btn-lg" href={site.links.linkedin} target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>
      </Reveal>

      <footer className={styles.footer}>
        {/* Year is rendered at build time; suppress the warning if the client's clock disagrees. */}
        <span suppressHydrationWarning>
          © {new Date().getFullYear()} {site.name}
        </span>
        <span>{t.contact.footNote}</span>
      </footer>
    </section>
  );
}
