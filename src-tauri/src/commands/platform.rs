//! Platform integration commands (Phase 4).
//!
//! Thin transport over `platform/*` and the scheduler pause flag. `pause_impl`
//! / `resume_impl` are shared with the tray menu so both paths behave
//! identically. No Linux specifics leak into the signatures.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::{self, with_state, DbState};
use crate::error::{AppError, AppResult};
use crate::platform::{self, PlatformInfo};
use crate::scheduler::engine::{self, runtime};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub paused: bool,
    pub scheduler_running: bool,
}

fn status() -> AppStatus {
    AppStatus {
        paused: engine::is_paused(),
        scheduler_running: runtime::is_running(),
    }
}

fn emit_status(app: &AppHandle, event: &str) -> AppResult<()> {
    app.emit(event, status())
        .map_err(|e| AppError::internal_error("emitting status event", e.to_string()))
}

pub(crate) fn pause_impl(app: &AppHandle) -> AppResult<AppStatus> {
    if let Some(state) = app.try_state::<DbState>() {
        with_state(&state, |conn| db::set_paused(conn, true))?;
    }
    engine::set_paused(true);
    emit_status(app, "reminders-paused")?;
    Ok(status())
}

pub(crate) fn resume_impl(app: &AppHandle) -> AppResult<AppStatus> {
    if let Some(state) = app.try_state::<DbState>() {
        with_state(&state, |conn| db::set_paused(conn, false))?;
    }
    engine::set_paused(false);
    emit_status(app, "reminders-resumed")?;
    // Catch-up pass: occurrences due within policy fire immediately.
    runtime::production_tick(app);
    Ok(status())
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    platform::detect()
}

#[tauri::command]
pub fn get_app_status() -> AppStatus {
    status()
}

#[tauri::command]
pub fn pause_reminders(app: AppHandle) -> AppResult<AppStatus> {
    pause_impl(&app)
}

#[tauri::command]
pub fn resume_reminders(app: AppHandle) -> AppResult<AppStatus> {
    resume_impl(&app)
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) -> AppResult<()> {
    platform::windows::show_main(&app)
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) -> AppResult<()> {
    platform::windows::hide_main(&app)
}

#[tauri::command]
pub fn show_reminder_window(app: AppHandle, position: Option<String>) -> AppResult<()> {
    platform::windows::show_popup(&app, position)
}

#[tauri::command]
pub fn hide_reminder_window(app: AppHandle) -> AppResult<()> {
    platform::windows::hide_popup(&app)
}

#[tauri::command]
pub fn set_reminder_position(app: AppHandle, position: String) -> AppResult<()> {
    platform::windows::set_popup_position(&app, &position)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, state: State<'_, DbState>, enabled: bool) -> AppResult<bool> {
    let actual = platform::autostart::set_enabled(&app, enabled)?;
    // Single-key write: the toggle persists exactly what the system applied,
    // even if other stored preferences are stale or corrupt.
    with_state(&state, |conn| db::set_autostart_enabled(conn, actual))?;
    Ok(actual)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    // Explicit quit terminates the process; the scheduler thread dies with it.
    app.exit(0);
}
