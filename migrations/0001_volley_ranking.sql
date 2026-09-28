-- Global leaderboard for the beach-volley mini-game.
-- Idempotent on purpose: the Worker runs this same file if the tables are
-- missing (first request on a fresh database), and `wrangler d1 migrations
-- apply` can still run it later without conflict.

-- Open match tickets. Kickoff creates one; saving the score consumes it, so a
-- score can only be posted for a match the server saw start, and only once.
CREATE TABLE IF NOT EXISTS volley_matches (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS volley_matches_started ON volley_matches (started_at);

CREATE TABLE IF NOT EXISTS volley_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- Case/accent-insensitive identity: the board shows each player's best only.
  name_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  player_points INTEGER NOT NULL,
  cpu_points INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS volley_scores_best ON volley_scores (name_key, score DESC, id);
