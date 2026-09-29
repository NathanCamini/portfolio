import type { NameProblem } from './nickname';

/**
 * The global ranking: one API, one database, one name filter and one UI,
 * built for several games, each with its own board (scores aren't comparable)
 * and its own result rules (rules.ts). Today it has one, the Peek Trainer: the
 * volleyball Endless board moved to the game's own site (NathanCamini/volleyball_game).
 * Adding a game is one entry here and one in rules.ts.
 */
export const GAMES = ['peek'] as const;
export type GameId = (typeof GAMES)[number];
export const isGame = (value: string): value is GameId => (GAMES as readonly string[]).includes(value);

export const RANKING = {
  /** Rows shown on each board (best run per player). */
  TOP: 10,
  /** The browser starts its clock a network round-trip before the server does. */
  CLOCK_SLACK_MS: 5_000,
  /** A kickoff ticket is only good for this long. */
  MATCH_TTL_MS: 3 * 60 * 60 * 1000,
} as const;

export interface LeaderboardEntry {
  name: string;
  score: number;
  /** Game-specific numbers shown next to the score (run time, hits, headshots…). */
  detail: Record<string, number>;
  /** When it was set (epoch ms). */
  at: number;
}

export type ResultProblem = 'invalid_result' | 'too_fast';

// ---- HTTP contract (/api/ranking/:game/*) ----

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

/** POST /api/ranking/:game/matches — called when a run kicks off. */
export interface StartResponse {
  matchId: string;
}

/** POST /api/ranking/:game/scores */
export interface SubmitRequest {
  matchId: string;
  name: string;
  /** The game's own result (see rules.ts); the server checks it and derives the score. */
  result: unknown;
}

export interface SubmitResponse {
  score: number;
  /** This player's best on this board (this run or an earlier one). */
  best: number;
  personalBest: boolean;
  /** 1-based position of the player's best on the board. */
  position: number;
  top: LeaderboardEntry[];
}

/** GET /api/ranking/:game */
export interface TopResponse {
  top: LeaderboardEntry[];
}
