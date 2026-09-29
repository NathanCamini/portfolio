import { NET, type LiveMatch, type LiveSummary } from '../src/lib/volley-online/protocol';
import { withSchema } from './store';

/**
 * The live showcase in D1 (docs/volei-online.md, "Ao vivo"): one row per
 * quick-match room with a match on, written by the room itself.
 */

/** A room's news: its row updated (or created), or removed when there's nothing to watch. Sweeps stale rows. */
export async function publishLive(db: D1Database, code: string, s: LiveSummary | null, now: number) {
  const sweep = db.prepare('DELETE FROM online_live WHERE updated_at < ?1').bind(now - NET.LIVE_STALE_MS);
  const write = s
    ? db
        .prepare(
          `INSERT INTO online_live (code, name0, name1, score0, score1, phase, spectators, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT (code) DO UPDATE SET
             name0 = excluded.name0, name1 = excluded.name1, score0 = excluded.score0,
             score1 = excluded.score1, phase = excluded.phase, spectators = excluded.spectators,
             updated_at = excluded.updated_at`,
        )
        .bind(code, s.names[0], s.names[1], s.score[0], s.score[1], s.phase, s.spectators, now)
    : db.prepare('DELETE FROM online_live WHERE code = ?1').bind(code);
  await withSchema(db, () => db.batch([write, sweep]));
}

interface Row {
  code: string;
  name0: string;
  name1: string;
  score0: number;
  score1: number;
  phase: LiveSummary['phase'];
  spectators: number;
  updated_at: number;
}

/** The matches on now: the most watched first, then the most recent. */
export function listLive(db: D1Database, now: number, limit: number): Promise<LiveMatch[]> {
  return withSchema(db, async () => {
    const { results } = await db
      .prepare(
        `SELECT * FROM online_live WHERE updated_at >= ?1
         ORDER BY spectators DESC, updated_at DESC LIMIT ?2`,
      )
      .bind(now - NET.LIVE_STALE_MS, limit)
      .all<Row>();
    return results.map((r) => ({
      code: r.code,
      names: [r.name0, r.name1],
      score: [r.score0, r.score1],
      phase: r.phase,
      spectators: r.spectators,
      updatedAt: r.updated_at,
    }));
  });
}
