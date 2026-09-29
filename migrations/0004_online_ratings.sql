-- Online volleyball ranking (docs/volei-online.md, "Ranking online"): Elo per player.
-- A player is their browser's secret id, stored here only as a SHA-256 hash.
-- Idempotent, like the others: the Worker runs it itself if a table is missing.

CREATE TABLE IF NOT EXISTS online_ratings (
  player TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS online_ratings_top ON online_ratings (rating DESC, updated_at);

-- Every rated match, for the record (and to rebuild ratings if the formula ever changes).
CREATE TABLE IF NOT EXISTS online_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  winner TEXT NOT NULL,
  loser TEXT NOT NULL,
  winner_before INTEGER NOT NULL,
  winner_after INTEGER NOT NULL,
  loser_before INTEGER NOT NULL,
  loser_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
