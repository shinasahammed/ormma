//! Desktop notification service (Phase 3).
//!
//! Sole owner of `tauri-plugin-notification` usage. The scheduler calls
//! `notify()` with a decided reminder and never touches the plugin API or
//! Linux notification internals itself.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::error::{AppError, AppResult};
use crate::models::Reminder;

fn fallback_body(reminder: &Reminder) -> String {
    match reminder.schedule_type.as_str() {
        "daily" => format!("Every day at {}", reminder.scheduled_time),
        "weekly" => format!("Weekly at {}", reminder.scheduled_time),
        _ => format!("Scheduled for {}", reminder.scheduled_time),
    }
}

/// Shows one reminder notification. Delivery is best-effort: the scheduler
/// marks the occurrence consumed before calling, so a missing notification
/// daemon can never cause a duplicate fire — the failure is only logged.
pub fn notify(app: &AppHandle, reminder: &Reminder) -> AppResult<()> {
    let body = reminder
        .message
        .clone()
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| fallback_body(reminder));
    app.notification()
        .builder()
        .title(reminder.title.clone())
        .body(body)
        .show()
        .map_err(|e| {
            AppError::internal_error(
                "sending notification",
                format!(
                    "reminder id {}: notification backend failed: {e}",
                    reminder.id
                ),
            )
        })
}

/// Fixed-content delivery check for the `trigger_reminder_test` command.
/// Touches no reminder state; purely verifies the plugin -> desktop path.
pub fn notify_test(app: &AppHandle) -> AppResult<()> {
    app.notification()
        .builder()
        .title("Ormma test notification")
        .body("The reminder engine notification path works.")
        .show()
        .map_err(|e| {
            AppError::internal_error(
                "sending test notification",
                format!("notification backend failed: {e}"),
            )
        })
}
