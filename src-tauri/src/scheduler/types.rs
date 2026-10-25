//! Scheduler shared types and policy constants (Phase 3).
//!
//! Time model (read carefully):
//! - Schedules (`scheduled_time`) are wall-clock times in the user's **local**
//!   time zone: `HH:MM` for daily/weekly, `YYYY-MM-DDTHH:MM` for once.
//! - Persistence (`last_triggered_at`, `snoozed_until`) is **UTC epoch
//!   seconds** — an absolute instant, never a wall-clock string.
//! - `now` enters the engine as `DateTime<Local>`; comparisons happen on
//!   epoch seconds derived from that instant. Time zones are never mixed.

/// How often the background loop re-evaluates reminders. Minute-precision
/// schedules do not need aggressive polling; 5s keeps worst-case delay low
/// while staying idle-cheap (one tiny indexed query per tick).
pub const TICK_INTERVAL_SECS: u64 = 5;

/// A daily/weekly occurrence still fires when the engine reaches it up to
/// this late (covers sleep/wake and short outages). Older occurrences are
/// skipped — the next one will come.
pub const RECURRING_GRACE_SECS: i64 = 30 * 60;

/// A one-time reminder still fires when the app first sees it up to this
/// late. Older ones are auto-disabled as missed instead of firing stale.
pub const ONCE_GRACE_SECS: i64 = 24 * 3600;

/// A snooze is explicit user intent, so it fires even if reached while the
/// app was closed — unless it is older than this, in which case the stale
/// snooze is cleared without firing.
pub const SNOOZE_STALE_SECS: i64 = 24 * 3600;

/// One consumed schedule occurrence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FireAction {
    /// Epoch seconds of the occurrence that triggered.
    pub occurrence_epoch: i64,
    /// One-time reminders auto-disable after firing (see docs below).
    pub disable_after: bool,
    /// True when the trigger came from an elapsed snooze.
    pub from_snooze: bool,
}

/// Housekeeping the engine applies instead of firing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MaintenanceAction {
    /// Drop a snooze that went stale while the app was closed.
    ClearStaleSnooze,
    /// Disable a one-time reminder whose time passed long ago.
    DisableMissedOnce,
}

/// Pure scheduler verdict for one reminder at one instant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Fire(FireAction),
    Maintain(MaintenanceAction),
    Skip,
}

/// Per-tick counters for throttled logging (no per-reminder tick spam).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TickReport {
    pub evaluated: usize,
    pub fired: usize,
    pub notified: usize,
    pub notify_failed: usize,
    pub maintained: usize,
    /// Reminder ids that fired (no user content in logs).
    pub fired_ids: Vec<i64>,
}
