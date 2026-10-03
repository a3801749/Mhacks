-- Schema for Neon Postgres. The app runs this automatically on first request
-- when DATABASE_URL is set; it is kept here for reference and manual setup.

CREATE TABLE IF NOT EXISTS users (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  guidance_mode       TEXT NOT NULL DEFAULT 'coach'
                      CHECK (guidance_mode IN ('anchor', 'coach', 'autopilot')),
  check_in_enabled    BOOLEAN NOT NULL DEFAULT true,
  ai_planner_enabled  BOOLEAN NOT NULL DEFAULT true,
  screen_time_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Projects" are assignments, tagged by course and type so estimates can learn per category.
CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL,
  course           TEXT NOT NULL DEFAULT 'General',
  -- project | exam | homework | reading | misc, validated by the API.
  type             TEXT NOT NULL DEFAULT 'project',
  priority         TEXT NOT NULL DEFAULT 'completion'
                   CONSTRAINT projects_priority_check CHECK (priority IN ('accuracy', 'completion', 'flexible', 'optional')),
  notes            TEXT NOT NULL DEFAULT '',
  pinned           BOOLEAN NOT NULL DEFAULT false,
  pin_count        INTEGER NOT NULL DEFAULT 0,
  pin_order        INTEGER NOT NULL DEFAULT 0,
  target_minutes   INTEGER NOT NULL,
  assigned_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date         DATE NOT NULL,
  progress_percent INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
  completed_date   DATE
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

-- Optional once-a-day "how did today feel" rating.
CREATE TABLE IF NOT EXISTS check_ins (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL,
  rating  INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  note    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, date)
);

-- Upgrades for databases created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS check_in_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_planner_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS screen_time_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS course TEXT NOT NULL DEFAULT 'General';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'project';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress_percent INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'completion';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pin_count INTEGER NOT NULL DEFAULT 0;
-- The old category list (with studying/writing) used the auto-named constraint.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pin_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_type_check;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_category_check;
UPDATE projects SET type = 'exam' WHERE type = 'studying';
UPDATE projects SET type = 'project' WHERE type = 'writing';
