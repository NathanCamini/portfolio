'use client';

import { motion } from 'motion/react';
import { HandWrite } from '@/components/fun/HandWrite';
import { Magnetic } from '@/components/fun/Magnetic';
import { Reveal } from '@/components/motion/Reveal';
import { EASE_OUT_SOFT } from '@/components/motion/easing';
import { ArrowUpRight } from '@/components/ui/icons';
import { site } from '@/config/site';
import { useI18n } from '@/i18n/I18nProvider';
import { celebrate, originOf } from '@/lib/confetti';
import styles from './Contact.module.css';

/** Contact + footer with the name as the page's closing statement. Links come from src/config/site.ts. */
export function Contact() {
  const { t } = useI18n();
  const letters = Array.from(site.name);

  return (
    <>
      <section id="contato" className={`section ${styles.section}`}>
        <Reveal className="eyebrow path">{t.contact.label}</Reveal>
        <Reveal as="h2" delay={80} className={styles.title}>
          <HandWrite text={t.contact.title} delay={0.25} speed={0.05} />
        </Reveal>
        <Reveal delay={160} className={styles.links}>
          <Magnetic>
            <a className="btn btn-primary btn-lg" href={`mailto:${site.email}`}>
              {site.email}
            </a>
          </Magnetic>
          <Magnetic>
            <a className="btn btn-secondary btn-lg" href={site.links.github} target="_blank" rel="noopener noreferrer">
              GitHub
              <ArrowUpRight size={14} />
            </a>
          </Magnetic>
          <Magnetic>
            <a
              className="btn btn-secondary btn-lg"
              href={site.links.linkedin}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
              <ArrowUpRight size={14} />
            </a>
          </Magnetic>
        </Reveal>
      </section>

      <footer className={styles.footer}>
        {/* Letters rise one by one when the footer enters, and hop when hovered. */}
        <motion.p
          className={styles.bigName}
          aria-label={site.name}
          initial="hidden"
          whileInView="shown"
          viewport={{ once: true, amount: 0.4 }}
          transition={{ staggerChildren: 0.045 }}
        >
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className={ch === ' ' ? styles.space : styles.letter}
              variants={{
                hidden: { y: '110%', opacity: 0, rotate: 8 },
                shown: { y: '0%', opacity: 1, rotate: 0, transition: { duration: 0.8, ease: EASE_OUT_SOFT } },
              }}
              whileHover={{ y: '-14%', transition: { type: 'spring', stiffness: 500, damping: 12 } }}
              onClick={(e) => ch !== ' ' && celebrate(originOf(e.currentTarget), 0.5)}
            >
              {ch === ' ' ? ' ' : ch}
            </motion.span>
          ))}
        </motion.p>

        <div className={styles.meta}>
          <span className={styles.role}>{t.footer.role}</span>
          {/* Year is rendered at build time; suppress the warning if the client's clock disagrees. */}
          <span suppressHydrationWarning>
            © {new Date().getFullYear()} {site.name}
          </span>
          <a className={styles.top} href="#top">
            ↑ {t.footer.backToTop}
          </a>
        </div>
      </footer>
    </>
  );
}
