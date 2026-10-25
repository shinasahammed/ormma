//! SQLite persistence layer (Phase 2).
//!
//! - Database file lives in Tauri's `app_data_dir` (`papa.db`), never in the
//!   project directory. Tests use isolated temp files / in-memory databases.
//! - Schema evolves through versioned migrations (`migrations/*.sql`)
//!   tracked in `schema_migrations` — never an ad-hoc DDL block on launch.
//! - Shared access goes through [`DbState`] (`Mutex<Connection>`), so Tauri
//!   commands executing concurrently cannot interleave SQLite operations.
//! - `rusqlite` uses the `bundled` feature so the app ships its own SQLite
//!   (portable across Debian/Fedora/Arch without a system sqlite dev dep).

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};

use crate::error::{log_error, log_info, AppError, AppResult};
use crate::models::{
    decode_days, encode_days, AppSettings, CreateReminderInput, Reminder, ReminderFilter,
    UpdateReminderInput,
};

const DB_FILE_NAME: &str = "papa.db";

/// Migrations applied in order. To evolve the schema, append
/// `(3, include_str!("migrations/003_....sql"))` — never edit `001`/`002`.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/001_initial.sql")),
    (2, include_str!("migrations/002_snoozed_until.sql")),
];

/// Process-wide database handle shared with Tauri commands.
pub struct DbState(pub Mutex<rusqlite::Connection>);

impl DbState {
    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, rusqlite::Connection>> {
        self.0.lock().map_err(|e| {
            AppError::internal_error("acquiring database lock", format!("mutex poisoned: {e}"))
        })
    }
}

pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/// Opens (creating parent directories) and migrates the database file.
pub fn open_or_create(path: &Path) -> AppResult<rusqlite::Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            AppError::internal_error(
                "creating database directory",
                format!("{}: {e}", parent.display()),
            )
        })?;
    }
    let conn =
        rusqlite::Connection::open(path).map_err(|e| AppError::database("opening database", &e))?;
    // Fail fast on corruption risk, keep foreign-key discipline for later phases.
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| AppError::database("configuring database", &e))?;
    run_migrations(&conn)?;
    Ok(conn)
}

/// Resolves the production database path via Tauri's app-data directory
/// (e.g. `~/.local/share/app.papa.desktop/papa.db` on Linux).
pub fn resolve_db_path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::internal_error("resolving app data directory", e.to_string()))?;
    Ok(dir.join(DB_FILE_NAME))
}

/// Full startup sequence for `lib.rs`: resolve path -> open -> migrate.
pub fn init_app_db(app: &tauri::AppHandle) -> AppResult<DbState> {
    let path = resolve_db_path(app)?;
    let conn = open_or_create(&path)?;
    log_info("database ready (migrations applied, path configured)");
    let _ = &path; // path itself is never logged (privacy: no fs layout in logs)
    Ok(DbState(Mutex::new(conn)))
}

/// Applies pending migrations, recording each version. Idempotent: re-running
/// against an up-to-date database is a no-op.
pub fn run_migrations(conn: &rusqlite::Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            applied_at  INTEGER NOT NULL
        )",
    )
    .map_err(|e| AppError::database("initializing migration tracking", &e))?;

    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|e| AppError::database("reading schema version", &e))?;

    for (version, sql) in MIGRATIONS {
        if *version <= current {
            continue;
        }
        conn.execute_batch(sql)
            .map_err(|e| AppError::database(&format!("applying migration {version}"), &e))?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            params![version, now_secs()],
        )
        .map_err(|e| AppError::database(&format!("recording migration {version}"), &e))?;
    }
    Ok(())
}

#[cfg(test)]
pub fn schema_version(conn: &rusqlite::Connection) -> AppResult<i64> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
    .map_err(|e| AppError::database("reading schema version", &e))
}

// ---------------------------------------------------------------------------
// Row mapping (SQLite row -> domain model; never exposed raw)
// ---------------------------------------------------------------------------

