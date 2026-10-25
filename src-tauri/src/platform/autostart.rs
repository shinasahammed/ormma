//! Linux autostart via `tauri-plugin-autostart` (Phase 4).
//!
//! Manages the user's `.desktop` autostart entry through the plugin — never
//! by hand-editing files. Never enabled without consent: only the explicit
//! settings toggle (or a previously stored preference) changes state, and
//! enable/disable are idempotent so duplicate entries cannot accumulate.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::error::{log_error, AppError, AppResult};

fn autostart_err(context: &str, error: tauri_plugin_autostart::Error) -> AppError {
    AppError::internal_error(context, error.to_string())
}

/// Applies the desired state idempotently and returns the actual state.
pub fn set_enabled(app: &AppHandle, enabled: bool) -> AppResult<bool> {
    let manager = app.autolaunch();
    if enabled {
        manager
            .enable()
            .map_err(|e| autostart_err("enabling autostart", e))?;
    } else {
        manager
            .disable()
            .map_err(|e| autostart_err("disabling autostart", e))?;
    }
    manager
        .is_enabled()
        .map_err(|e| autostart_err("reading autostart state", e))
}

/// Startup reconciliation: makes the real entry match the stored preference.
/// Best-effort — failures are logged and never block startup or scheduling.
pub fn apply_preferred(app: &AppHandle, preferred: bool) {
    match set_enabled(app, preferred) {
        Ok(actual) if actual == preferred => {}
        Ok(actual) => log_error(&format!(
            "autostart preference {preferred} not reflected (actual: {actual})"
        )),
        Err(e) => log_error(&format!("autostart startup sync failed: {e}")),
    }
}
