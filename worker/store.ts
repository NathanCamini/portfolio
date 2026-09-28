import type { GameId, LeaderboardEntry, SubmitResponse } from '../src/lib/ranking/contract';
import volleyRanking from '../migrations/0001_volley_ranking.sql';
import volleyEndless from '../migrations/0002_volley_endless.sql';
import ranking from '../migrations/0003_ranking.sql';

/** Every migration's statements, in order (none has `;` or `--` inside string literals). */
const SCHEMA = [volleyRanking, volleyEndless, ranking]
  .join(';')
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Runs `query`; if a table doesn't exist yet (a fresh database, or a new
 * migration nobody applied) creates what's missing from the migration files
 * — they're idempotent — and retries once. Costs nothing once the schema is there.
 */
async function withSchema<T>(db: D1Database, query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (err) {
    if (!String(err).includes('no such table')) throw err;
    await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    return query();
  }
}

/** One game's runs per player, best first (ties go to whoever got there first). `game` is a bind placeholder. */
const best = (game: string) => `best AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY score DESC, id) AS rn
  FROM ranking_scores WHERE game = ${game}
)`;

interface Row {
  name: string;
  score: number;
  detail: string;
  at: number;
}

const entry = (r: Row): LeaderboardEntry => ({ name: r.name, score: r.score, detail: JSON.parse(r.detail), at: r.at });

const topStatement = (db: D1Database, game: GameId, limit: number) =>
  db
    .prepare(
      `WITH ${best('?1')}
       SELECT name, score, detail, created_at AS at
       FROM best WHERE rn = 1
       ORDER BY score DESC, id
       LIMIT ?2`,
    )
    .bind(game, limit);

/** A game's board: one row per player (their best), highest first. */
export function top(db: D1Database, game: GameId, limit: number): Promise<LeaderboardEntry[]> {
  return withSchema(db, async () => (await topStatement(db, game, limit).all<Row>()).results.map(entry));
}

/** Issues a run ticket and sweeps tickets nobody redeemed in time. */
export async function openMatch(db: D1Database, game: GameId, id: string, now: number, expiredBefore: number) {
  await withSchema(db, () =>
    db.batch([
      db.prepare('INSERT INTO ranking_matches (id, game, started_at) VALUES (?1, ?2, ?3)').bind(id, game, now),
      db.prepare('DELETE FROM ranking_matches WHERE started_at < ?1').bind(expiredBefore),
    ]),
  );
}

/** When this game's ticket was issued, or null if it doesn't exist (never issued, expired or already used). */
export function matchStartedAt(db: D1Database, game: GameId, id: string): Promise<number | null> {
  return withSchema(db, () =>
    db
      .prepare('SELECT started_at FROM ranking_matches WHERE id = ?1 AND game = ?2')
      .bind(id, game)
      .first<number>('started_at'),
  );
}

export interface NewScore {
  game: GameId;
  matchId: string;
  name: string;
  key: string;
  score: number;
  detail: Record<string, number>;
  now: number;
}

/**
 * Saves the score and consumes the ticket in one transaction (a D1 batch),
 * then reads the player's standing and the board in the same round trip.
 * The insert only happens while the ticket still exists, so two racing
 * submissions of one run can't both land: the loser gets null.
 */
export async function saveScore(db: D1Database, s: NewScore, limit: number): Promise<SubmitResponse | null> {
  try {
    const [inserted, , standing, board] = await withSchema(db, () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO ranking_scores (game, match_id, name, name_key, score, detail, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
             WHERE EXISTS (SELECT 1 FROM ranking_matches WHERE id = ?2 AND game = ?1)
             RETURNING id`,
          )
          .bind(s.game, s.matchId, s.name, s.key, s.score, JSON.stringify(s.detail), s.now),
        db.prepare('DELETE FROM ranking_matches WHERE id = ?1').bind(s.matchId),
        db
          .prepare(
            `WITH ${best('?1')}, me AS (SELECT score, id FROM best WHERE rn = 1 AND name_key = ?2)
             SELECT me.score AS best, me.id AS bestId,
               1 + (SELECT COUNT(*) FROM best b
                    WHERE b.rn = 1 AND (b.score > me.score OR (b.score = me.score AND b.id < me.id))) AS position
             FROM me`,
          )
          .bind(s.game, s.key),
        topStatement(db, s.game, limit),
      ]),
    );

    const row = inserted.results[0] as { id: number } | undefined;
    const me = standing.results[0] as { best: number; bestId: number; position: number } | undefined;
    if (!row || !me) return null;
    return {
      score: s.score,
      best: me.best,
      personalBest: me.bestId === row.id,
      position: me.position,
      top: (board.results as unknown as Row[]).map(entry),
    };
  } catch (err) {
    // Backstop for the same race: match_id is UNIQUE.
    if (String(err).includes('UNIQUE constraint failed')) return null;
    throw err;
  }
}