fn reminder_from_row(row: &Row<'_>) -> rusqlite::Result<Reminder> {
    let enabled_int: i64 = row.get("enabled")?;
    let days_raw: Option<String> = row.get("days_of_week")?;
    Ok(Reminder {
        id: row.get("id")?,
        title: row.get("title")?,
        message: row.get("message")?,
        kind: row.get("kind")?,
        enabled: enabled_int != 0,
        schedule_type: row.get("schedule_type")?,
        scheduled_time: row.get("scheduled_time")?,
        days_of_week: decode_days(&days_raw).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::other(e.to_string())),
            )
        })?,
        snooze_duration: row.get("snooze_duration")?,
        tone: row.get("tone")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_triggered_at: row.get("last_triggered_at")?,
        snoozed_until: row.get("snoozed_until")?,
    })
}

// ---------------------------------------------------------------------------
// Reminder CRUD (pure connection functions; commands delegate to these so
// tests run against temp databases without a Tauri runtime)
// ---------------------------------------------------------------------------

pub fn create_reminder(
    conn: &rusqlite::Connection,
    input: &CreateReminderInput,
) -> AppResult<Reminder> {
    let v = input.validated()?;
    let now = now_secs();
    conn.execute(
        "INSERT INTO reminders
            (title, message, kind, enabled, schedule_type, scheduled_time,
             days_of_week, snooze_duration, tone, created_at, updated_at,
             last_triggered_at, snoozed_until)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL)",
        params![
            v.title,
            v.message,
            v.kind,
            i64::from(v.enabled),
            v.schedule_type,
            v.scheduled_time,
            encode_days(&v.days_of_week),
            v.snooze_duration,
            v.tone,
            now,
            now,
        ],
    )
    .map_err(|e| AppError::database("creating reminder", &e))?;
    get_reminder(conn, conn.last_insert_rowid())
}

pub fn get_reminder(conn: &rusqlite::Connection, id: i64) -> AppResult<Reminder> {
    if id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{id}': expected a positive integer"
        )));
    }
    conn.query_row(
        "SELECT * FROM reminders WHERE id = ?1",
        params![id],
        reminder_from_row,
    )
    .optional()
    .map_err(|e| AppError::database("reading reminder", &e))?
    .ok_or_else(|| AppError::not_found("Reminder", id))
}

pub fn list_reminders(
    conn: &rusqlite::Connection,
    filter: &ReminderFilter,
) -> AppResult<Vec<Reminder>> {
    let sql = if filter.enabled_only == Some(true) {
        "SELECT * FROM reminders WHERE enabled = 1 ORDER BY created_at ASC, id ASC"
    } else {
        "SELECT * FROM reminders ORDER BY created_at ASC, id ASC"
    };
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| AppError::database("listing reminders", &e))?;
    let rows = stmt
        .query_map([], reminder_from_row)
        .map_err(|e| AppError::database("listing reminders", &e))?;
    // A row that fails to decode (corrupt stored data) is skipped and logged:
    // it must not hide every other reminder or abort the scheduler tick.
    let mut reminders = Vec::new();
    for row in rows {
        match row {
            Ok(reminder) => reminders.push(reminder),
            Err(e) => log_error(&format!("skipping unreadable reminder row: {e}")),
        }
    }
    Ok(reminders)
}

pub fn update_reminder(
    conn: &rusqlite::Connection,
    input: &UpdateReminderInput,
) -> AppResult<Reminder> {
    if input.id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{}': expected a positive integer",
            input.id
        )));
    }
    let current = get_reminder(conn, input.id)?;
    let merged = input.apply_to(&current)?;
    // A changed schedule invalidates any pending snooze: the snooze belonged
    // to the previous schedule. Content-only edits keep the snooze.
    let schedule_changed = merged.schedule_type != current.schedule_type
        || merged.scheduled_time != current.scheduled_time
        || merged.days_of_week != current.days_of_week;
    let snoozed_until = if schedule_changed {
        None
    } else {
        current.snoozed_until
    };
    let now = now_secs();
    let changed = conn
        .execute(
            "UPDATE reminders SET
                title = ?1, message = ?2, kind = ?3, enabled = ?4,
                schedule_type = ?5, scheduled_time = ?6, days_of_week = ?7,
                snooze_duration = ?8, tone = ?9, updated_at = ?10,
                snoozed_until = ?11
             WHERE id = ?12",
            params![
                merged.title,
                merged.message,
                merged.kind,
                i64::from(merged.enabled),
                merged.schedule_type,
                merged.scheduled_time,
                encode_days(&merged.days_of_week),
                merged.snooze_duration,
                merged.tone,
                now,
                snoozed_until,
                input.id,
            ],
        )
        .map_err(|e| AppError::database("updating reminder", &e))?;
    if changed == 0 {
        return Err(AppError::not_found("Reminder", input.id));
    }
    get_reminder(conn, input.id)
}

