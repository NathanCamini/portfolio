import { describe, expect, it } from 'vitest';
import { gameRoot, roomFromHash } from './game-link';

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

describe('the game address (NEXT_PUBLIC_GAME_URL)', () => {
  const root = 'https://volleyball-game.camininathan.workers.dev';

  it('keeps a plain address as it is', () => {
    expect(gameRoot(root)).toBe(root);
  });

  it('drops a trailing slash, a language path, a query or a fragment (no more …/pt/pt)', () => {
    expect(gameRoot(`${root}/`)).toBe(root);
    expect(gameRoot(`${root}/pt`)).toBe(root);
    expect(gameRoot(`${root}/en/`)).toBe(root);
    expect(gameRoot(` ${root}/pt?x=1#top `)).toBe(root);
  });

  it('leaves other paths alone', () => {
    expect(gameRoot(`${root}/play`)).toBe(`${root}/play`);
    expect(gameRoot(`${root}/pt-br`)).toBe(`${root}/pt-br`);
  });
});
