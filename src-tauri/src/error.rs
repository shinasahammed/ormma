//! Application-level error model (Phase 2).
//!
//! The frontend receives `{ code, message }` — never SQL text, filesystem
//! paths, or other internals. Diagnostics go to stderr via [`log_error`].

use serde::Serialize;

/// Stable error codes consumed by `src/lib/platform.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    DatabaseError,
    ValidationError,
    NotFound,
    InvalidReminder,
    InternalError,
}

/// Error returned from every Tauri command in Phase 2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::ValidationError,
            message: message.into(),
        }
    }

    pub fn not_found(entity: &str, id: i64) -> Self {
        Self {
            code: ErrorCode::NotFound,
            message: format!("{entity} with id {id} was not found"),
        }
    }

    pub fn invalid_reminder(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::InvalidReminder,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::InternalError,
            message: message.into(),
        }
    }

    /// Maps a `rusqlite` failure to a frontend-safe error while keeping the
    /// diagnostic on stderr. The SQL statement itself is never exposed.
    pub fn database(context: &str, source: &rusqlite::Error) -> Self {
        log_error(&format!("database error during {context}: {source}"));
        Self {
            code: ErrorCode::DatabaseError,
            message: format!("A database error occurred during {context}"),
        }
    }

    pub fn internal_error(context: &str, detail: impl std::fmt::Display) -> Self {
        log_error(&format!("internal error during {context}: {detail}"));
        Self::internal(format!("An internal error occurred during {context}"))
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{:?}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

/// stderr diagnostics for the Rust side (safe: never forwarded to the UI).
pub fn log_error(detail: &str) {
    eprintln!("[ormma] ERROR: {detail}");
}

/// Non-error lifecycle logging. Only for infrequent events (startup, ticks
/// with activity, maintenance) — never per-reminder tick spam, and never
/// user content.
pub fn log_info(detail: &str) {
    eprintln!("[ormma] INFO: {detail}");
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    /// The exact wire shape the frontend parses: `{ code, message }` with
    /// SCREAMING codes. Guards the command boundary against renames.
    #[test]
    fn wire_shape_survives_serialization() {
        let json = serde_json::to_value(AppError::not_found("Reminder", 7)).expect("serializes");
        assert_eq!(json["code"], "NOT_FOUND");
        assert_eq!(json["message"], "Reminder with id 7 was not found");
        let json = serde_json::to_value(AppError::validation("bad input")).expect("serializes");
        assert_eq!(json["code"], "VALIDATION_ERROR");
    }

    /// Internal details never reach the message field.
    #[test]
    fn messages_hide_internals() {
        let err = AppError::database("reading reminder", &rusqlite::Error::InvalidColumnIndex(3));
        assert_eq!(err.code, ErrorCode::DatabaseError);
        assert!(!err.message.contains("SELECT"));
        assert!(!err.message.contains("column"));
        let err = AppError::internal_error("saving setting", "/home/user/.local/share/secret.db");
        assert!(!err.message.contains("/home"));
    }
}