pub fn delete_reminder(conn: &rusqlite::Connection, id: i64) -> AppResult<()> {
    if id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{id}': expected a positive integer"
        )));
    }
    let changed = conn
        .execute("DELETE FROM reminders WHERE id = ?1", params![id])
        .map_err(|e| AppError::database("deleting reminder", &e))?;
    if changed == 0 {
        return Err(AppError::not_found("Reminder", id));
    }
    Ok(())
}

pub fn set_reminder_enabled(
    conn: &rusqlite::Connection,
    id: i64,
    enabled: bool,
) -> AppResult<Reminder> {
    if id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{id}': expected a positive integer"
        )));
    }
    // Ensures NOT_FOUND for unknown ids instead of a silent no-op.
    get_reminder(conn, id)?;
    conn.execute(
        "UPDATE reminders SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
        params![i64::from(enabled), now_secs(), id],
    )
    .map_err(|e| AppError::database("toggling reminder", &e))?;
    get_reminder(conn, id)
}

// ---------------------------------------------------------------------------
// Scheduler support (Phase 3)
// ---------------------------------------------------------------------------

/// Sets snooze state: `minutes > 0` snoozes until now + minutes, `0` clears
/// the snooze. Survives restart (persisted column). Rejects unknown ids with
/// `NOT_FOUND` and out-of-range values with validation errors.
pub fn snooze_reminder(conn: &rusqlite::Connection, id: i64, minutes: i64) -> AppResult<Reminder> {
    if id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{id}': expected a positive integer"
        )));
    }
    if !(0..=crate::models::MAX_SNOOZE_MINUTES).contains(&minutes) {
        return Err(AppError::validation(format!(
            "Snooze must be between 0 and {} minutes",
            crate::models::MAX_SNOOZE_MINUTES
        )));
    }
    let current = get_reminder(conn, id)?;
    let until = if minutes == 0 {
        None
    } else {
        Some(now_secs().saturating_add(minutes.saturating_mul(60)))
    };
    // A one-time reminder is auto-disabled when it fires; snoozing it from the
    // popup must bring it back for the snooze (the scheduler only evaluates
    // enabled reminders). Re-disabled when the snooze fires.
    let revive = until.is_some()
        && !current.enabled
        && current.schedule_type == "once"
        && current.last_triggered_at.is_some();
    conn.execute(
        "UPDATE reminders SET snoozed_until = ?1, enabled = CASE WHEN ?4 THEN 1 ELSE enabled END,
                updated_at = ?2 WHERE id = ?3",
        params![until, now_secs(), id, revive],
    )
    .map_err(|e| AppError::database("snoozing reminder", &e))?;
    get_reminder(conn, id)
}

/// Arms a daily/weekly reminder at `now`: marks the latest occurrence that
/// already passed as consumed, so creating, re-timing or re-enabling a
/// reminder never fires an occurrence from before the user's change. Only ever
/// moves `last_triggered_at` forward; one-time reminders are left untouched.
pub fn arm_recurring(
    conn: &rusqlite::Connection,
    id: i64,
    now: chrono::DateTime<chrono::Local>,
) -> AppResult<Reminder> {
    let current = get_reminder(conn, id)?;
    if let Some(occurrence) = crate::scheduler::calculator::latest_occurrence_before(&current, now)
    {
        if current.last_triggered_at < Some(occurrence) {
            conn.execute(
                "UPDATE reminders SET last_triggered_at = ?1 WHERE id = ?2",
                params![occurrence, id],
            )
            .map_err(|e| AppError::database("arming reminder", &e))?;
        }
    }
    get_reminder(conn, id)
}

/// Consumes one scheduled occurrence: records `last_triggered_at`, clears any
/// snooze, and optionally disables (one-time reminders). Called by the engine
/// BEFORE the notification is sent, so a crash or delivery failure can never
/// cause the same occurrence to fire twice.
pub fn mark_fired(
    conn: &rusqlite::Connection,
    id: i64,
    occurrence_epoch: i64,
    disable_after: bool,
) -> AppResult<Reminder> {
    let current = get_reminder(conn, id)?;
    let enabled = current.enabled && !disable_after;
    conn.execute(
        "UPDATE reminders SET last_triggered_at = ?1, enabled = ?2, snoozed_until = NULL,
                updated_at = ?3 WHERE id = ?4",
        params![occurrence_epoch, i64::from(enabled), now_secs(), id],
    )
    .map_err(|e| AppError::database("recording reminder trigger", &e))?;
    get_reminder(conn, id)
}

