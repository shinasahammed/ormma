//! Strongly typed domain models (Phase 2).
//!
//! Layering: `SQLite row -> domain model -> Tauri command response`.
//! Raw rows never cross the command boundary. JSON uses `camelCase` to stay
//! aligned with the TypeScript models in `src/features/reminders/types.ts`.
//!
//! Note: the spec's `type` column is named `kind` end-to-end (Rust field, JSON
//! key, SQLite column) to avoid reserved-word friction in Rust/TS/SQL.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

pub const REMINDER_KINDS: &[&str] = &["reminder", "alarm"];
pub const SCHEDULE_TYPES: &[&str] = &["once", "daily", "weekly"];

pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_MESSAGE_LEN: usize = 2000;
pub const MAX_TONE_LEN: usize = 100;
pub const MAX_SNOOZE_MINUTES: i64 = 180;
/// Upper bound on a custom companion avatar (`data:image/...` URL, already
/// downscaled client-side to at most 256px). Defensive only.
pub const MAX_AVATAR_DATA_LEN: usize = 500_000;
/// Popup on-screen lifetime bounds (seconds). Shorter is unusable, longer
/// defeats the transient-bubble purpose.
pub const MIN_POPUP_SECS: i64 = 5;
pub const MAX_POPUP_SECS: i64 = 600;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: i64,
    pub title: String,
    pub message: Option<String>,
    pub kind: String,
    pub enabled: bool,
    pub schedule_type: String,
    pub scheduled_time: String,
    /// Sorted, deduplicated weekday numbers (`0` = Sunday .. `6` = Saturday).
    /// `None` unless `schedule_type == "weekly"`.
    pub days_of_week: Option<Vec<u8>>,
    /// Snooze length in minutes.
    pub snooze_duration: i64,
    /// Tone identifier, `None` = default tone.
    pub tone: Option<String>,
    /// Unix epoch seconds.
    pub created_at: i64,
    pub updated_at: i64,
    pub last_triggered_at: Option<i64>,
    /// Snooze state (Phase 3): epoch seconds when the snooze elapses and the
    /// reminder becomes due again. `None` = not snoozed. Persisted so snooze
    /// survives application restart.
    pub snoozed_until: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReminderInput {
    pub title: String,
    pub message: Option<String>,
    pub kind: String,
    pub enabled: bool,
    pub schedule_type: String,
    pub scheduled_time: String,
    pub days_of_week: Option<Vec<u8>>,
    pub snooze_duration: i64,
    pub tone: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReminderInput {
    pub id: i64,
    /// `None` = leave unchanged. Empty/whitespace-only titles are rejected.
    pub title: Option<String>,
    /// `None` = leave unchanged. `Some("")` clears the message to `NULL`.
    pub message: Option<String>,
    pub kind: Option<String>,
    pub enabled: Option<bool>,
    pub schedule_type: Option<String>,
    pub scheduled_time: Option<String>,
    /// `None` = leave unchanged. `Some([])` clears to `NULL`.
    pub days_of_week: Option<Vec<u8>>,
    pub snooze_duration: Option<i64>,
    /// `None` = leave unchanged. `Some("")` clears the tone to `NULL`.
    pub tone: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderFilter {
    pub enabled_only: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub language: String,
    pub default_tone: String,
    pub notifications_enabled: bool,
    pub autostart_enabled: bool,
    pub launch_minimized: bool,
    pub snooze_duration: i64,
    pub reduced_motion: bool,
    /// Custom companion image (`data:image/...` URL, resized client-side) or
    /// `None` for the built-in Pip. Display-only; never affects scheduling.
    pub companion_avatar: Option<String>,
    /// Popup on-screen lifetime in seconds (auto-dismiss).
    pub popup_duration_secs: i64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            language: "en".to_string(),
            default_tone: "default".to_string(),
            notifications_enabled: true,
            autostart_enabled: false,
            launch_minimized: false,
            snooze_duration: 5,
            reduced_motion: false,
            companion_avatar: None,
            popup_duration_secs: 10,
        }
    }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn validate_title(title: &str) -> AppResult<String> {
    let trimmed = title.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::validation("Title must not be empty"));
    }
    if trimmed.chars().count() > MAX_TITLE_LEN {
        return Err(AppError::validation(format!(
            "Title must be at most {MAX_TITLE_LEN} characters"
        )));
    }
    Ok(trimmed)
}

