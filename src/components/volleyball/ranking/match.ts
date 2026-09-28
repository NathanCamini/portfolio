import { TIMING } from '../engine/constants';
import type { NameProblem } from './nickname';

/**
 * Leaderboard rules and API contract, shared by the game (browser) and the
 * ranking Worker. Only Endless is ranked: the score is how many points the
 * player makes before the CPU reaches its limit. The client reports that and
 * the match clock; the Worker checks that the clock fits the rally count.
 */

/** What the client reports when an Endless run ends (the CPU just reached its limit). */
export interface EndlessResult {
  points: number;
  /** Simulated time from the first serve to the final whistle (fixed-step engine clock). */
  durationMs: number;
}

export interface LeaderboardEntry {
  name: string;
  points: number;
  durationMs: number;
  /** When it was set (epoch ms). */
  at: number;
}

export const RANKING = {
  /** Rows shown on the board (best run per player). */
  TOP: 10,
  /**
   * No point can be faster than the serve hover plus the pause after it —
   * the ball can't be reached while it hovers. The real minimum is higher
   * (the ball still has to fall), so this lower bound never rejects a real run.
   */
  MIN_MS_PER_POINT: TIMING.SERVE_AUTO_DROP_MS + TIMING.POINT_PAUSE_MS,
  /** The browser starts its clock a network round-trip before the server does. */
  CLOCK_SLACK_MS: 5_000,
  /** A kickoff ticket is only good for this long (a strong Endless run can last a while). */
  MATCH_TTL_MS: 3 * 60 * 60 * 1000,
} as const;

export type ResultProblem = 'invalid_result' | 'too_fast';

/**
 * Can this come out of a real run? Every point — the player's and the CPU's
 * `cpuLimit` — takes a minimum amount of game time, so the clock bounds how
 * many points a run can claim.
 */
export function checkResult({ points, durationMs }: EndlessResult, cpuLimit: number): ResultProblem | null {
  if (![points, durationMs].every((n) => Number.isSafeInteger(n) && n >= 0)) return 'invalid_result';
  if (durationMs > RANKING.MATCH_TTL_MS) return 'invalid_result';
  if (durationMs < (points + cpuLimit) * RANKING.MIN_MS_PER_POINT) return 'too_fast';
  return null;
}

// ---- HTTP contract (/api/volley/*) ----

export type ApiErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'invalid_name'
  | ResultProblem
  /** Unknown ticket, or its score was already saved. */
  | 'match_not_found'
  | 'match_expired'
  | 'rate_limited'
  | 'unavailable';

export interface ApiErrorBody {
  error: ApiErrorCode;
  /** Only for `invalid_name`. */
  reason?: NameProblem;
}

/** POST /api/volley/matches — called when an Endless run kicks off. */
export interface StartResponse {
  matchId: string;
}

/** POST /api/volley/scores */
export interface SubmitRequest extends EndlessResult {
  matchId: string;
  name: string;
}

export interface SubmitResponse {
  points: number;
  /** This player's best run (this one or an earlier one). */
  best: number;
  personalBest: boolean;
  /** 1-based position of the player's best on the global board. */
  position: number;
  top: LeaderboardEntry[];
}

/** GET /api/volley/ranking */
export interface TopResponse {
  top: LeaderboardEntry[];
}