// ---------------------------------------------------------------------------
// Settings (scalar preferences in the `settings` KV table — no extra plugin,
// single source of truth, testable against the same temp databases)
// ---------------------------------------------------------------------------

fn read_setting(conn: &rusqlite::Connection, key: &str) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| AppError::database("reading setting", &e))
}

fn parse_bool(raw: Option<String>, fallback: bool) -> bool {
    match raw.as_deref().map(str::trim) {
        Some("1") => true,
        Some("0") => false,
        // Corrupt values fall back instead of silently inverting a default
        // (e.g. garbage must never mute notifications by accident).
        _ => fallback,
    }
}

fn parse_int(raw: Option<String>, fallback: i64) -> i64 {
    raw.and_then(|v| v.parse().ok()).unwrap_or(fallback)
}

pub fn get_settings(conn: &rusqlite::Connection) -> AppResult<AppSettings> {
    let defaults = AppSettings::default();
    Ok(AppSettings {
        theme: read_setting(conn, "theme")?.unwrap_or(defaults.theme),
        language: read_setting(conn, "language")?.unwrap_or(defaults.language),
        default_tone: read_setting(conn, "default_tone")?.unwrap_or(defaults.default_tone),
        notifications_enabled: parse_bool(
            read_setting(conn, "notifications_enabled")?,
            defaults.notifications_enabled,
        ),
        autostart_enabled: parse_bool(
            read_setting(conn, "autostart_enabled")?,
            defaults.autostart_enabled,
        ),
        launch_minimized: parse_bool(
            read_setting(conn, "launch_minimized")?,
            defaults.launch_minimized,
        ),
        snooze_duration: parse_int(
            read_setting(conn, "snooze_duration")?,
            defaults.snooze_duration,
        ),
        reduced_motion: parse_bool(
            read_setting(conn, "reduced_motion")?,
            defaults.reduced_motion,
        ),
        companion_avatar: match read_setting(conn, "companion_avatar")? {
            Some(v) if !v.trim().is_empty() => Some(v),
            _ => None,
        },
        popup_duration_secs: parse_int(
            read_setting(conn, "popup_duration_secs")?,
            defaults.popup_duration_secs,
        ),
    })
}

pub fn update_settings(
    conn: &mut rusqlite::Connection,
    settings: &AppSettings,
) -> AppResult<AppSettings> {
    let v = settings.validated()?;
    let now = now_secs();
    // One transaction: a crash mid-save can never leave half the preferences
    // applied (validation already ran, so commit failure is the only risk).
    let tx = conn
        .transaction()
        .map_err(|e| AppError::database("saving settings", &e))?;
    let rows = [
        ("theme", v.theme.clone()),
        ("language", v.language.clone()),
        ("default_tone", v.default_tone.clone()),
        (
            "notifications_enabled",
            i64::from(v.notifications_enabled).to_string(),
        ),
        (
            "autostart_enabled",
            i64::from(v.autostart_enabled).to_string(),
        ),
        (
            "launch_minimized",
            i64::from(v.launch_minimized).to_string(),
        ),
        ("snooze_duration", v.snooze_duration.to_string()),
        ("reduced_motion", i64::from(v.reduced_motion).to_string()),
        ("popup_duration_secs", v.popup_duration_secs.to_string()),
    ];
    for (key, value) in rows {
        tx.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now],
        )
        .map_err(|e| AppError::database("saving setting", &e))?;
    }
    // Optional avatar: present rows hold the data URL, clearing removes the
    // row so reads fall back to None (built-in Pip).
    match &v.companion_avatar {
        Some(avatar) => {
            tx.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES ('companion_avatar', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![avatar, now],
            )
            .map_err(|e| AppError::database("saving setting", &e))?;
        }
        None => {
            tx.execute("DELETE FROM settings WHERE key = 'companion_avatar'", [])
                .map_err(|e| AppError::database("saving setting", &e))?;
        }
    }
    tx.commit()
        .map_err(|e| AppError::database("saving settings", &e))?;
    get_settings(conn)
}

