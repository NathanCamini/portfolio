import { fallbackLocale, isLocale, locales, type Locale } from './config';

/**
 * Picks the site language from the visitor's system/browser languages, in
 * their order of preference (`navigator.languages`): the first one whose base
 * language we support wins — `pt-BR`, `pt-PT` → pt · `en-US`, `en-GB` → en.
 */
export function pickLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return fallbackLocale;
}

/**
 * The same algorithm as `pickLocale`, as a dependency-free inline script for
 * the static `/` page. It runs in <head> before anything renders and replaces
 * the history entry, so the back button never returns to the blank redirect.
 * Kept in sync with `pickLocale` by src/i18n/detect.test.ts.
 */
export const systemLocaleRedirectScript = `(function(n,l){var s=n.languages&&n.languages.length?n.languages:[n.language||""],t=${JSON.stringify(
  fallbackLocale,
)},k=${JSON.stringify(locales)};for(var i=0;i<s.length;i++){var b=String(s[i]).toLowerCase().split("-")[0];if(k.indexOf(b)>-1){t=b;break}}l.replace("/"+t+l.search+l.hash)})(navigator,location)`;
