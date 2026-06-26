-- migrations/0001_init.sql
-- Apply with: npx wrangler d1 execute ecoguesser --remote --file=./migrations/0001_init.sql
-- (drop --remote for local dev against the .wrangler sqlite shadow copy)

CREATE TABLE scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid         TEXT    NOT NULL,
  player_name  TEXT    NOT NULL CHECK(length(player_name) >= 1 AND length(player_name) <= 30),
  date         TEXT    NOT NULL,
  total_pts    INTEGER NOT NULL,
  total_dist   REAL    NOT NULL,
  submitted_at TEXT    DEFAULT (datetime('now')),
  UNIQUE(uuid, date)
);

CREATE INDEX idx_scores_date_pts ON scores(date, total_pts DESC, total_dist ASC, submitted_at ASC);