fn validate_message(message: &Option<String>) -> AppResult<Option<String>> {
    match message {
        None => Ok(None),
        Some(text) => {
            if text.chars().count() > MAX_MESSAGE_LEN {
                return Err(AppError::validation(format!(
                    "Message must be at most {MAX_MESSAGE_LEN} characters"
                )));
            }
            let trimmed = text.trim();
            Ok(if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            })
        }
    }
}

fn validate_kind(kind: &str) -> AppResult<String> {
    if REMINDER_KINDS.contains(&kind) {
        Ok(kind.to_string())
    } else {
        Err(AppError::invalid_reminder(format!(
            "Unknown reminder kind '{kind}': expected one of {REMINDER_KINDS:?}"
        )))
    }
}

fn validate_schedule_type(schedule_type: &str) -> AppResult<String> {
    if SCHEDULE_TYPES.contains(&schedule_type) {
        Ok(schedule_type.to_string())
    } else {
        Err(AppError::invalid_reminder(format!(
            "Unknown schedule type '{schedule_type}': expected one of {SCHEDULE_TYPES:?}"
        )))
    }
}

fn is_valid_hhmm(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    if !bytes
        .iter()
        .enumerate()
        .all(|(i, b)| i == 2 || b.is_ascii_digit())
    {
        return false;
    }
    let hour: u32 = value[0..2].parse().unwrap_or(99);
    let minute: u32 = value[3..5].parse().unwrap_or(99);
    hour < 24 && minute < 60
}

fn is_valid_datetime_local(value: &str) -> bool {
    // Strict `YYYY-MM-DDTHH:MM` shape with range-checked fields.
    let bytes = value.as_bytes();
    if bytes.len() != 16 || bytes[10] != b'T' {
        return false;
    }
    let digit = |ranges: &[std::ops::Range<usize>]| {
        ranges
            .iter()
            .flat_map(|r| r.clone())
            .all(|i| bytes[i].is_ascii_digit())
    };
    if bytes[4] != b'-' || bytes[7] != b'-' || bytes[13] != b':' {
        return false;
    }
    if !digit(&[0..4, 5..7, 8..10, 11..13, 14..16]) {
        return false;
    }
    // Real calendar check: rejects e.g. Feb 31, which would never fire.
    chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").is_ok()
}

fn validate_scheduled_time(schedule_type: &str, scheduled_time: &str) -> AppResult<String> {
    let valid = match schedule_type {
        "once" => is_valid_datetime_local(scheduled_time),
        "daily" | "weekly" => is_valid_hhmm(scheduled_time),
        other => {
            return Err(AppError::invalid_reminder(format!(
                "Unknown schedule type '{other}'"
            )));
        }
    };
    if !valid {
        let expected = if schedule_type == "once" {
            "YYYY-MM-DDTHH:MM"
        } else {
            "HH:MM (24-hour)"
        };
        return Err(AppError::invalid_reminder(format!(
            "Invalid scheduled time '{scheduled_time}' for '{schedule_type}' reminders: expected {expected}"
        )));
    }
    Ok(scheduled_time.to_string())
}

/// Normalizes to sorted, deduplicated weekdays. `None`/empty clears to `NULL`.
fn validate_days_of_week(
    schedule_type: &str,
    days: &Option<Vec<u8>>,
) -> AppResult<Option<Vec<u8>>> {
    match (schedule_type, days) {
        ("weekly", None) => Err(AppError::invalid_reminder(
            "Weekly reminders require at least one day of the week",
        )),
        ("weekly", Some(v)) if v.is_empty() => Err(AppError::invalid_reminder(
            "Weekly reminders require at least one day of the week",
        )),
        ("weekly", Some(v)) => {
            if v.iter().any(|d| *d > 6) {
                return Err(AppError::invalid_reminder(
                    "Days of the week must be numbers 0 (Sunday) through 6 (Saturday)",
                ));
            }
            let mut normalized = v.clone();
            normalized.sort_unstable();
            normalized.dedup();
            Ok(Some(normalized))
        }
        (_, None) => Ok(None),
        (_, Some(v)) if v.is_empty() => Ok(None),
        (_, Some(_)) => Err(AppError::invalid_reminder(format!(
            "Days of the week are only valid for 'weekly' reminders, not '{schedule_type}'"
        ))),
    }
}

