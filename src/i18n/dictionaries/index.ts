import type { Locale } from '../config';
import type { Dictionary } from '../types';
import { en } from './en';
import { pt } from './pt';

/**
 * Both dictionaries are bundled on purpose: together they are ~6 KB gzipped,
 * and having them client-side lets the language toggle swap copy instantly
 * without a route transition (which would remount the WebGL canvas and reset
 * a running volleyball match).
 */
export const dictionaries: Record<Locale, Dictionary> = { pt, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
