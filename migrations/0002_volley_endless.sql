-- Endless leaderboard: points scored before the CPU reaches its limit.
-- Replaces the per-match scores of 0001 (volley_scores is left as it was, unused).
-- Idempotent, like 0001: the Worker runs it itself if the table is missing.

CREATE TABLE IF NOT EXISTS volley_endless (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- Case/accent-insensitive identity: the board shows each player's best only.
  name_key TEXT NOT NULL,
  points INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS volley_endless_best ON volley_endless (name_key, points DESC, id);
