-- Ebb schema for Neon Postgres. The app runs this automatically on first request
-- when DATABASE_URL is set; it is kept here for reference and manual setup.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  guidance_mode TEXT NOT NULL DEFAULT 'coach'
                CHECK (guidance_mode IN ('anchor', 'coach', 'autopilot')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  color          TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  due_date       DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  estimate_minutes INTEGER NOT NULL,
  done             BOOLEAN NOT NULL DEFAULT false
);

-- Planned vs. actual: start/end are the plan, actual_minutes is what really happened.
CREATE TABLE IF NOT EXISTS events (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id           TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id              TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  date                 DATE NOT NULL,
  start_min            INTEGER NOT NULL,
  end_min              INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'planned'
                       CHECK (status IN ('planned', 'completed', 'partial', 'skipped')),
  actual_minutes       INTEGER NOT NULL DEFAULT 0,
  kind                 TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work', 'life')),
  moved_from_date      DATE,
  moved_from_start_min INTEGER
);
CREATE INDEX IF NOT EXISTS events_user_date_idx ON events (user_id, date);

-- Append-only time series of focused time logged against a task.
CREATE TABLE IF NOT EXISTS time_logs (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_id   TEXT REFERENCES events(id) ON DELETE SET NULL,
  minutes    INTEGER NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_logs_task_idx ON time_logs (task_id, created_at);
