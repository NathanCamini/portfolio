import { describe, expect, it } from 'vitest';
import { locales } from './config';
import { dictionaries } from './dictionaries';

/** Collects every leaf path, e.g. "projects.past.0.stack.1". */
function paths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([k, v]) => paths(v, prefix ? `${prefix}.${k}` : k));
}

describe('dictionaries', () => {
  it('every locale has exactly the same keys and list lengths as Portuguese', () => {
    const reference = paths(dictionaries.pt).sort();
    for (const locale of locales) expect(paths(dictionaries[locale]).sort()).toEqual(reference);
  });

  it('has no empty strings', () => {
    for (const locale of locales) {
      const empty = paths(dictionaries[locale]).filter((p) => {
        const v = p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dictionaries[locale]);
        return typeof v === 'string' && v.trim() === '';
      });
      expect(empty).toEqual([]);
    }
  });
});
