import { hitPoints, MAX_TARGETS, ROUND_MS } from '../../components/siege/engine';
import { TIMING } from '../../components/volleyball/engine/constants';
import { gameConfig } from '../../config/game';
import { RANKING, type GameId, type ResultProblem } from './contract';

/**
 * What each game reports at the end of a run, and how the Worker checks it
 * before it reaches the board. Pure TypeScript: the rules are derived from
 * the games' own engines, so they can't drift from how the games play.
 * Basic anti-cheat — it stops tampering with the request, not a patient
 * forger who sends a plausible result.
 */

/** Beach volley, Endless: points scored before the CPU reached its limit, and the run clock. */
export interface VolleyResult {
  points: number;
  /** Simulated time from the first serve to the final whistle (fixed-step engine clock). */
  durationMs: number;
}

/** Peek Trainer: one 30-second round. */
export interface PeekResult {
  score: number;
  shots: number;
  hits: number;
  headshots: number;
  bestStreak: number;
}

export interface GameResults {
  volley: VolleyResult;
  peek: PeekResult;
}

export interface GameRules<R> {
  /** Shape check; null = malformed request. */
  parse(raw: unknown): R | null;
  /** `elapsedMs`: time the server saw pass since the run's ticket was issued. */
  check(result: R, elapsedMs: number): ResultProblem | null;
  score(result: R): number;
  /** Numbers shown next to the name on the board. */
  detail(result: R): Record<string, number>;
}

const isCount = (n: number) => Number.isSafeInteger(n) && n >= 0;

function numbers<K extends string>(raw: unknown, keys: readonly K[]): Record<K, number> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const out = {} as Record<K, number>;
  for (const key of keys) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

// ---- Beach volley (Endless) ----

/**
 * No point can be faster than the serve hover plus the pause after it — the
 * ball can't be reached while it hovers. The real minimum is higher (the ball
 * still has to fall), so this lower bound never rejects a real run.
 */
export const VOLLEY_MIN_MS_PER_POINT = TIMING.SERVE_AUTO_DROP_MS + TIMING.POINT_PAUSE_MS;

const volley: GameRules<VolleyResult> = {
  parse: (raw) => numbers(raw, ['points', 'durationMs'] as const),
  check({ points, durationMs }, elapsedMs) {
    if (!isCount(points) || !isCount(durationMs) || durationMs > RANKING.MATCH_TTL_MS) return 'invalid_result';
    // Every point — the player's and the CPU's — takes a minimum of game time…
    if (durationMs < (points + gameConfig.endlessCpuScore) * VOLLEY_MIN_MS_PER_POINT) return 'too_fast';
    // …and the game clock can't have run longer than the server has known about the run.
    if (durationMs > elapsedMs + RANKING.CLOCK_SLACK_MS) return 'too_fast';
    return null;
  },
  score: (r) => r.points,
  detail: (r) => ({ durationMs: r.durationMs }),
};

// ---- Peek Trainer ----

/** Nobody clicks more than 20 times a second for 30 seconds. */
export const PEEK_MAX_SHOTS = 20 * (ROUND_MS / 1000);

/**
 * The most `hits` hits can score with `headshots` of them to the head: one
 * unbroken streak, headshots last (where the multiplier is highest).
 */
export function peekMaxScore(hits: number, headshots: number): number {
  let total = 0;
  for (let i = 0; i < hits; i++) total += hitPoints(i >= hits - headshots, i);
  return total;
}

const peek: GameRules<PeekResult> = {
  parse: (raw) => numbers(raw, ['score', 'shots', 'hits', 'headshots', 'bestStreak'] as const),
  check({ score, shots, hits, headshots, bestStreak }, elapsedMs) {
    if (![score, shots, hits, headshots, bestStreak].every(isCount)) return 'invalid_result';
    // Counts that contradict each other or the round's pacing (at most MAX_TARGETS peeks).
    if (headshots > hits || hits > shots || bestStreak > hits || hits > MAX_TARGETS || shots > PEEK_MAX_SHOTS) {
      return 'invalid_result';
    }
    if (score > peekMaxScore(hits, headshots)) return 'invalid_result';
    // A round lasts 30 s: no result before the server has seen that much time pass.
    if (elapsedMs < ROUND_MS - RANKING.CLOCK_SLACK_MS) return 'too_fast';
    return null;
  },
  score: (r) => r.score,
  detail: (r) => ({ hits: r.hits, shots: r.shots, headshots: r.headshots, bestStreak: r.bestStreak }),
};

export const RULES: { [G in GameId]: GameRules<GameResults[G]> } = { volley, peek };
