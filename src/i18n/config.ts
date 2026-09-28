/**
 * Locale configuration shared by the server (layout, metadata, proxy) and the
 * client (I18nProvider). Keep this file free of React/Next imports so the
 * proxy can import it too.
 */
export const locales = ['pt', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'pt';

/** Cookie that remembers an explicit language choice across visits. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Value written to `<html lang>` for each locale. */
export const htmlLang: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