fn validate_snooze(value: i64) -> AppResult<i64> {
    if (0..=MAX_SNOOZE_MINUTES).contains(&value) {
        Ok(value)
    } else {
        Err(AppError::validation(format!(
            "Snooze duration must be between 0 and {MAX_SNOOZE_MINUTES} minutes"
        )))
    }
}

fn validate_tone(tone: &Option<String>) -> AppResult<Option<String>> {
    match tone {
        None => Ok(None),
        Some(t) => {
            let trimmed = t.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if trimmed.chars().count() > MAX_TONE_LEN {
                return Err(AppError::validation(format!(
                    "Tone identifier must be at most {MAX_TONE_LEN} characters"
                )));
            }
            Ok(Some(trimmed.to_string()))
        }
    }
}

impl CreateReminderInput {
    /// Validates and normalizes all fields (trimming, weekday sorting).
    pub fn validated(&self) -> AppResult<CreateReminderInput> {
        let schedule_type = validate_schedule_type(&self.schedule_type)?;
        Ok(CreateReminderInput {
            title: validate_title(&self.title)?,
            message: validate_message(&self.message)?,
            kind: validate_kind(&self.kind)?,
            enabled: self.enabled,
            scheduled_time: validate_scheduled_time(&schedule_type, &self.scheduled_time)?,
            days_of_week: validate_days_of_week(&schedule_type, &self.days_of_week)?,
            snooze_duration: validate_snooze(self.snooze_duration)?,
            tone: validate_tone(&self.tone)?,
            schedule_type,
        })
    }
}

impl UpdateReminderInput {
    /// Merges the patch onto the stored reminder, then validates the result
    /// so cross-field rules (e.g. weekly requires days) always hold.
    pub fn apply_to(&self, current: &Reminder) -> AppResult<CreateReminderInput> {
        Ok(CreateReminderInput {
            title: self.title.clone().unwrap_or_else(|| current.title.clone()),
            message: self.message.clone().or_else(|| current.message.clone()),
            kind: self.kind.clone().unwrap_or_else(|| current.kind.clone()),
            enabled: self.enabled.unwrap_or(current.enabled),
            schedule_type: self
                .schedule_type
                .clone()
                .unwrap_or_else(|| current.schedule_type.clone()),
            scheduled_time: self
                .scheduled_time
                .clone()
                .unwrap_or_else(|| current.scheduled_time.clone()),
            days_of_week: self
                .days_of_week
                .clone()
                .or_else(|| current.days_of_week.clone()),
            snooze_duration: self.snooze_duration.unwrap_or(current.snooze_duration),
            tone: self.tone.clone().or_else(|| current.tone.clone()),
        }
        .validated()?)
    }
}

impl AppSettings {
    pub fn validated(&self) -> AppResult<AppSettings> {
        if !["light", "dark", "system"].contains(&self.theme.as_str()) {
            return Err(AppError::validation(
                "Theme must be 'light', 'dark' or 'system'",
            ));
        }
        if self.language.trim().is_empty() || self.language.chars().count() > 16 {
            return Err(AppError::validation(
                "Language must be a non-empty code of at most 16 characters",
            ));
        }
        if self.default_tone.trim().is_empty() || self.default_tone.chars().count() > MAX_TONE_LEN {
            return Err(AppError::validation(
                "Default tone must be a non-empty identifier",
            ));
        }
        validate_snooze(self.snooze_duration)?;
        if !(MIN_POPUP_SECS..=MAX_POPUP_SECS).contains(&self.popup_duration_secs) {
            return Err(AppError::validation(format!(
                "Popup duration must be between {MIN_POPUP_SECS} and {MAX_POPUP_SECS} seconds"
            )));
        }
        if let Some(avatar) = &self.companion_avatar {
            if !avatar.starts_with("data:image/") || avatar.len() > MAX_AVATAR_DATA_LEN {
                return Err(AppError::validation(
                    "Companion image must be an image upload within the size limit",
                ));
            }
        }
        Ok(AppSettings {
            theme: self.theme.clone(),
            language: self.language.trim().to_string(),
            default_tone: self.default_tone.trim().to_string(),
            notifications_enabled: self.notifications_enabled,
            autostart_enabled: self.autostart_enabled,
            launch_minimized: self.launch_minimized,
            snooze_duration: self.snooze_duration,
            reduced_motion: self.reduced_motion,
            companion_avatar: self.companion_avatar.clone(),
            popup_duration_secs: self.popup_duration_secs,
        })
    }
}

