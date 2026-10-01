import { Caveat, Inter } from 'next/font/google';

/** Inter, self-hosted at build time (no request to Google at runtime). Shared by both root layouts. */
export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

/** Handwriting face for the hero headline (see components/fun/HandWrite). */
export const caveat = Caveat({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  variable: '--font-hand',
  display: 'swap',
});
