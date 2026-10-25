//! Scheduler engine (Phase 3): tick orchestration and lifecycle.
//!
//! Each tick: load enabled reminders, decide each one with the pure
//! calculator, persist the verdict while holding the shared DB mutex, then
//! notify outside the lock. Commands and the tick serialize on the same
//! mutex, so concurrent evaluation can never double-fire an occurrence.
//! Mark-before-notify: the occurrence is consumed first, so a crash or a
//! notification failure can never refire it.

use chrono::{DateTime, Local};
use std::sync::atomic::{AtomicBool, Ordering};

use super::calculator::decide;
use super::types::{Decision, MaintenanceAction, TickReport};
use crate::db::{self, DbState};
use crate::error::{log_error, log_info, AppResult, ErrorCode};
use crate::models::{Reminder, ReminderFilter};

/// Application-level pause flag (tray/commands). While set, ticks evaluate
/// nothing and mark nothing — pausing behaves exactly like the app being
/// asleep: occurrences pass unmarked, and resume applies the normal
/// missed-reminder grace policy. `last_triggered_at` and snooze state are
/// never touched by a paused tick. Persisted in the settings table; the
/// runtime loads it at startup.
static PAUSED: AtomicBool = AtomicBool::new(false);

/// Sets the paused flag (persisted separately by the caller).
pub fn set_paused(paused: bool) {
    PAUSED.store(paused, Ordering::SeqCst);
}

pub fn is_paused() -> bool {
    PAUSED.load(Ordering::SeqCst)
}

enum TickOutcome {
    Fired(Reminder),
    Maintained,
    Skipped,
}

fn evaluate_locked(
    conn: &rusqlite::Connection,
    cached_id: i64,
    now: DateTime<Local>,
) -> AppResult<TickOutcome> {
    let fresh = match db::get_reminder(conn, cached_id) {
        Ok(reminder) => reminder,
        // Deleted concurrently between list and evaluate: nothing to do.
        Err(e) if e.code == ErrorCode::NotFound => return Ok(TickOutcome::Skipped),
        Err(e) => return Err(e),
    };
    match decide(&fresh, now) {
        Decision::Skip => Ok(TickOutcome::Skipped),
        Decision::Maintain(MaintenanceAction::ClearStaleSnooze) => {
            db::snooze_reminder(conn, fresh.id, 0)?;
            Ok(TickOutcome::Maintained)
        }
        Decision::Maintain(MaintenanceAction::DisableMissedOnce) => {
            db::set_reminder_enabled(conn, fresh.id, false)?;
            Ok(TickOutcome::Maintained)
        }
        Decision::Fire(action) => {
            let fired = db::mark_fired(
                conn,
                fresh.id,
                action.occurrence_epoch,
                action.disable_after,
            )?;
            Ok(TickOutcome::Fired(fired))
        }
    }
}

/// One scheduler pass. `notifier` (desktop notification) runs outside the DB
/// lock; `on_fired` (popup + `reminder-due` event) runs after it, even when
/// notification delivery failed — the popup is the fallback path.
pub fn tick_once(
    state: &DbState,
    now: DateTime<Local>,
    paused: bool,
    notifier: &mut dyn FnMut(&Reminder) -> Result<(), String>,
    on_fired: &mut dyn FnMut(&Reminder),
) -> TickReport {
    let mut report = TickReport::default();
    let reminders = match db::with_state(state, |conn| {
        db::list_reminders(
            conn,
            &ReminderFilter {
                enabled_only: Some(true),
            },
        )
    }) {
        Ok(list) => list,
        Err(e) => {
            log_error(&format!("scheduler tick aborted: {e}"));
            return report;
        }
    };
    report.evaluated = reminders.len();
    if paused {
        // Paused: count evaluated for observability, consume nothing.
        return report;
    }
    for cached in reminders {
        match db::with_state(state, |conn| evaluate_locked(conn, cached.id, now)) {
            Ok(TickOutcome::Fired(fired)) => {
                report.fired += 1;
                report.fired_ids.push(fired.id);
                match notifier(&fired) {
                    Ok(()) => report.notified += 1,
                    Err(detail) => {
                        report.notify_failed += 1;
                        log_error(&format!(
                            "notification failed for reminder id {}: {detail}",
                            fired.id
                        ));
                    }
                }
                on_fired(&fired);
            }
            Ok(TickOutcome::Maintained) => report.maintained += 1,
            Ok(TickOutcome::Skipped) => {}
            Err(e) => log_error(&format!("scheduler database failure: {e}")),
        }
    }
    if report.fired > 0 || report.maintained > 0 || report.notify_failed > 0 {
        log_info(&format!(
            "scheduler tick evaluated={} fired={} notified={} notify_failed={} maintained={} ids={:?}",
            report.evaluated,
            report.fired,
            report.notified,
            report.notify_failed,
            report.maintained,
            report.fired_ids
        ));
    }
    report
}

