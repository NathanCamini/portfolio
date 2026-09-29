import { describe, expect, it } from 'vitest';
import { roomFromHash, roomHash, roomLink } from './link';

describe('room links', () => {
  it('builds the link on the site root, so the friend gets their own language', () => {
    expect(roomLink('https://nathancamini.dev', 'ABC23')).toBe('https://nathancamini.dev/#volei-ABC23');
    expect(roomHash('ABC23')).toBe('#volei-ABC23');
  });

  it('reads a code back from the hash, forgiving case and stray characters, and ignores other hashes', () => {
    expect(roomFromHash('#volei-ABC23')).toBe('ABC23');
    expect(roomFromHash('#volei-abc23')).toBe('ABC23');
    expect(roomFromHash('#VOLEI-abc-23')).toBe('ABC23');
    expect(roomFromHash('#volei')).toBeNull(); // the section's own anchor
    expect(roomFromHash('#volei-ABCO1')).toBeNull(); // O and 1 aren't in the alphabet
    expect(roomFromHash('#projetos')).toBeNull();
    expect(roomFromHash('')).toBeNull();
  });
});
