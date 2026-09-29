import { describe, expect, it } from 'vitest';
import { gameConfig } from '../../config/game';
import { InputTimeline, OnlineMatch } from './match';
import { KEY, NET } from './protocol';
import { seeded, sideBot } from './testing';

describe('InputTimeline', () => {
  it('returns the keys in force on each tick', () => {
    const t = new InputTimeline();
    t.set(10, KEY.LEFT);
    t.set(20, KEY.LEFT | KEY.JUMP);
    t.set(15, 0);
    expect([t.at(0), t.at(9), t.at(10), t.at(14), t.at(15), t.at(19), t.at(20), t.at(999)]).toEqual([
      0,
      0,
      KEY.LEFT,
      KEY.LEFT,
      0,
      0,
      KEY.LEFT | KEY.JUMP,
      KEY.LEFT | KEY.JUMP,
    ]);
    t.set(15, KEY.RIGHT); // same tick again: replaced
    expect(t.at(16)).toBe(KEY.RIGHT);
  });

  it('forgets old changes but keeps the one still in force', () => {
    const t = new InputTimeline();
    t.set(10, KEY.LEFT);
    t.set(20, KEY.RIGHT);
    t.prune(25);
    expect(t.at(25)).toBe(KEY.RIGHT);
    expect(t.at(30)).toBe(KEY.RIGHT);
  });
});

/** Plays a whole match with two bots deciding from the authoritative state. */
function playOut(seed: number) {
  const match = new OnlineMatch(0);
  const bots = [sideBot(0, seeded(seed)), sideBot(1, seeded(seed + 1))] as const;
  const keys = [-1, -1];
  while (!match.over && match.tick < 120 * 60 * 10) {
    ([0, 1] as const).forEach((side) => {
      const bits = bots[side](match.g);
      if (bits !== keys[side]) match.input(side, match.tick + 1, (keys[side] = bits));
    });
    match.step();
  }
  return match;
}

describe('OnlineMatch', () => {
  it('plays a full match between two people and ends at the win score', () => {
    const match = playOut(3);
    expect(match.over).toBe(true);
    const { score } = match.g;
    expect(Math.max(...score)).toBe(gameConfig.onlineWinScore);
    expect(match.winner).toBe(score[0] > score[1] ? 0 : 1);
  });

  it('is deterministic: the same inputs give the same match, tick for tick', () => {
    const a = playOut(11);
    const b = playOut(11);
    expect(b.tick).toBe(a.tick);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('applies a late input on the next step and refuses far-future ones', () => {
    const match = new OnlineMatch(0);
    for (let i = 0; i < 10; i++) match.step();
    expect(match.input(0, 5, KEY.LEFT)).toEqual({ result: 'late', tick: match.tick + 1 });
    expect(match.held()[0]).toBe(0);
    match.step();
    expect(match.held()[0]).toBe(KEY.LEFT);
    expect(match.input(1, match.tick + NET.MAX_INPUT_LEAD_TICKS + 1, KEY.JUMP).result).toBe('ahead');
    expect(match.input(1, match.tick + 3, KEY.JUMP)).toEqual({ result: 'ok', tick: match.tick + 3 });
  });

  it('moves the right-hand player with the second input, not the CPU', () => {
    const match = new OnlineMatch(0);
    const x = match.g.cpu.x;
    match.input(1, 1, KEY.RIGHT);
    for (let i = 0; i < 30; i++) match.step();
    expect(match.g.cpu.x).toBeGreaterThan(x); // the CPU AI would walk back home, not right
  });
});