/// Tauri-runtime lifecycle: exactly one background loop per process.
///
/// Sleep/wake needs no special handling: sleep merely delays ticks, and the
/// first tick after wake applies the missed-reminder policy. The thread is
/// owned by the process and dies with it — no handles outlive the app.
pub mod runtime {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    use tauri::{AppHandle, Emitter, Manager};

    use super::super::types::TICK_INTERVAL_SECS;
    use super::{is_paused, tick_once};
    use crate::db::DbState;
    use crate::error::{log_error, log_info};
    use crate::notifications;

    static RUNNING: AtomicBool = AtomicBool::new(false);

    /// Starts the loop exactly once; further calls log and return. The first
    /// tick runs immediately (startup recovery), then every tick interval.
    pub fn start(app: AppHandle) {
        if RUNNING.swap(true, Ordering::SeqCst) {
            log_info("scheduler already running; start() ignored");
            return;
        }
        if std::thread::Builder::new()
            .name("papa-scheduler".to_string())
            .spawn(move || {
                log_info("scheduler started");
                run_loop(&app);
                RUNNING.store(false, Ordering::SeqCst);
                log_info("scheduler stopped");
            })
            .is_err()
        {
            RUNNING.store(false, Ordering::SeqCst);
            log_error("scheduler failed to spawn background thread");
        }
    }

    pub fn is_running() -> bool {
        RUNNING.load(Ordering::SeqCst)
    }

    /// Payload of the `reminder-due` event: curated display fields only
    /// (never raw rows or internal columns). The popup presents these
    /// directly; the main UI reloads full state through commands.
    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ReminderDuePayload {
        id: i64,
        title: String,
        message: Option<String>,
        kind: String,
        schedule_type: String,
        scheduled_time: String,
        days_of_week: Option<Vec<u8>>,
        snooze_duration: i64,
        tone: Option<String>,
    }

    /// Id carried by the synthetic test reminder (JS `MAX_SAFE_INTEGER`): the
    /// popup requires a positive integer, and no real row ever reaches it.
    const TEST_REMINDER_ID: i64 = 9_007_199_254_740_991;

    /// Presents a synthetic reminder through the real popup path (top-center
    /// card + tone) so the user can verify what an actual reminder looks
    /// like. Touches no reminder state.
    pub fn show_test_popup(app: &AppHandle) {
        crate::platform::windows::show_popup_for_reminder(app, TEST_REMINDER_ID);
        if let Err(e) = app.emit(
            "reminder-due",
            ReminderDuePayload {
                id: TEST_REMINDER_ID,
                title: "Papa.app test reminder".to_string(),
                message: Some("The reminder popup works.".to_string()),
                kind: "reminder".to_string(),
                schedule_type: "once".to_string(),
                scheduled_time: chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string(),
                days_of_week: None,
                snooze_duration: 5,
                tone: None,
            },
        ) {
            log_error(&format!("emitting test reminder-due failed: {e}"));
        }
    }

