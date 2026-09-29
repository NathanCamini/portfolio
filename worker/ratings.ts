import { ELO, rate, type Rated, type RatingChange } from '../src/lib/volley-online/elo';
import type { OnlineRankingEntry } from '../src/lib/volley-online/protocol';
import type { RatedResult } from '../src/lib/volley-online/room';
import { withSchema } from './store';

/**
 * The online ranking in D1 (docs/volei-online.md, "Ranking online").
 *
 * A player is the random id their browser keeps (`pid`, 128 bits). Only its
 * SHA-256 is stored: whoever reads the table can't play as anyone. The name
 * shown is the one used in their latest rated match.
 */

export async function hashPlayer(pid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pid));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ratedStatement = (db: D1Database, player: string) =>
  db.prepare('SELECT rating, games FROM online_ratings WHERE player = ?1').bind(player);

/** A player's rating, or null if they never played a rated match. */
export async function ratingOf(db: D1Database, pid: string): Promise<number | null> {
  const player = await hashPlayer(pid);
  return withSchema(db, () => ratedStatement(db, player).first<number>('rating'));
}

/**
 * Applies a rated result: reads both players, computes the change (elo.ts)
 * and writes both rows plus the match log in one transaction.
 *
 * The read and the write are two round trips, so two matches of the *same*
 * player finishing in the same instant (two tabs, two rooms) could lose one
 * update. A player can only be seated once per room, so that takes two quick
 * matches ending within milliseconds — accepted, and documented.
 */
export async function recordResult(db: D1Database, r: RatedResult, now: number): Promise<[RatingChange, RatingChange]> {
  const players = (await Promise.all(r.pids.map(hashPlayer))) as [string, string];
  const rows = await withSchema(db, () => db.batch(players.map((p) => ratedStatement(db, p))));
  const before = rows.map((res) => (res.results[0] as Rated | undefined) ?? { rating: ELO.START, games: 0 }) as [
    Rated,
    Rated,
  ];
  const changes = rate(before, r.winner);
  const loser = r.winner === 0 ? 1 : 0;
  const upsert = (i: 0 | 1) =>
    db
      .prepare(
        `INSERT INTO online_ratings (player, name, rating, games, wins, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5)
         ON CONFLICT (player) DO UPDATE SET
           name = excluded.name, rating = excluded.rating, games = games + 1,
           wins = wins + excluded.wins, updated_at = excluded.updated_at`,
      )
      .bind(players[i], r.names[i], changes[i].after, i === r.winner ? 1 : 0, now);
  await db.batch([
    upsert(0),
    upsert(1),
    db
      .prepare(
        `INSERT INTO online_results (winner, loser, winner_before, winner_after, loser_before, loser_after, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        players[r.winner],
        players[loser],
        changes[r.winner].before,
        changes[r.winner].after,
        changes[loser].before,
        changes[loser].after,
        now,
      ),
  ]);
  return changes;
}

/** One player's row and position on the board (by the hash of their id), or null. */
export function standing(db: D1Database, player: string): Promise<(OnlineRankingEntry & { position: number }) | null> {
  return withSchema(db, () =>
    db
      .prepare(
        `SELECT me.name, me.rating, me.games, me.wins,
           1 + (SELECT COUNT(*) FROM online_ratings o
                WHERE o.rating > me.rating OR (o.rating = me.rating AND o.updated_at < me.updated_at)) AS position
         FROM online_ratings me WHERE me.player = ?1`,
      )
      .bind(player)
      .first<OnlineRankingEntry & { position: number }>(),
  );
}

/** The online board: highest rating first (ties: whoever got there first). */
export function topRatings(db: D1Database, limit: number): Promise<OnlineRankingEntry[]> {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(
        `SELECT name, rating, games, wins FROM online_ratings
         ORDER BY rating DESC, updated_at LIMIT ?1`,
      )
      .bind(limit)
      .all<OnlineRankingEntry>();
    return results;
  });
}
