import Link from 'next/link';
import { site } from '@/config/site';
import styles from './page.module.css';

/** Shown only without JavaScript (or for a split second): the visitor picks the language. */
export default function LanguageChooser() {
  return (
    <main className={styles.main}>
      <p className={styles.brand}>
        {site.name}
        <span className={styles.dot}>.</span>
      </p>
      <nav className={styles.options} aria-label="Idioma / Language">
        <Link className="btn btn-primary btn-lg" href="/pt" hrefLang="pt-BR" lang="pt-BR">
          Português
        </Link>
        <Link className="btn btn-secondary btn-lg" href="/en" hrefLang="en" lang="en">
          English
        </Link>
      </nav>
    </main>
  );
}