/// Persists one scalar preference without validating or touching the others.
/// Used by `set_autostart`: the toggle must never fail (or half-apply)
/// because of an unrelated stored value.
pub fn set_autostart_enabled(conn: &rusqlite::Connection, enabled: bool) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('autostart_enabled', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![i64::from(enabled).to_string(), now_secs()],
    )
    .map_err(|e| AppError::database("saving autostart preference", &e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Scheduler pause state (Phase 4): persisted preference, not a new table.
// ---------------------------------------------------------------------------

const PAUSED_KEY: &str = "reminders_paused";

pub fn get_paused(conn: &rusqlite::Connection) -> AppResult<bool> {
    Ok(parse_bool(read_setting(conn, PAUSED_KEY)?, false))
}

pub fn set_paused(conn: &rusqlite::Connection, paused: bool) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![PAUSED_KEY, i64::from(paused).to_string(), now_secs()],
    )
    .map_err(|e| AppError::database("saving pause state", &e))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// State-backed helpers used by Tauri commands
// ---------------------------------------------------------------------------

pub fn with_state<T>(
    state: &DbState,
    op: impl FnOnce(&rusqlite::Connection) -> AppResult<T>,
) -> AppResult<T> {
    let guard = state.lock()?;
    op(&guard)
}

/// Mutable variant for operations needing a transaction. Same mutex, so all
/// command and scheduler access stays serialized.
pub fn with_state_mut<T>(
    state: &DbState,
    op: impl FnOnce(&mut rusqlite::Connection) -> AppResult<T>,
) -> AppResult<T> {
    let mut guard = state.lock()?;
    op(&mut guard)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");
        conn
    }

    fn temp_db_path() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!("papa-app-test-{}-{}.db", std::process::id(), n))
    }

    fn sample_input() -> CreateReminderInput {
        CreateReminderInput {
            title: "Drink water".to_string(),
            message: Some("2 glasses".to_string()),
            kind: "reminder".to_string(),
            enabled: true,
            schedule_type: "daily".to_string(),
            scheduled_time: "10:00".to_string(),
            days_of_week: None,
            snooze_duration: 5,
            tone: None,
        }
    }

    #[test]
    fn migration_runs_and_is_idempotent() {
        let conn = memory_db();
        assert_eq!(schema_version(&conn).expect("version"), 2);
        run_migrations(&conn).expect("second run must be a no-op");
        assert_eq!(schema_version(&conn).expect("version"), 2);
        for table in ["reminders", "settings", "schema_migrations"] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    params![table],
                    |row| row.get(0),
                )
                .expect("table check");
            assert_eq!(exists, 1, "table {table} must exist");
        }
    }

    #[test]
    fn reminder_crud_round_trip() {
        let conn = memory_db();
        let created = create_reminder(&conn, &sample_input()).expect("create");
        assert_eq!(created.title, "Drink water");
        assert!(created.enabled);

        let fetched = get_reminder(&conn, created.id).expect("get");
        assert_eq!(fetched, created);

        let list = list_reminders(&conn, &ReminderFilter::default()).expect("list");
        assert_eq!(list.len(), 1);

        let updated = update_reminder(
            &conn,
            &UpdateReminderInput {
                id: created.id,
                title: Some("Drink more water".to_string()),
                message: None,
                kind: None,
                enabled: None,
                schedule_type: None,
                scheduled_time: None,
                days_of_week: None,
                snooze_duration: None,
                tone: None,
            },
        )
        .expect("update");
        assert_eq!(updated.title, "Drink more water");
        assert_eq!(updated.message, Some("2 glasses".to_string()));

        let toggled = set_reminder_enabled(&conn, created.id, false).expect("disable");
        assert!(!toggled.enabled);
        let enabled_only = list_reminders(
            &conn,
            &ReminderFilter {
                enabled_only: Some(true),
            },
        )
        .expect("filtered list");
        assert!(enabled_only.is_empty());

        delete_reminder(&conn, created.id).expect("delete");
        let err = get_reminder(&conn, created.id).expect_err("must be gone");
        assert_eq!(err, AppError::not_found("Reminder", created.id));
    }

    #[test]
    fn snooze_and_mark_fired() {
        let conn = memory_db();
        let created = create_reminder(&conn, &sample_input()).expect("create");
        assert_eq!(created.snoozed_until, None);

        let snoozed = snooze_reminder(&conn, created.id, 10).expect("snooze");
        let until = snoozed.snoozed_until.expect("snoozed_until set");
        assert!(until > now_secs());

        // Snooze survives a reopen (persisted column, not a timer).
        let reloaded = get_reminder(&conn, created.id).expect("reload");
        assert_eq!(reloaded.snoozed_until, Some(until));

        let fired = mark_fired(&conn, created.id, until, false).expect("mark");
        assert_eq!(fired.last_triggered_at, Some(until));
        assert_eq!(fired.snoozed_until, None);
        assert!(fired.enabled);

        let once_fired = mark_fired(&conn, created.id, until, true).expect("mark once");
        assert!(!once_fired.enabled);

        snooze_reminder(&conn, created.id, 0).expect("clear");
        assert_eq!(
            get_reminder(&conn, created.id).expect("get").snoozed_until,
            None
        );
        assert!(snooze_reminder(&conn, created.id, 9999).is_err());
        assert!(snooze_reminder(&conn, 9999, 5).is_err());
    }

    #[test]
    fn schedule_change_clears_snooze() {
        let conn = memory_db();
        let created = create_reminder(&conn, &sample_input()).expect("create");
        snooze_reminder(&conn, created.id, 10).expect("snooze");

        // Content-only edit keeps the snooze.
        let renamed = update_reminder(
            &conn,
            &UpdateReminderInput {
                id: created.id,
                title: Some("Renamed".to_string()),
                message: None,
                kind: None,
                enabled: None,
                schedule_type: None,
                scheduled_time: None,
                days_of_week: None,
                snooze_duration: None,
                tone: None,
            },
        )
        .expect("rename");
        assert!(renamed.snoozed_until.is_some());

        // Schedule edit invalidates the snooze.
        let rescheduled = update_reminder(
            &conn,
            &UpdateReminderInput {
                id: created.id,
                title: None,
                message: None,
                kind: None,
                enabled: None,
                schedule_type: None,
                scheduled_time: Some("11:00".to_string()),
                days_of_week: None,
                snooze_duration: None,
                tone: None,
            },
        )
        .expect("reschedule");
        assert_eq!(rescheduled.snoozed_until, None);
    }

    #[test]
    fn validation_and_not_found() {
        let conn = memory_db();
        let bad = CreateReminderInput {
            title: String::new(),
            ..sample_input()
        };
        assert!(create_reminder(&conn, &bad).is_err());

        let bad_schedule = CreateReminderInput {
            schedule_type: "minutely".to_string(),
            ..sample_input()
        };
        assert!(create_reminder(&conn, &bad_schedule).is_err());

        assert_eq!(
            get_reminder(&conn, 9999).expect_err("missing"),
            AppError::not_found("Reminder", 9999)
        );
        assert!(get_reminder(&conn, -3).is_err());
        assert!(delete_reminder(&conn, 9999).is_err());
    }

    #[test]
    fn pause_state_defaults_and_persists() {
        let path = temp_db_path();
        let conn = open_or_create(&path).expect("open");
        assert!(!get_paused(&conn).expect("default false"));
        set_paused(&conn, true).expect("persist");
        assert!(get_paused(&conn).expect("true"));
        drop(conn);
        let reopened = open_or_create(&path).expect("reopen");
        assert!(get_paused(&reopened).expect("survives restart"));
        set_paused(&reopened, false).expect("clear");
        assert!(!get_paused(&reopened).expect("false"));
        drop(reopened);
        std::fs::remove_file(&path).ok();
        for suffix in ["-wal", "-shm", "-journal"] {
            let mut sib = path.as_os_str().to_owned();
            sib.push(suffix);
            std::fs::remove_file(Path::new(&sib)).ok();
        }
    }

    #[test]
    fn settings_persist_across_reopen() {
        let path = temp_db_path();
        {
            let mut conn = open_or_create(&path).expect("open");
            assert_eq!(
                get_settings(&conn).expect("defaults"),
                AppSettings::default()
            );
            let mut next = AppSettings::default();
            next.theme = "dark".to_string();
            next.snooze_duration = 10;
            next.popup_duration_secs = 30;
            next.notifications_enabled = false;
            let saved = update_settings(&mut conn, &next).expect("update");
            assert_eq!(saved.theme, "dark");
            assert_eq!(saved.snooze_duration, 10);
            assert_eq!(saved.popup_duration_secs, 30);
        }
        {
            let conn = open_or_create(&path).expect("reopen");
            let reloaded = get_settings(&conn).expect("reload");
            assert_eq!(reloaded.theme, "dark");
            assert_eq!(reloaded.snooze_duration, 10);
            assert_eq!(reloaded.popup_duration_secs, 30);
            assert!(!reloaded.notifications_enabled);
        }
        std::fs::remove_file(&path).ok();
        for suffix in ["-wal", "-shm", "-journal"] {
            let mut sib = path.as_os_str().to_owned();
            sib.push(suffix);
            std::fs::remove_file(Path::new(&sib)).ok();
        }
    }

    #[test]
    fn invalid_settings_update_writes_nothing() {
        let mut conn = memory_db();
        let before = get_settings(&conn).expect("defaults");
        let mut bad = AppSettings::default();
        bad.theme = "neon".to_string();
        assert!(update_settings(&mut conn, &bad).is_err());
        // Validation runs before any write: the stored row set is untouched.
        assert_eq!(get_settings(&conn).expect("unchanged"), before);
    }

    #[test]
    fn companion_avatar_round_trip_and_validation() {
        let mut conn = memory_db();
        assert_eq!(
            get_settings(&conn).expect("defaults").companion_avatar,
            None
        );

        // Rejects non-image payloads and oversized ones before any write.
        for bad in [
            Some("not-a-data-url".to_string()),
            Some("data:text/plain,hello".to_string()),
            Some(format!("data:image/png;base64,{}", "A".repeat(600_000))),
        ] {
            let mut settings = AppSettings::default();
            settings.companion_avatar = bad;
            assert!(update_settings(&mut conn, &settings).is_err());
        }
        assert_eq!(
            get_settings(&conn).expect("untouched").companion_avatar,
            None
        );

        // Accepts a real data URL and clears back to None (row removed).
        let mut settings = AppSettings::default();
        settings.companion_avatar = Some("data:image/png;base64,iVBOR".to_string());
        let saved = update_settings(&mut conn, &settings).expect("save avatar");
        assert_eq!(
            saved.companion_avatar,
            Some("data:image/png;base64,iVBOR".to_string())
        );
        let cleared = update_settings(&mut conn, &AppSettings::default()).expect("clear");
        assert_eq!(cleared.companion_avatar, None);
    }

    #[test]
    fn autostart_toggle_ignores_unrelated_corrupt_settings() {
        // The toggle must persist exactly what the system applied even when
        // another stored preference fails full-settings validation.
        let conn = memory_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('theme', 'neon', 0)",
            [],
        )
        .expect("seed corrupt theme");
        set_autostart_enabled(&conn, true).expect("toggle on");
        assert!(get_settings(&conn).expect("read").autostart_enabled);
        // The unrelated corrupt value is left untouched, nothing else changes.
        assert_eq!(get_settings(&conn).expect("read").theme, "neon");
        set_autostart_enabled(&conn, false).expect("toggle off");
        assert!(!get_settings(&conn).expect("read").autostart_enabled);
    }

    #[test]
    fn migration_002_adds_snooze_column() {
        let conn = memory_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('reminders') WHERE name = 'snoozed_until'",
                [],
                |row| row.get(0),
            )
            .expect("pragma query");
        assert_eq!(count, 1);
    }

    #[test]
    fn corrupt_settings_fall_back_to_defaults() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES
             ('snooze_duration', 'not-a-number', 0),
             ('notifications_enabled', 'maybe', 0),
             ('theme', 'neon', 0)",
            [],
        )
        .expect("seed corrupt rows");
        let settings = get_settings(&conn).expect("reads with fallbacks");
        let defaults = AppSettings::default();
        assert_eq!(settings.snooze_duration, defaults.snooze_duration);
        assert_eq!(
            settings.notifications_enabled,
            defaults.notifications_enabled
        );
        // Unknown scalar values pass through (frontend normalizes display);
        // only typed parsing falls back.
        assert_eq!(settings.theme, "neon");
    }
}
