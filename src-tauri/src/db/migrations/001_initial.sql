-- 001_initial: reminders + settings + schema version tracking.
-- Applied once via the migration runner in db/mod.rs (tracked in
-- schema_migrations). Future changes ship as 002_*.sql, 003_*.sql, ...

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL,
    message             TEXT,
    kind                TEXT NOT NULL DEFAULT 'reminder',
    enabled             INTEGER NOT NULL DEFAULT 1,
    schedule_type       TEXT NOT NULL DEFAULT 'once',
    scheduled_time      TEXT NOT NULL,
    -- Sorted weekday numbers as "1,3,5" (0=Sunday..6=Saturday), NULL otherwise.
    days_of_week        TEXT,
    snooze_duration     INTEGER NOT NULL DEFAULT 5,
    tone                TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    last_triggered_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reminders_enabled ON reminders (enabled);

-- Small application preferences as key/value rows. Structured domain data
-- lives in dedicated tables; this table is only for scalar preferences.
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
