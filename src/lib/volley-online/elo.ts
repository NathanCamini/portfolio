import type { Side } from '../../components/volleyball/engine/types';

/**
 * Online rating (docs/volei-online.md, "Ranking online"): classic Elo.
 *
 * Everyone starts at 1000. After a rated match the winner takes
 * K × (1 − expected) points from the loser, where `expected` is the
 * winner's chance of winning given the gap (400 points ≈ 10:1 odds).
 * Beating someone much stronger pays a lot; beating someone much weaker,
 * almost nothing. Points only move between the two players, so the
 * average stays at 1000.
 */
export const ELO = {
  START: 1000,
  /** A fast-moving K for the first matches, so new players find their level. */
  K_NEW: 48,
  K: 32,
  /** Matches played before K settles. */
  PROVISIONAL: 10,
  /** Rating never goes below this (a floor keeps a losing streak from sinking a name forever). */
  FLOOR: 100,
} as const;

/** Chance that `a` beats `b`. */
export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

export interface Rated {
  rating: number;
  games: number;
}

export interface RatingChange {
  before: number;
  after: number;
}

/**
 * The new ratings after `winner` beat the other side. Each player moves by
 * their own K (a newcomer's result moves them more), rounded to whole points,
 * and a win always gains at least 1.
 */
export function rate(players: [Rated, Rated], winner: Side): [RatingChange, RatingChange] {
  const loser: Side = winner === 0 ? 1 : 0;
  const w = players[winner];
  const l = players[loser];
  const k = (p: Rated) => (p.games < ELO.PROVISIONAL ? ELO.K_NEW : ELO.K);
  const gain = Math.max(1, Math.round(k(w) * (1 - expected(w.rating, l.rating))));
  const loss = Math.max(1, Math.round(k(l) * expected(l.rating, w.rating)));
  const out: [RatingChange, RatingChange] = [
    { before: 0, after: 0 },
    { before: 0, after: 0 },
  ];
  out[winner] = { before: w.rating, after: w.rating + gain };
  out[loser] = { before: l.rating, after: Math.max(ELO.FLOOR, l.rating - loss) };
  return out;
}
