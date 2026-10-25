import type { ReminderDuePayload } from "../reminders/types";

/**
 * Popup presentation payload. Same wire shape as `reminder-due` (curated
 * display fields only — never raw rows or internal columns).
 */
export type PopupPayload = ReminderDuePayload;

/** Guards the event boundary: malformed native payloads never reach the UI. */
export function validatePopupPayload(value: unknown): PopupPayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const v = value as Record<string, unknown>;
  if (typeof v["id"] !== "number" || !Number.isInteger(v["id"]) || (v["id"] as number) <= 0) {
    return null;
  }
  if (typeof v["title"] !== "string" || (v["title"] as string).trim().length === 0) {
    return null;
  }
  if (v["message"] !== null && typeof v["message"] !== "string") {
    return null;
  }
  if (typeof v["kind"] !== "string" || typeof v["scheduleType"] !== "string") {
    return null;
  }
  if (typeof v["scheduledTime"] !== "string") {
    return null;
  }
  if (v["daysOfWeek"] !== null && !Array.isArray(v["daysOfWeek"])) {
    return null;
  }
  if (v["tone"] !== null && typeof v["tone"] !== "string") {
    return null;
  }
  if (typeof v["snoozeDuration"] !== "number" || !Number.isInteger(v["snoozeDuration"])) {
    return null;
  }
  return {
    id: v["id"] as number,
    title: (v["title"] as string).trim().slice(0, 200),
    message: v["message"] as string | null,
    kind: v["kind"] as string,
    scheduleType: v["scheduleType"] as string,
    scheduledTime: v["scheduledTime"] as string,
    daysOfWeek: v["daysOfWeek"] as number[] | null,
    snoozeDuration: v["snoozeDuration"] as number,
    tone: v["tone"] as string | null,
  };
}

/** Snooze menu entries: the reminder's own length first, then the presets. */
export function snoozeOptions(
  reminderMinutes: number,
  presets: readonly number[],
): number[] {
  const own = reminderMinutes > 0 && reminderMinutes <= 180 ? [reminderMinutes] : [];
  return [...new Set([...own, ...presets])];
}
