//! Pure due-date calculations (Phase 3).
//!
//! `decide()` is a total, deterministic function of `(Reminder, now)` — no
//! I/O, no globals, no system clock. The production engine supplies
//! `Local::now()`; tests inject fixed instants.

use chrono::{DateTime, Datelike, Local, NaiveDateTime, NaiveTime, TimeZone};

use super::types::{
    Decision, FireAction, MaintenanceAction, ONCE_GRACE_SECS, RECURRING_GRACE_SECS,
    SNOOZE_STALE_SECS,
};
use crate::models::Reminder;

fn parse_hhmm(value: &str) -> Option<NaiveTime> {
    let (hour, minute) = value.split_once(':')?;
    if value.len() != 5 {
        return None;
    }
    NaiveTime::from_hms_opt(hour.parse().ok()?, minute.parse().ok()?, 0)
}

fn parse_once_local(value: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M").ok()
}

/// Epoch seconds of a local wall-clock time, or `None` inside a DST
/// transition gap (skipped; daily/weekly schedules fire at the next
/// occurrence). On fall-back overlaps the earliest of the two instants wins,
/// so the occurrence fires exactly once instead of being skipped.
fn local_epoch(naive: NaiveDateTime) -> Option<i64> {
    local_epoch_in(naive, Local)
}

/// Timezone-parameterized core of [`local_epoch`]. Production always passes
/// [`Local`]; tests inject IANA zones for deterministic DST coverage without
/// touching process-global timezone state.
fn local_epoch_in<Tz: TimeZone>(naive: NaiveDateTime, tz: Tz) -> Option<i64> {
    naive
        .and_local_timezone(tz)
        .earliest()
        .map(|dt| dt.timestamp())
}

/// Latest daily/weekly occurrence at-or-before `now`, as epoch seconds.
fn latest_recurring_occurrence(
    now: DateTime<Local>,
    time: NaiveTime,
    schedule_type: &str,
    days_of_week: &Option<Vec<u8>>,
) -> Option<i64> {
    let today = now.date_naive();
    match schedule_type {
        "daily" => {
            let today_occ = local_epoch(today.and_time(time))?;
            if today_occ <= now.timestamp() {
                return Some(today_occ);
            }
            // Today's time is still ahead: the latest past occurrence is yesterday's.
            let yesterday = today.pred_opt()?;
            local_epoch(yesterday.and_time(time))
        }
        "weekly" => {
            let days = days_of_week.as_ref()?;
            // Walk back up to 7 days so a same-weekday occurrence last week is
            // found when today's matching occurrence is still in the future.
            for back in 0..8 {
                let date = today - chrono::Duration::days(back);
                if !days.contains(&(date.weekday().num_days_from_sunday() as u8)) {
                    continue;
                }
                if let Some(occ) = local_epoch(date.and_time(time)) {
                    if occ <= now.timestamp() {
                        return Some(occ);
                    }
                }
            }
            None
        }
        _ => None,
    }
}

/// Latest daily/weekly occurrence of `reminder` at-or-before `now` (epoch
/// seconds); `None` for one-time or unparsable schedules. Used to arm a newly
/// created/edited/re-enabled reminder so an occurrence that already passed
/// does not fire retroactively.
pub fn latest_occurrence_before(reminder: &Reminder, now: DateTime<Local>) -> Option<i64> {
    let time = parse_hhmm(&reminder.scheduled_time)?;
    latest_recurring_occurrence(now, time, &reminder.schedule_type, &reminder.days_of_week)
}

