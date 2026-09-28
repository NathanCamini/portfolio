import type { Metadata } from 'next';
import Link from 'next/link';
import { site } from '@/config/site';
import { inter } from './fonts';
import styles from './global-not-found.module.css';
import './globals.css';

export const metadata: Metadata = {
  title: `404 — ${site.name}`,
};

/**
 * 404 for any unmatched URL (exported as out/404.html; Cloudflare serves it
 * with a 404 status via `not_found_handling`). It bypasses both root layouts,
 * so it brings its own <html>, font and styles. The language is unknown here,
 * hence the bilingual copy.
 */
export default function GlobalNotFound() {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <main className={styles.main}>
          <p className="eyebrow">404</p>
          <h1 className={styles.title}>
            Página não encontrada.
            <span className={styles.en} lang="en">
              Page not found.
            </span>
          </h1>
          <nav className={styles.links} aria-label="Idioma / Language">
            <Link className="btn btn-primary btn-lg" href="/pt" hrefLang="pt-BR">
              Voltar ao início
            </Link>
            <Link className="btn btn-secondary btn-lg" href="/en" hrefLang="en" lang="en">
              Back to home
            </Link>
          </nav>
        </main>
      </body>
    </html>
  );
}
