import { describe, expect, it } from 'vitest';
import { pickLocale, systemLocaleRedirectScript } from './detect';

/** Runs the shipped inline script against a fake navigator/location and returns the redirect target. */
function runScript(languages: string[], search = '', hash = '') {
  let target = '';
  const navigator = { languages, language: languages[0] ?? '' };
  const location = { search, hash, replace: (url: string) => (target = url) };
  new Function('navigator', 'location', systemLocaleRedirectScript)(navigator, location);
  return target;
}

const cases: [string[], 'pt' | 'en'][] = [
  [['pt-BR', 'pt', 'en-US'], 'pt'],
  [['pt-PT'], 'pt'],
  [['en-US', 'pt-BR'], 'en'],
  [['EN-gb'], 'en'],
  [['es-ES', 'pt-BR'], 'pt'], // first *supported* preference wins
  [['de-DE', 'fr-FR'], 'en'], // nothing supported → fallback
  [[], 'en'],
];

describe('system language detection', () => {
  it.each(cases)('%j → %s', (languages, expected) => {
    expect(pickLocale(languages)).toBe(expected);
  });

  it.each(cases)('inline redirect script agrees with pickLocale for %j', (languages, expected) => {
    expect(runScript(languages)).toBe(`/${expected}`);
  });

  it('keeps query string and hash when redirecting', () => {
    expect(runScript(['pt-BR'], '?utm_source=x', '#volei')).toBe('/pt?utm_source=x#volei');
  });
});