/// Scheduler verdict for one reminder at `now`.
///
/// One-time reminders auto-disable after firing: "once" means once ever, and
/// a lingering `enabled` flag on a consumed reminder would be misleading. The
/// flag change is data-compatible (no schema break) and reversible — the user
/// can re-enable/recreate the reminder.
pub fn decide(reminder: &Reminder, now: DateTime<Local>) -> Decision {
    if !reminder.enabled {
        return Decision::Skip;
    }
    let now_ts = now.timestamp();

    // Explicit snooze intent wins over the base schedule. While a future
    // snooze is pending, the normal schedule is suppressed.
    if let Some(until) = reminder.snoozed_until {
        if now_ts < until {
            return Decision::Skip;
        }
        if now_ts - until <= SNOOZE_STALE_SECS {
            return Decision::Fire(FireAction {
                occurrence_epoch: until,
                // A one-time reminder re-enabled by its snooze is consumed
                // again once the snooze fires.
                disable_after: reminder.schedule_type == "once",
                from_snooze: true,
            });
        }
        return Decision::Maintain(MaintenanceAction::ClearStaleSnooze);
    }

    match reminder.schedule_type.as_str() {
        "once" => {
            let naive = match parse_once_local(&reminder.scheduled_time) {
                Some(v) => v,
                None => return Decision::Skip,
            };
            let occurrence = match local_epoch(naive) {
                Some(v) => v,
                None => return Decision::Skip,
            };
            if now_ts < occurrence {
                return Decision::Skip;
            }
            if reminder.last_triggered_at >= Some(occurrence) {
                return Decision::Skip;
            }
            if now_ts - occurrence > ONCE_GRACE_SECS {
                return Decision::Maintain(MaintenanceAction::DisableMissedOnce);
            }
            Decision::Fire(FireAction {
                occurrence_epoch: occurrence,
                disable_after: true,
                from_snooze: false,
            })
        }
        "daily" | "weekly" => {
            let time = match parse_hhmm(&reminder.scheduled_time) {
                Some(v) => v,
                None => return Decision::Skip,
            };
            let occurrence = match latest_recurring_occurrence(
                now,
                time,
                &reminder.schedule_type,
                &reminder.days_of_week,
            ) {
                Some(v) => v,
                None => return Decision::Skip,
            };
            if reminder.last_triggered_at >= Some(occurrence) {
                return Decision::Skip;
            }
            if now_ts - occurrence > RECURRING_GRACE_SECS {
                // Stale occurrence: skip quietly; the next one will come.
                return Decision::Skip;
            }
            Decision::Fire(FireAction {
                occurrence_epoch: occurrence,
                disable_after: false,
                from_snooze: false,
            })
        }
        // Corrupt/unknown schedule data never fires.
        _ => Decision::Skip,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Local> {
        Local.with_ymd_and_hms(y, mo, d, h, mi, s).unwrap()
    }

    fn base() -> Reminder {
        Reminder {
            id: 1,
            title: "Test".to_string(),
            message: None,
            kind: "reminder".to_string(),
            enabled: true,
            schedule_type: "daily".to_string(),
            scheduled_time: "10:00".to_string(),
            days_of_week: None,
            snooze_duration: 5,
            tone: None,
            created_at: 0,
            updated_at: 0,
            last_triggered_at: None,
            snoozed_until: None,
        }
    }

    fn once_at(when: &str) -> Reminder {
        Reminder {
            schedule_type: "once".to_string(),
            scheduled_time: when.to_string(),
            ..base()
        }
    }

    fn weekly_mon_wed_fri() -> Reminder {
        Reminder {
            schedule_type: "weekly".to_string(),
            scheduled_time: "10:00".to_string(),
            days_of_week: Some(vec![1, 3, 5]),
            ..base()
        }
    }

    fn fired(occurrence_epoch: i64) -> Decision {
        Decision::Fire(FireAction {
            occurrence_epoch,
            disable_after: false,
            from_snooze: false,
        })
    }

    // 2026-09-21 is a Monday (2026-09-25 is the known Friday).

    // --- one-time ---

    #[test]
    fn once_not_due_before() {
        assert_eq!(
            decide(&once_at("2026-09-21T10:00"), at(2026, 9, 21, 9, 59, 59)),
            Decision::Skip
        );
    }

    #[test]
    fn once_due_at_and_after_within_grace() {
        let r = once_at("2026-09-21T10:00");
        let occ = at(2026, 9, 21, 10, 0, 0).timestamp();
        assert_eq!(
            decide(&r, at(2026, 9, 21, 10, 0, 0)),
            Decision::Fire(FireAction {
                occurrence_epoch: occ,
                disable_after: true,
                from_snooze: false
            })
        );
        assert_eq!(
            decide(&r, at(2026, 9, 21, 10, 0, 1)),
            Decision::Fire(FireAction {
                occurrence_epoch: occ,
                disable_after: true,
                from_snooze: false
            })
        );
        assert_eq!(
            decide(&r, at(2026, 9, 22, 9, 59, 0)),
            Decision::Fire(FireAction {
                occurrence_epoch: occ,
                disable_after: true,
                from_snooze: false
            })
        );
    }

    #[test]
    fn once_does_not_trigger_twice() {
        let occ = at(2026, 9, 21, 10, 0, 0).timestamp();
        let r = Reminder {
            last_triggered_at: Some(occ),
            ..once_at("2026-09-21T10:00")
        };
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 5, 0)), Decision::Skip);
        assert_eq!(decide(&r, at(2026, 9, 22, 10, 5, 0)), Decision::Skip);
    }

    #[test]
    fn once_stale_is_disabled_not_fired() {
        assert_eq!(
            decide(&once_at("2026-09-21T10:00"), at(2026, 9, 25, 10, 0, 0)),
            Decision::Maintain(MaintenanceAction::DisableMissedOnce)
        );
    }

    // --- daily ---

    #[test]
    fn daily_fires_at_time_and_not_before() {
        let r = base();
        assert_eq!(decide(&r, at(2026, 9, 21, 9, 59, 59)), Decision::Skip);
        let occ = at(2026, 9, 21, 10, 0, 0).timestamp();
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 0, 0)), fired(occ));
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 0, 1)), fired(occ));
    }

    #[test]
    fn daily_no_refire_same_day_but_fires_next_day() {
        let monday_occ = at(2026, 9, 21, 10, 0, 0).timestamp();
        let r = Reminder {
            last_triggered_at: Some(monday_occ),
            ..base()
        };
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 5, 0)), Decision::Skip);
        let tuesday_occ = at(2026, 9, 22, 10, 0, 0).timestamp();
        assert_eq!(decide(&r, at(2026, 9, 22, 10, 0, 1)), fired(tuesday_occ));
    }

    #[test]
    fn daily_stale_same_day_skips_quietly() {
        // 3h after the occurrence with no trigger recorded: too late, wait
        // for tomorrow. No maintenance — the schedule itself is still valid.
        assert_eq!(decide(&base(), at(2026, 9, 21, 13, 0, 0)), Decision::Skip);
    }

    #[test]
    fn daily_midnight_and_month_boundary() {
        let midnight = Reminder {
            scheduled_time: "00:00".to_string(),
            ..base()
        };
        let occ = at(2026, 9, 21, 0, 0, 0).timestamp();
        assert_eq!(decide(&midnight, at(2026, 9, 21, 0, 0, 30)), fired(occ));

        // Jan 31 fired; Feb 1 is a fresh occurrence.
        let jan31 = at(2026, 1, 31, 10, 0, 0).timestamp();
        let r = Reminder {
            last_triggered_at: Some(jan31),
            ..base()
        };
        let feb1_occ = at(2026, 2, 1, 10, 0, 0).timestamp();
        assert_eq!(decide(&r, at(2026, 2, 1, 10, 0, 1)), fired(feb1_occ));
    }

    // --- weekly (Mon/Wed/Fri 10:00) ---

    #[test]
    fn weekly_correct_days_fire() {
        let r = weekly_mon_wed_fri();
        assert_eq!(
            decide(&r, at(2026, 9, 21, 10, 0, 0)),
            fired(at(2026, 9, 21, 10, 0, 0).timestamp())
        );
        assert_eq!(
            decide(&r, at(2026, 9, 23, 10, 0, 0)),
            fired(at(2026, 9, 23, 10, 0, 0).timestamp())
        );
        assert_eq!(
            decide(&r, at(2026, 9, 25, 10, 5, 0)),
            fired(at(2026, 9, 25, 10, 0, 0).timestamp())
        );
    }

    #[test]
    fn weekly_wrong_days_skip() {
        let r = weekly_mon_wed_fri();
        // Tue 22, Thu 24, Sat 26, Sun 27 — mid-morning, nothing scheduled.
        for (d, weekday) in [(22, "Tue"), (24, "Thu"), (26, "Sat"), (27, "Sun")] {
            assert_eq!(
                decide(&r, at(2026, 9, d, 10, 5, 0)),
                Decision::Skip,
                "{weekday}"
            );
        }
    }

    #[test]
    fn weekly_each_occurrence_fires_once() {
        let mon_occ = at(2026, 9, 21, 10, 0, 0).timestamp();
        let r = Reminder {
            last_triggered_at: Some(mon_occ),
            ..weekly_mon_wed_fri()
        };
        // Later Monday: covered. Wednesday: fresh occurrence fires.
        assert_eq!(decide(&r, at(2026, 9, 21, 15, 0, 0)), Decision::Skip);
        assert_eq!(
            decide(&r, at(2026, 9, 23, 10, 0, 0)),
            fired(at(2026, 9, 23, 10, 0, 0).timestamp())
        );
    }

    #[test]
    fn weekly_monday_just_after_midnight_week_boundary() {
        let r = weekly_mon_wed_fri();
        // Monday 00:01, scheduled 00:00 on Mondays only here.
        let monday_midnight = Reminder {
            scheduled_time: "00:00".to_string(),
            days_of_week: Some(vec![1]),
            ..base()
        };
        let occ = at(2026, 9, 21, 0, 0, 0).timestamp();
        assert_eq!(
            decide(&monday_midnight, at(2026, 9, 21, 0, 1, 0)),
            fired(occ)
        );
        let _ = r;
    }

    // --- snooze ---

    #[test]
    fn snooze_future_suppresses_schedule() {
        // Daily 10:00 is due at 10:05, but a snooze until 11:00 wins.
        let now = at(2026, 9, 21, 10, 5, 0);
        let r = Reminder {
            snoozed_until: Some(at(2026, 9, 21, 11, 0, 0).timestamp()),
            ..base()
        };
        assert_eq!(decide(&r, now), Decision::Skip);
    }

    #[test]
    fn snooze_elapsed_fires_from_snooze() {
        let until = at(2026, 9, 21, 10, 30, 0).timestamp();
        let r = Reminder {
            snoozed_until: Some(until),
            ..base()
        };
        assert_eq!(
            decide(&r, at(2026, 9, 21, 10, 30, 0)),
            Decision::Fire(FireAction {
                occurrence_epoch: until,
                disable_after: false,
                from_snooze: true
            })
        );
    }

    #[test]
    fn snooze_stale_is_cleared() {
        let until = at(2026, 9, 18, 10, 30, 0).timestamp();
        let r = Reminder {
            snoozed_until: Some(until),
            ..base()
        };
        assert_eq!(
            decide(&r, at(2026, 9, 21, 10, 30, 0)),
            Decision::Maintain(MaintenanceAction::ClearStaleSnooze)
        );
    }

    // --- guards ---

    #[test]
    fn disabled_never_fires() {
        let r = Reminder {
            enabled: false,
            ..once_at("2026-09-21T10:00")
        };
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 5, 0)), Decision::Skip);
        let snoozed = Reminder {
            enabled: false,
            snoozed_until: Some(at(2026, 9, 21, 10, 0, 0).timestamp()),
            ..base()
        };
        assert_eq!(decide(&snoozed, at(2026, 9, 21, 10, 5, 0)), Decision::Skip);
    }

    #[test]
    fn unknown_schedule_type_never_fires() {
        let r = Reminder {
            schedule_type: "minutely".to_string(),
            ..base()
        };
        assert_eq!(decide(&r, at(2026, 9, 21, 10, 5, 0)), Decision::Skip);
    }

    // --- DST (America/New_York via injected zone; no process TZ mutation) ---

    fn ny_naive(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> chrono::NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(y, mo, d)
            .expect("valid date")
            .and_hms_opt(h, mi, 0)
            .expect("valid time")
    }

    #[test]
    fn dst_spring_gap_has_no_occurrence() {
        // 2026-03-08: New York jumps 02:00 -> 03:00; 02:30 never happens.
        assert_eq!(
            local_epoch_in(ny_naive(2026, 3, 8, 2, 30), chrono_tz::America::New_York),
            None
        );
    }

    #[test]
    fn dst_fall_overlap_fires_earliest_once() {
        // 2026-11-01 01:30 happens twice; earliest is EDT (UTC-4) = 05:30Z.
        let expected = chrono::Utc
            .with_ymd_and_hms(2026, 11, 1, 5, 30, 0)
            .unwrap()
            .timestamp();
        assert_eq!(
            local_epoch_in(ny_naive(2026, 11, 1, 1, 30), chrono_tz::America::New_York),
            Some(expected)
        );
    }

    #[test]
    fn dst_unambiguous_matches_offset() {
        // Winter EST (UTC-5): 2026-01-15 10:00 local = 15:00Z.
        let expected = chrono::Utc
            .with_ymd_and_hms(2026, 1, 15, 15, 0, 0)
            .unwrap()
            .timestamp();
        assert_eq!(
            local_epoch_in(ny_naive(2026, 1, 15, 10, 0), chrono_tz::America::New_York),
            Some(expected)
        );
    }
}
