//! Typed Tauri commands (Phases 2–3).
//!
//! Every command delegates to the pure functions in `crate::db` so the logic
//! stays testable without a Tauri runtime. Commands only validate transport
//! concerns (ids) and map state-locking into [`AppError`]. No `unwrap` or
//! `expect` on runtime-dependent paths.
//!
//! Platform integration commands (windows, tray actions, autostart,
//! pause/resume) live in [`platform`].

pub mod platform;

use tauri::State;

use crate::db::{self, with_state, with_state_mut, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{
    AppSettings, CreateReminderInput, Reminder, ReminderFilter, UpdateReminderInput,
};

fn check_id(id: i64) -> AppResult<()> {
    if id <= 0 {
        return Err(AppError::validation(format!(
            "Invalid reminder id '{id}': expected a positive integer"
        )));
    }
    Ok(())
}

#[tauri::command]
pub fn get_reminders(
    state: State<'_, DbState>,
    filter: Option<ReminderFilter>,
) -> AppResult<Vec<Reminder>> {
    let filter = filter.unwrap_or_default();
    with_state(&state, |conn| db::list_reminders(conn, &filter))
}

#[tauri::command]
pub fn get_reminder(state: State<'_, DbState>, id: i64) -> AppResult<Reminder> {
    check_id(id)?;
    with_state(&state, |conn| db::get_reminder(conn, id))
}

#[tauri::command]
pub fn create_reminder(
    state: State<'_, DbState>,
    input: CreateReminderInput,
) -> AppResult<Reminder> {
    // Full field validation happens in `db::create_reminder`.
    with_state(&state, |conn| {
        let created = db::create_reminder(conn, &input)?;
        db::arm_recurring(conn, created.id, chrono::Local::now())
    })
}

#[tauri::command]
pub fn update_reminder(
    state: State<'_, DbState>,
    input: UpdateReminderInput,
) -> AppResult<Reminder> {
    check_id(input.id)?;
    with_state(&state, |conn| {
        let before = db::get_reminder(conn, input.id)?;
        let updated = db::update_reminder(conn, &input)?;
        let rescheduled = updated.schedule_type != before.schedule_type
            || updated.scheduled_time != before.scheduled_time
            || updated.days_of_week != before.days_of_week;
        if rescheduled || (updated.enabled && !before.enabled) {
            db::arm_recurring(conn, updated.id, chrono::Local::now())
        } else {
            Ok(updated)
        }
    })
}

#[tauri::command]
pub fn delete_reminder(state: State<'_, DbState>, id: i64) -> AppResult<()> {
    check_id(id)?;
    with_state(&state, |conn| db::delete_reminder(conn, id))
}

#[tauri::command]
pub fn set_reminder_enabled(
    state: State<'_, DbState>,
    id: i64,
    enabled: bool,
) -> AppResult<Reminder> {
    check_id(id)?;
    with_state(&state, |conn| {
        let updated = db::set_reminder_enabled(conn, id, enabled)?;
        if enabled {
            db::arm_recurring(conn, id, chrono::Local::now())
        } else {
            Ok(updated)
        }
    })
}

#[tauri::command]
pub fn get_settings(state: State<'_, DbState>) -> AppResult<AppSettings> {
    with_state(&state, |conn| db::get_settings(conn))
}

#[tauri::command]
pub fn update_settings(state: State<'_, DbState>, settings: AppSettings) -> AppResult<AppSettings> {
    // Field validation happens in `db::update_settings`.
    with_state_mut(&state, |conn| db::update_settings(conn, &settings))
}

/// Dev/verify helper: presents a fixed-content reminder in the top-center
/// popup (the same path a fired reminder takes), plus the desktop
/// notification as a best-effort extra. Touches no reminder state and never
/// triggers scheduling side effects.
#[tauri::command]
pub fn trigger_reminder_test(app: tauri::AppHandle) -> AppResult<()> {
    crate::scheduler::engine::runtime::show_test_popup(&app);
    if let Err(e) = crate::notifications::notify_test(&app) {
        crate::error::log_error(&format!("test desktop notification failed: {e}"));
    }
    Ok(())
}

/// Re-exported for a single `generate_handler!` call site in `lib.rs`.
pub use db::init_app_db;
