import { describe, expect, it } from 'vitest';
import { roomFromHash } from './game-link';

describe('old room links', () => {
  it('reads the room code of a #volei- link', () => {
    expect(roomFromHash('#volei-K7MPQ')).toBe('K7MPQ');
    expect(roomFromHash('#volei-k7mpq')).toBe('K7MPQ');
  });

  it('ignores anything else', () => {
    expect(roomFromHash('')).toBeNull();
    expect(roomFromHash('#volei')).toBeNull();
    expect(roomFromHash('#volei-K7MP')).toBeNull();
    expect(roomFromHash('#volei-K7MPO')).toBeNull(); // O is not in the alphabet
    expect(roomFromHash('#projects')).toBeNull();
  });
});
