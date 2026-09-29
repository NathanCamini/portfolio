-- Live showcase (docs/volei-online.md, "Ao vivo"): the quick-match rooms with a match on.
-- Each room upserts its row on kickoff, on every point, when spectators come and go, and at
-- least every 30 s; it deletes it when the match ends. A row not refreshed in 75 s is ignored
-- (a room evicted mid-match can't say goodbye) and swept by the next write.
-- Idempotent, like the others: the Worker runs it itself if a table is missing.

CREATE TABLE IF NOT EXISTS online_live (
  code TEXT PRIMARY KEY,
  name0 TEXT NOT NULL,
  name1 TEXT NOT NULL,
  score0 INTEGER NOT NULL,
  score1 INTEGER NOT NULL,
  phase TEXT NOT NULL,
  spectators INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS online_live_fresh ON online_live (updated_at);
