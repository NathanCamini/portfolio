import { describe, expect, it } from 'vitest';
import {
  createTrainer,
  exposure,
  MAX_TARGETS,
  ROUND_MS,
  shoot,
  startRound,
  targetGeometry,
  update,
} from '../../components/siege/engine';
import { HUMAN, playerBot } from '../../components/volleyball/engine/bot';
import { TIMING } from '../../components/volleyball/engine/constants';
import { createGame, primaryAction, stepGame } from '../../components/volleyball/engine/physics';
import { RANKING } from './contract';
import { peekMaxScore, RULES, VOLLEY_MIN_MS_PER_POINT, type PeekResult } from './rules';

const seeded =
  (seed = 1) =>
  () =>
    ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const LONG_AGO = RANKING.MATCH_TTL_MS; // server clock: plenty of time has passed

describe('volley (endless) rules', () => {
  const check = RULES.volley.check;

  it('accepts runs whose clock fits the rally count', () => {
    expect(check({ points: 0, durationMs: 7 * VOLLEY_MIN_MS_PER_POINT }, LONG_AGO)).toBeNull();
    expect(check({ points: 25, durationMs: 32 * VOLLEY_MIN_MS_PER_POINT }, LONG_AGO)).toBeNull();
  });

  it('rejects malformed numbers', () => {
    expect(RULES.volley.parse({ points: '3', durationMs: 1 })).toBeNull();
    expect(check({ points: -1, durationMs: 60_000 }, LONG_AGO)).toBe('invalid_result');
    expect(check({ points: 1.5, durationMs: 60_000 }, LONG_AGO)).toBe('invalid_result');
    expect(check({ points: 3, durationMs: RANKING.MATCH_TTL_MS + 1 }, LONG_AGO)).toBe('invalid_result');
  });

  it("rejects more points than the clock allows — the CPU's 7 count too", () => {
    expect(check({ points: 0, durationMs: 7 * VOLLEY_MIN_MS_PER_POINT - 1 }, LONG_AGO)).toBe('too_fast');
    expect(check({ points: 100, durationMs: 60_000 }, LONG_AGO)).toBe('too_fast');
  });

  it('rejects a clock longer than the server has known about the run', () => {
    expect(check({ points: 5, durationMs: 60_000 }, 60_000 - RANKING.CLOCK_SLACK_MS - 1)).toBe('too_fast');
  });

  it('never rejects a real run', () => {
    const g = createGame('endless', seeded(3));
    primaryAction(g);
    const rng = seeded(4);
    const bot = playerBot(HUMAN, seeded(5));
    while (g.phase !== 'over') stepGame(g, TIMING.STEP, bot(g, TIMING.STEP * 60), rng);
    const result = { points: g.score[0], durationMs: Math.round(g.matchTime) };
    expect(check(result, result.durationMs)).toBeNull();
    expect(RULES.volley.score(result)).toBe(g.score[0]);
  });
});

describe('peek trainer rules', () => {
  const check = RULES.peek.check;
  const ok: PeekResult = { score: 1800, shots: 30, hits: 20, headshots: 10, bestStreak: 12 };

  /** A perfect shooter: headshots every enemy the moment it's exposed enough, never touches a hostage. */
  function perfectRound(seed: number): PeekResult {
    const s = createTrainer();
    const rng = seeded(seed);
    startRound(s, 0);
    for (let now = 0; s.phase === 'playing'; now += 16) {
      update(s, now, rng);
      for (const t of s.targets) {
        if (t.hit || t.kind === 'hostage' || exposure(t, s.now) < 0.6) continue;
        const { head } = targetGeometry(t, s.now);
        shoot(s, head.x, head.y);
      }
    }
    return { score: s.score, shots: s.shots, hits: s.hits, headshots: s.headshots, bestStreak: s.bestStreak };
  }

  it('accepts a consistent round once the server has seen 30 s pass', () => {
    expect(check(ok, ROUND_MS)).toBeNull();
    expect(check(ok, ROUND_MS - RANKING.CLOCK_SLACK_MS)).toBeNull();
  });

  it('never rejects even a perfect real round', () => {
    for (const seed of [1, 2, 3]) {
      const round = perfectRound(seed);
      expect(round.hits).toBeGreaterThan(20);
      expect(round.headshots).toBe(round.hits);
      expect(round.score).toBeLessThanOrEqual(peekMaxScore(round.hits, round.headshots));
      expect(check(round, ROUND_MS)).toBeNull();
    }
  });

  it('rejects a result before the round could have ended', () => {
    expect(check(ok, ROUND_MS - RANKING.CLOCK_SLACK_MS - 1)).toBe('too_fast');
  });

  it('rejects counts that contradict each other or the round pacing', () => {
    expect(check({ ...ok, headshots: 21 }, ROUND_MS)).toBe('invalid_result'); // more heads than hits
    expect(check({ ...ok, hits: 31 }, ROUND_MS)).toBe('invalid_result'); // more hits than shots
    expect(check({ ...ok, bestStreak: 21 }, ROUND_MS)).toBe('invalid_result');
    expect(check({ ...ok, hits: MAX_TARGETS + 1, shots: 200 }, ROUND_MS)).toBe('invalid_result');
    expect(check({ ...ok, shots: 10_000 }, ROUND_MS)).toBe('invalid_result');
    expect(check({ ...ok, score: -5 }, ROUND_MS)).toBe('invalid_result');
  });

  it('rejects a score those hits cannot make', () => {
    const max = peekMaxScore(20, 10);
    expect(check({ ...ok, score: max }, ROUND_MS)).toBeNull();
    expect(check({ ...ok, score: max + 1 }, ROUND_MS)).toBe('invalid_result');
    // 3 hits, all heads, one streak: 100 + 110 + 120.
    expect(peekMaxScore(3, 3)).toBe(330);
    expect(peekMaxScore(2, 0)).toBe(50 + 55);
  });
});
