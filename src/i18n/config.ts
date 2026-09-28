/**
 * Locale configuration shared by the server (layout, metadata) and the client
 * (I18nProvider, the `/` language redirect). No React/Next imports here.
 */
export const locales = ['pt', 'en'] as const;

export type Locale = (typeof locales)[number];

/**
 * Used at `/` when none of the visitor's system languages is supported
 * (e.g. a Spanish or German browser): English is the broadest common ground.
 */
export const fallbackLocale: Locale = 'en';

/** Value written to `<html lang>` for each locale. */
export const htmlLang: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