    /// One production pass: notify (unless disabled in settings), then popup
    /// + event per fired reminder. Shared by the background loop and the
    /// resume command (catch-up tick). The popup always presents — muting
    /// notifications never disables reminders themselves.
    pub fn production_tick(app: &AppHandle) {
        let Some(state) = app.try_state::<DbState>() else {
            log_error("scheduler tick skipped: database state unavailable");
            return;
        };
        let mut notifier = |reminder: &crate::models::Reminder| {
            // Read at fire time (not per tick): muting desktop notifications
            // never disables reminders — the popup still presents.
            let audible = crate::db::with_state(&state, |conn| crate::db::get_settings(conn))
                .map(|settings| settings.notifications_enabled)
                .unwrap_or(true);
            if !audible {
                return Ok(());
            }
            notifications::notify(app, reminder).map_err(|e| e.to_string())
        };
        let mut on_fired = |reminder: &crate::models::Reminder| {
            crate::platform::windows::show_popup_for_reminder(app, reminder.id);
            if let Err(e) = app.emit(
                "reminder-due",
                ReminderDuePayload {
                    id: reminder.id,
                    title: reminder.title.clone(),
                    message: reminder.message.clone(),
                    kind: reminder.kind.clone(),
                    schedule_type: reminder.schedule_type.clone(),
                    scheduled_time: reminder.scheduled_time.clone(),
                    days_of_week: reminder.days_of_week.clone(),
                    snooze_duration: reminder.snooze_duration,
                    tone: reminder.tone.clone(),
                },
            ) {
                log_error(&format!("emitting reminder-due failed: {e}"));
            }
        };
        tick_once(
            &state,
            chrono::Local::now(),
            is_paused(),
            &mut notifier,
            &mut on_fired,
        );
    }

