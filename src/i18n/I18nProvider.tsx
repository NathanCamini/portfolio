'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { htmlLang, LOCALE_COOKIE, type Locale } from './config';
import { dictionaries } from './dictionaries';
import type { Dictionary } from './types';

interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Client-side i18n.
 *
 * - The server renders `/pt` and `/en` statically (SEO, correct `<html lang>`,
 *   hreflang alternates), passing the route locale as `initialLocale`.
 * - Switching language is a pure client state change: copy swaps instantly,
 *   the URL is rewritten with `history.replaceState` (which the App Router
 *   syncs with `usePathname`), and nothing remounts — the 3D car keeps its
 *   position/rotation and an ongoing volleyball match keeps its score.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocaleState(next);

      document.documentElement.lang = htmlLang[next];
      document.title = dictionaries[next].meta.title;

      // Swap only the first path segment and keep the hash (#hobbies etc.).
      const { pathname, search, hash } = window.location;
      const rest = pathname.replace(/^\/(pt|en)(?=\/|$)/, '');
      window.history.replaceState(null, '', `/${next}${rest}${search}${hash}`);

      // Remember the explicit choice so `/` redirects to it next time (see proxy.ts).
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, t: dictionaries[locale], setLocale }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
