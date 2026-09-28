import { describe, expect, it } from 'vitest';
import { CPU_SPEED, TIMING } from '../engine/constants';
import { createGame, primaryAction, stepGame } from '../engine/physics';
import { checkResult, RANKING, scoreMatch } from './match';

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('match scoring', () => {
  it('rewards points, the win and speed', () => {
    expect(scoreMatch({ player: 7, cpu: 0, durationMs: 60_000 })).toBe(700 + 500 + 240);
    expect(scoreMatch({ player: 7, cpu: 3, durationMs: 120_500 })).toBe(700 - 60 + 500 + 180);
    expect(scoreMatch({ player: 7, cpu: 6, durationMs: 10 * 60_000 })).toBe(700 - 120 + 500);
    expect(scoreMatch({ player: 5, cpu: 7, durationMs: 60_000 })).toBe(500 - 140);
  });

  it('never goes negative and ranks any win above any loss', () => {
    expect(scoreMatch({ player: 0, cpu: 7, durationMs: 20_000 })).toBe(0);
    const worstWin = scoreMatch({ player: 7, cpu: 6, durationMs: RANKING.MATCH_TTL_MS });
    const bestLoss = scoreMatch({ player: 6, cpu: 7, durationMs: 0 });
    expect(worstWin).toBeGreaterThan(bestLoss);
  });
});

describe('match plausibility', () => {
  const ok = { player: 7, cpu: 2, durationMs: 90_000 };

  it('accepts a normal finished match', () => {
    expect(checkResult(ok, 7)).toBeNull();
    expect(checkResult({ player: 4, cpu: 7, durationMs: 60_000 }, 7)).toBeNull();
  });

  it('rejects scorelines a match cannot end on', () => {
    expect(checkResult({ ...ok, player: 8 }, 7)).toBe('invalid_result'); // past the win score
    expect(checkResult({ ...ok, player: 6 }, 7)).toBe('invalid_result'); // nobody won yet
    expect(checkResult({ ...ok, cpu: 7 }, 7)).toBe('invalid_result'); // both won
    expect(checkResult({ ...ok, cpu: -1 }, 7)).toBe('invalid_result');
    expect(checkResult({ ...ok, cpu: 1.5 }, 7)).toBe('invalid_result');
    expect(checkResult({ ...ok, durationMs: RANKING.MATCH_TTL_MS + 1 }, 7)).toBe('invalid_result');
  });

  it('rejects matches played faster than the rules allow', () => {
    expect(checkResult({ player: 7, cpu: 0, durationMs: 7 * RANKING.MIN_MS_PER_POINT - 1 }, 7)).toBe('too_fast');
    expect(checkResult({ player: 7, cpu: 0, durationMs: 7 * RANKING.MIN_MS_PER_POINT }, 7)).toBeNull();
  });

  it('never rejects the fastest possible real match', () => {
    // The quickest match there is: the player hides and the CPU wins every serve untouched.
    const g = createGame(CPU_SPEED.normal, 7, seeded());
    primaryAction(g);
    const rng = seeded(2);
    while (g.phase !== 'over') stepGame(g, TIMING.STEP, { left: true, right: false, jump: false }, rng);
    const result = { player: g.score[0], cpu: g.score[1], durationMs: Math.round(g.matchTime) };
    expect(result.cpu).toBe(7);
    expect(checkResult(result, 7)).toBeNull();
  });
});