    fn run_loop(app: &AppHandle) {
        // The process-owned thread ends with the process; no stop signal.
        loop {
            production_tick(app);
            std::thread::sleep(Duration::from_secs(TICK_INTERVAL_SECS));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use std::sync::Mutex;

    use crate::db::run_migrations;
    use crate::models::CreateReminderInput;

    fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Local> {
        Local.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap()
    }

    fn state() -> DbState {
        let conn = rusqlite::Connection::open_in_memory().expect("memory db");
        run_migrations(&conn).expect("migrations");
        DbState(Mutex::new(conn))
    }

    fn daily_at_10() -> CreateReminderInput {
        CreateReminderInput {
            title: "Water".to_string(),
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

    fn insert(state: &DbState, input: &CreateReminderInput) -> Reminder {
        db::with_state(state, |conn| db::create_reminder(conn, input)).expect("insert")
    }

    fn ok_notifier() -> impl FnMut(&Reminder) -> Result<(), String> {
        |_| Ok(())
    }

    fn noop_fire(_: &Reminder) {}

    #[test]
    fn repeated_ticks_fire_exactly_once() {
        let state = state();
        insert(&state, &daily_at_10());
        let now = at(2026, 9, 21, 10, 0, 30);
        // Simulate many rapid evaluations of the same occurrence.
        for i in 0..5 {
            let report = tick_once(&state, now, false, &mut ok_notifier(), &mut noop_fire);
            if i == 0 {
                assert_eq!(report.fired, 1);
                assert_eq!(report.notified, 1);
            } else {
                assert_eq!(report.fired, 0, "tick {i} must not refire");
            }
        }
    }

    #[test]
    fn notify_failure_still_consumes_occurrence() {
        let state = state();
        insert(&state, &daily_at_10());
        let now = at(2026, 9, 21, 10, 0, 30);
        let report = tick_once(
            &state,
            now,
            false,
            &mut |_| Err::<(), String>("daemon down".to_string()),
            &mut noop_fire,
        );
        assert_eq!(report.fired, 1);
        assert_eq!(report.notify_failed, 1);
        // The occurrence was consumed: no refire once delivery recovers.
        let retry = tick_once(&state, now, false, &mut ok_notifier(), &mut noop_fire);
        assert_eq!(retry.fired, 0);
    }

    #[test]
    fn disabled_reminder_never_fires_on_tick() {
        let state = state();
        let input = CreateReminderInput {
            enabled: false,
            ..daily_at_10()
        };
        insert(&state, &input);
        let report = tick_once(
            &state,
            at(2026, 9, 21, 10, 5, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(report.evaluated, 0);
        assert_eq!(report.fired, 0);
    }

    #[test]
    fn snooze_tick_before_and_after_elapse() {
        use rusqlite::params;
        let state = state();
        let created = insert(&state, &daily_at_10());
        // Pin the snooze to the fake clock (the write path uses the real
        // clock, which the deterministic tick does not share).
        let until = at(2026, 9, 21, 11, 0, 0).timestamp();
        db::with_state(&state, |conn| {
            conn.execute(
                "UPDATE reminders SET snoozed_until = ?1 WHERE id = ?2",
                params![until, created.id],
            )
            .expect("pin snooze");
            Ok(())
        })
        .expect("pin snooze");
        let before = tick_once(
            &state,
            at(2026, 9, 21, 10, 5, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(before.fired, 0);
        let after = tick_once(
            &state,
            at(2026, 9, 21, 11, 5, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(after.fired, 1);
        let stored =
            db::with_state(&state, |conn| db::get_reminder(conn, created.id)).expect("stored");
        assert_eq!(stored.last_triggered_at, Some(until));
        assert_eq!(stored.snoozed_until, None);
    }

    #[test]
    fn startup_recovery_policies_on_tick() {
        // App starts before the occurrence: nothing fires, stays enabled.
        let early = state();
        insert(&early, &daily_at_10());
        let report = tick_once(
            &early,
            at(2026, 9, 21, 9, 0, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(report.fired, 0);

        // App starts long after a one-time reminder: disabled, never fired.
        let late = state();
        let once_input = CreateReminderInput {
            schedule_type: "once".to_string(),
            scheduled_time: "2026-09-18T10:00".to_string(),
            ..daily_at_10()
        };
        let created = insert(&late, &once_input);
        let report = tick_once(
            &late,
            at(2026, 9, 21, 10, 0, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(report.fired, 0);
        assert_eq!(report.maintained, 1);
        let stored =
            db::with_state(&late, |conn| db::get_reminder(conn, created.id)).expect("stored");
        assert!(!stored.enabled);
    }

    #[test]
    fn weekly_tick_fires_monday_only() {
        let state = state();
        let input = CreateReminderInput {
            schedule_type: "weekly".to_string(),
            days_of_week: Some(vec![1]),
            ..daily_at_10()
        };
        insert(&state, &input);
        let monday = tick_once(
            &state,
            at(2026, 9, 21, 10, 1, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(monday.fired, 1);
        let tuesday = tick_once(
            &state,
            at(2026, 9, 22, 10, 1, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(tuesday.fired, 0);
    }

    #[test]
    fn paused_tick_consumes_nothing_and_resume_fires_within_grace() {
        let state = state();
        let created = insert(&state, &daily_at_10());
        let now = at(2026, 9, 21, 10, 0, 30);
        let paused = tick_once(&state, now, true, &mut ok_notifier(), &mut noop_fire);
        assert_eq!(paused.evaluated, 1);
        assert_eq!(paused.fired, 0);
        // Nothing was marked: the occurrence is still pending after resume.
        let stored =
            db::with_state(&state, |conn| db::get_reminder(conn, created.id)).expect("stored");
        assert_eq!(stored.last_triggered_at, None);
        let resumed = tick_once(&state, now, false, &mut ok_notifier(), &mut noop_fire);
        assert_eq!(resumed.fired, 1);
    }

    #[test]
    fn delivery_hook_runs_per_fire_even_when_notify_fails() {
        let state = state();
        insert(&state, &daily_at_10());
        let now = at(2026, 9, 21, 10, 0, 30);
        let mut seen = Vec::new();
        let report = tick_once(
            &state,
            now,
            false,
            &mut |_| Err::<(), String>("daemon down".to_string()),
            &mut |reminder: &Reminder| seen.push(reminder.id),
        );
        assert_eq!(report.fired, 1);
        assert_eq!(seen.len(), 1);
        // Hook does not run for skipped reminders.
        let mut skipped_seen = Vec::new();
        let quiet = tick_once(
            &state,
            now,
            false,
            &mut ok_notifier(),
            &mut |reminder: &Reminder| skipped_seen.push(reminder.id),
        );
        assert_eq!(quiet.fired, 0);
        assert!(skipped_seen.is_empty());
    }

    #[test]
    fn paused_tick_preserves_snooze_state() {
        use rusqlite::params;
        let state = state();
        let created = insert(&state, &daily_at_10());
        // Snooze elapses at 11:00; tick at 11:05 while paused.
        let until = at(2026, 9, 21, 11, 0, 0).timestamp();
        db::with_state(&state, |conn| {
            conn.execute(
                "UPDATE reminders SET snoozed_until = ?1 WHERE id = ?2",
                params![until, created.id],
            )
            .expect("pin snooze");
            Ok(())
        })
        .expect("pin snooze");
        let report = tick_once(
            &state,
            at(2026, 9, 21, 11, 5, 0),
            true,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(report.fired, 0);
        // Nothing consumed: snooze intact, no trigger recorded.
        let stored =
            db::with_state(&state, |conn| db::get_reminder(conn, created.id)).expect("stored");
        assert_eq!(stored.snoozed_until, Some(until));
        assert_eq!(stored.last_triggered_at, None);
        // Resume fires the still-pending snooze.
        let resumed = tick_once(
            &state,
            at(2026, 9, 21, 11, 5, 0),
            false,
            &mut ok_notifier(),
            &mut noop_fire,
        );
        assert_eq!(resumed.fired, 1);
    }

    #[test]
    fn snoozed_once_reminder_refires_then_is_consumed_again() {
        let state = state();
        let r = insert(
            &state,
            &CreateReminderInput {
                schedule_type: "once".to_string(),
                scheduled_time: "2026-09-21T10:00".to_string(),
                ..daily_at_10()
            },
        );
        let now = at(2026, 9, 21, 10, 0, 5);
        assert_eq!(
            tick_once(&state, now, false, &mut ok_notifier(), &mut noop_fire).fired,
            1
        );
        // Snooze from the popup: the auto-disabled reminder must come back.
        let until = now.timestamp() + 300;
        db::with_state(&state, |conn| {
            db::snooze_reminder(conn, r.id, 5)?;
            conn.execute(
                "UPDATE reminders SET snoozed_until = ?1 WHERE id = ?2",
                rusqlite::params![until, r.id],
            )
            .map_err(|e| crate::error::AppError::database("pin snooze", &e))?;
            Ok(())
        })
        .expect("snooze");
        let later = at(2026, 9, 21, 10, 5, 10);
        assert_eq!(
            tick_once(&state, later, false, &mut ok_notifier(), &mut noop_fire).fired,
            1,
            "snoozed one-time reminder must refire"
        );
        let stored = db::with_state(&state, |conn| db::get_reminder(conn, r.id)).expect("get");
        assert!(!stored.enabled, "consumed again after the snooze fires");
        assert_eq!(
            tick_once(&state, later, false, &mut ok_notifier(), &mut noop_fire).fired,
            0
        );
    }

    #[test]
    fn arming_skips_occurrence_that_passed_before_the_change() {
        let state = state();
        let r = insert(&state, &daily_at_10());
        let now = at(2026, 9, 21, 10, 20, 0);
        db::with_state(&state, |conn| db::arm_recurring(conn, r.id, now)).expect("arm");
        assert_eq!(
            tick_once(&state, now, false, &mut ok_notifier(), &mut noop_fire).fired,
            0,
            "10:00 passed before the reminder existed"
        );
        let next_day = at(2026, 9, 22, 10, 0, 5);
        assert_eq!(
            tick_once(&state, next_day, false, &mut ok_notifier(), &mut noop_fire).fired,
            1
        );
    }
}
