-- 003_remove_alarm_kind: the "alarm" kind no longer exists; fold any stored
-- alarms into plain reminders so they stay valid for edits.
UPDATE reminders SET kind = 'reminder' WHERE kind = 'alarm';
