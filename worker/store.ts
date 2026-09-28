import type { LeaderboardEntry, SubmitResponse } from '../src/components/volleyball/ranking/match';
import schema from '../migrations/0001_volley_ranking.sql';

/** The migration's statements (it has no `;` or `--` inside string literals). */
const SCHEMA = schema
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Runs `query`; if the tables don't exist yet (a fresh database whose
 * migrations were never applied) creates them from the migration file and
 * retries once. Costs nothing once the schema is there.
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

/** Each player's entries, best first (ties go to whoever got there first). */
const BEST = `best AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY score DESC, id) AS rn
  FROM volley_scores
)`;

const topStatement = (db: D1Database, limit: number) =>
  db
    .prepare(
      `WITH ${BEST}
       SELECT name, score, player_points AS player, cpu_points AS cpu, duration_ms AS durationMs, created_at AS at
       FROM best WHERE rn = 1
       ORDER BY score DESC, id
       LIMIT ?1`,
    )
    .bind(limit);

/** The board: one row per player (their best), highest first. */
export function top(db: D1Database, limit: number): Promise<LeaderboardEntry[]> {
  return withSchema(db, async () => (await topStatement(db, limit).all<LeaderboardEntry>()).results);
}

/** Issues a match ticket and sweeps tickets nobody redeemed in time. */
export async function openMatch(db: D1Database, id: string, now: number, expiredBefore: number): Promise<void> {
  await withSchema(db, () =>
    db.batch([
      db.prepare('INSERT INTO volley_matches (id, started_at) VALUES (?1, ?2)').bind(id, now),
      db.prepare('DELETE FROM volley_matches WHERE started_at < ?1').bind(expiredBefore),
    ]),
  );
}

/** When the ticket was issued, or null if it doesn't exist (never issued, expired or already used). */
export function matchStartedAt(db: D1Database, id: string): Promise<number | null> {
  return withSchema(db, () =>
    db.prepare('SELECT started_at FROM volley_matches WHERE id = ?1').bind(id).first<number>('started_at'),
  );
}

export interface NewScore {
  matchId: string;
  name: string;
  key: string;
  score: number;
  player: number;
  cpu: number;
  durationMs: number;
  now: number;
}

/**
 * Saves the score and consumes the ticket in one transaction (a D1 batch),
 * then reads the player's standing and the board in the same round trip.
 * The insert only happens while the ticket still exists, so two racing
 * submissions of one match can't both land: the loser gets null.
 */
export async function saveScore(db: D1Database, s: NewScore, limit: number): Promise<SubmitResponse | null> {
  try {
    const [inserted, , standing, board] = await withSchema(db, () =>
      db.batch([
        db
          .prepare(
            `INSERT INTO volley_scores
               (match_id, name, name_key, score, player_points, cpu_points, duration_ms, created_at)
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
             WHERE EXISTS (SELECT 1 FROM volley_matches WHERE id = ?1)
             RETURNING id`,
          )
          .bind(s.matchId, s.name, s.key, s.score, s.player, s.cpu, s.durationMs, s.now),
        db.prepare('DELETE FROM volley_matches WHERE id = ?1').bind(s.matchId),
        db
          .prepare(
            `WITH ${BEST}, me AS (SELECT score, id FROM best WHERE rn = 1 AND name_key = ?1)
             SELECT me.score AS best, me.id AS bestId,
               1 + (SELECT COUNT(*) FROM best b
                    WHERE b.rn = 1 AND (b.score > me.score OR (b.score = me.score AND b.id < me.id))) AS position
             FROM me`,
          )
          .bind(s.key),
        topStatement(db, limit),
      ]),
    );

    const entry = inserted.results[0] as { id: number } | undefined;
    const me = standing.results[0] as { best: number; bestId: number; position: number } | undefined;
    if (!entry || !me) return null;
    return {
      score: s.score,
      best: me.best,
      personalBest: me.bestId === entry.id,
      position: me.position,
      top: board.results as LeaderboardEntry[],
    };
  } catch (err) {
    // Backstop for the same race: match_id is UNIQUE.
    if (String(err).includes('UNIQUE constraint failed')) return null;
    throw err;
  }
}
