-- One ranking for every mini-game: tickets and scores tagged by game.
-- Supersedes the volleyball-only tables of 0001/0002 (left in place, unused);
-- the Endless board is copied over so nobody loses their spot.
-- Idempotent, like the others: the Worker runs it itself if a table is missing.

CREATE TABLE IF NOT EXISTS ranking_matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  started_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ranking_matches_started ON ranking_matches (started_at);

CREATE TABLE IF NOT EXISTS ranking_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  match_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- Case/accent-insensitive identity: each board shows a player's best only.
  name_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  -- JSON object with the game's own numbers (run time, hits, headshots…).
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ranking_scores_best ON ranking_scores (game, name_key, score DESC, id);

-- Copy the Endless board, oldest first so ties keep their order (match_id is unique: runs once).
INSERT OR IGNORE INTO ranking_scores (game, match_id, name, name_key, score, detail, created_at)
SELECT 'volley', match_id, name, name_key, points, json_object('durationMs', duration_ms), created_at
FROM volley_endless
ORDER BY id;
