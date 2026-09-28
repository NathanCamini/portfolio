import { TIMING } from '../engine/constants';
import type { NameProblem } from './nickname';

/**
 * Leaderboard rules and API contract, shared by the game (browser) and the
 * ranking Worker. The client only reports the scoreline and the match clock;
 * the Worker re-checks both and computes the score itself.
 */

/** What the client reports when a match ends. */
export interface MatchResult {
  player: number;
  cpu: number;
  /** Simulated time from the first serve to the final whistle (fixed-step engine clock). */
  durationMs: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  player: number;
  cpu: number;
  durationMs: number;
  /** When it was set (epoch ms). */
  at: number;
}

export const RANKING = {
  /** Rows shown on the board (best score per player). */
  TOP: 10,
  /**
   * No point can be faster than the serve hover plus the pause after it —
   * the ball can't be reached while it hovers. The real minimum is higher
   * (the ball still has to fall), so this lower bound never rejects a real match.
   */
  MIN_MS_PER_POINT: TIMING.SERVE_AUTO_DROP_MS + TIMING.POINT_PAUSE_MS,
  /** The browser starts its clock a network round-trip before the server does. */
  CLOCK_SLACK_MS: 5_000,
  /** A kickoff ticket is only good for this long. */
  MATCH_TTL_MS: 60 * 60 * 1000,
  /** Winning faster earns up to this many points (one per second under the limit). */
  SPEED_BONUS: 300,
} as const;

/**
 * 100 per point scored, −20 per point conceded; a win adds 500 plus the speed
 * bonus. Any win outscores any loss. Never negative.
 */
export function scoreMatch({ player, cpu, durationMs }: MatchResult): number {
  const won = player > cpu;
  const speed = won ? Math.max(0, RANKING.SPEED_BONUS - Math.floor(durationMs / 1000)) : 0;
  return Math.max(0, player * 100 - cpu * 20 + (won ? 500 + speed : 0));
}

export type ResultProblem = 'invalid_result' | 'too_fast';

/**
 * Can this scoreline and clock come out of a real match? The match ends the
 * moment either side reaches `winScore`, so exactly one side has it; and every
 * point takes a minimum amount of game time.
 */
export function checkResult(r: MatchResult, winScore: number): ResultProblem | null {
  const { player, cpu, durationMs } = r;
  const counts = [player, cpu, durationMs].every((n) => Number.isSafeInteger(n) && n >= 0);
  if (!counts || Math.max(player, cpu) !== winScore || Math.min(player, cpu) >= winScore) return 'invalid_result';
  if (durationMs > RANKING.MATCH_TTL_MS) return 'invalid_result';
  if (durationMs < (player + cpu) * RANKING.MIN_MS_PER_POINT) return 'too_fast';
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

/** POST /api/volley/matches */
export interface StartResponse {
  matchId: string;
}

/** POST /api/volley/scores */
export interface SubmitRequest extends MatchResult {
  matchId: string;
  name: string;
}

export interface SubmitResponse {
  /** Score the server computed for this match. */
  score: number;
  /** This player's best score (this match or an earlier one). */
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
