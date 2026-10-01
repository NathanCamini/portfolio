import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { site } from '@/config/site';
import { systemLocaleRedirectScript } from '@/i18n/detect';
import { caveat, inter } from '../fonts';
import '../globals.css';

/**
 * Root layout for `/` only (a second root layout, separate from app/[lang]).
 * The site is a static export, so there is no server to read Accept-Language:
 * this inline script sends the visitor to /pt or /en from their *system*
 * language before the page paints. The body is a no-JS fallback chooser.
 */
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.name,
  // A redirect hub: keep it out of search results, but let crawlers follow the links.
  robots: { index: false, follow: true },
  alternates: { languages: { 'pt-BR': '/pt', en: '/en', 'x-default': '/' } },
};

export const viewport: Viewport = { themeColor: '#161826', colorScheme: 'dark' };

export default function LanguageRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${caveat.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: systemLocaleRedirectScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
