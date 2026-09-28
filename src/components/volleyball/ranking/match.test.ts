import { describe, expect, it } from 'vitest';
import { botInput } from '../engine/bot';
import { TIMING } from '../engine/constants';
import { createGame, primaryAction, stepGame } from '../engine/physics';
import { checkResult, RANKING } from './match';

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('endless run plausibility', () => {
  it('accepts runs whose clock fits the rally count', () => {
    expect(checkResult({ points: 0, durationMs: 7 * RANKING.MIN_MS_PER_POINT }, 7)).toBeNull();
    expect(checkResult({ points: 25, durationMs: 32 * RANKING.MIN_MS_PER_POINT }, 7)).toBeNull();
  });

  it('rejects malformed numbers', () => {
    expect(checkResult({ points: -1, durationMs: 60_000 }, 7)).toBe('invalid_result');
    expect(checkResult({ points: 1.5, durationMs: 60_000 }, 7)).toBe('invalid_result');
    expect(checkResult({ points: 3, durationMs: Number.NaN }, 7)).toBe('invalid_result');
    expect(checkResult({ points: 3, durationMs: RANKING.MATCH_TTL_MS + 1 }, 7)).toBe('invalid_result');
  });

  it("rejects more points than the clock allows — the CPU's 7 count too", () => {
    expect(checkResult({ points: 0, durationMs: 7 * RANKING.MIN_MS_PER_POINT - 1 }, 7)).toBe('too_fast');
    expect(checkResult({ points: 100, durationMs: 60_000 }, 7)).toBe('too_fast');
  });

  it('never rejects a real run', () => {
    // A stand-in player against the Endless CPU until the CPU reaches 7.
    const g = createGame('endless', seeded(3));
    primaryAction(g);
    const rng = seeded(4);
    const bot = seeded(5);
    while (g.phase !== 'over') stepGame(g, TIMING.STEP, botInput(g, TIMING.STEP * 60, bot), rng);
    expect(g.score[1]).toBe(7);
    expect(checkResult({ points: g.score[0], durationMs: Math.round(g.matchTime) }, 7)).toBeNull();
  });
});
