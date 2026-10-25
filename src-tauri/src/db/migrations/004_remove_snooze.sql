-- 004_remove_snooze: snoozing no longer exists. Drop the per-reminder snooze
-- length and pending-snooze state, and the stale default-snooze preference.
ALTER TABLE reminders DROP COLUMN snooze_duration;
ALTER TABLE reminders DROP COLUMN snoozed_until;
DELETE FROM settings WHERE key = 'snooze_duration';