/// Compact `days_of_week` storage: sorted weekdays as `"1,3,5"`, `NULL` when
/// absent. A normalized table would be overkill for a fixed 0–6 range that is
/// always read/written atomically with its reminder.
pub fn encode_days(days: &Option<Vec<u8>>) -> Option<String> {
    days.as_ref().map(|v| {
        v.iter()
            .map(std::string::ToString::to_string)
            .collect::<Vec<_>>()
            .join(",")
    })
}

pub fn decode_days(raw: &Option<String>) -> AppResult<Option<Vec<u8>>> {
    match raw {
        None => Ok(None),
        Some(text) if text.trim().is_empty() => Ok(None),
        Some(text) => {
            let mut days = Vec::new();
            for part in text.split(',') {
                let day: u8 = part.trim().parse().map_err(|_| {
                    AppError::invalid_reminder(format!(
                        "Corrupt days_of_week value '{text}' in database"
                    ))
                })?;
                if day > 6 {
                    return Err(AppError::invalid_reminder(format!(
                        "Corrupt days_of_week value '{text}' in database"
                    )));
                }
                days.push(day);
            }
            days.sort_unstable();
            days.dedup();
            Ok(Some(days))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> CreateReminderInput {
        CreateReminderInput {
            title: "Drink water".to_string(),
            message: None,
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
    fn empty_title_rejected() {
        let input = CreateReminderInput {
            title: "   ".to_string(),
            ..valid_input()
        };
        let err = input.validated().expect_err("empty title must fail");
        assert_eq!(
            err,
            AppError::validation("Title must not be empty".to_string())
        );
    }

    #[test]
    fn invalid_schedule_rejected() {
        let input = CreateReminderInput {
            schedule_type: "yearly".to_string(),
            ..valid_input()
        };
        assert!(input.validated().is_err());

        let bad_time = CreateReminderInput {
            scheduled_time: "25:99".to_string(),
            ..valid_input()
        };
        assert!(bad_time.validated().is_err());

        let weekly_without_days = CreateReminderInput {
            schedule_type: "weekly".to_string(),
            scheduled_time: "09:00".to_string(),
            days_of_week: None,
            ..valid_input()
        };
        assert!(weekly_without_days.validated().is_err());
    }

    #[test]
    fn weekly_days_normalized() {
        let input = CreateReminderInput {
            schedule_type: "weekly".to_string(),
            scheduled_time: "09:00".to_string(),
            days_of_week: Some(vec![5, 1, 1, 3]),
            ..valid_input()
        };
        let validated = input.validated().expect("valid weekly input");
        assert_eq!(validated.days_of_week, Some(vec![1, 3, 5]));
    }

    #[test]
    fn settings_validation() {
        let mut settings = AppSettings::default();
        assert!(settings.validated().is_ok());
        settings.theme = "neon".to_string();
        assert!(settings.validated().is_err());
        settings.theme = "dark".to_string();
        settings.popup_duration_secs = 2;
        assert!(settings.validated().is_err());
        settings.popup_duration_secs = 601;
        assert!(settings.validated().is_err());
        settings.popup_duration_secs = 30;
        assert!(settings.validated().is_ok());
    }

    #[test]
    fn rejects_impossible_calendar_dates() {
        assert!(is_valid_datetime_local("2026-09-21T10:00"));
        assert!(is_valid_datetime_local("2028-02-29T10:00"));
        assert!(!is_valid_datetime_local("2026-02-31T10:00"));
        assert!(!is_valid_datetime_local("2026-02-29T10:00"));
        assert!(!is_valid_datetime_local("2026-04-31T10:00"));
    }
}
