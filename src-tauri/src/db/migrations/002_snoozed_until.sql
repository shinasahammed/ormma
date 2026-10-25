-- 002_snoozed_until: explicit snooze state for the Phase 3 scheduler.
-- Snooze is a persisted scheduling state (epoch seconds), not a timer, so it
-- survives application restart. NULL = not snoozed.
ALTER TABLE reminders ADD COLUMN snoozed_until INTEGER;
