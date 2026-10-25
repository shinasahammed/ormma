import { translate } from "../../lib/i18n";
import type { Reminder } from "./types";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Monday-first narrow labels for the week picker (M T W T F S S). */
export const WEEK_ORDER_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

export function greetingForHour(hour: number, lang: string | null = "en"): string {
  if (hour < 5) return translate("greeting.night", lang);
  if (hour < 12) return translate("greeting.morning", lang);
  if (hour < 18) return translate("greeting.afternoon", lang);
  return translate("greeting.evening", lang);
}

type Schedulable = Pick<
  Reminder,
  "scheduleType" | "scheduledTime" | "daysOfWeek"
>;

export function describeSchedule(reminder: Schedulable, lang: string | null = "en"): string {
  if (reminder.scheduleType === "daily") {
    return translate("schedule.daily", lang, { time: reminder.scheduledTime });
  }
  if (reminder.scheduleType === "weekly") {
    const days = (reminder.daysOfWeek ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((day) => WEEKDAY_SHORT[day] ?? String(day))
      .join(" · ");
    return `${days} · ${reminder.scheduledTime}`;
  }
  const [date, time] = reminder.scheduledTime.split("T");
  return translate("schedule.once", lang, {
    date: date ?? reminder.scheduledTime,
    time: time ?? "",
  }).trim();
}

/** Wall-clock time-of-day ("HH:MM") for display and ordering.
 * Daily/weekly store "HH:MM" directly; once stores "YYYY-MM-DDTHH:MM". */
export function timeOfDay(scheduledTime: string): string {
  const afterT = scheduledTime.split("T").pop() ?? scheduledTime;
  return afterT.slice(0, 5);
}

function localDateKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whether an enabled reminder is scheduled to occur on `now`'s local day. */
export function isReminderToday(
  reminder: Pick<Reminder, "enabled" | "scheduleType" | "scheduledTime" | "daysOfWeek">,
  now: Date,
): boolean {
  if (!reminder.enabled) return false;
  if (reminder.scheduleType === "daily") return true;
  if (reminder.scheduleType === "weekly") {
    return (reminder.daysOfWeek ?? []).includes(now.getDay());
  }
  return reminder.scheduledTime.slice(0, 10) === localDateKey(now);
}

/** Today's firing set, ordered by time-of-day (lexical = chronological). */
export function todaysReminders(reminders: Reminder[], now: Date): Reminder[] {
  return reminders
    .filter((reminder) => isReminderToday(reminder, now))
    .sort((a, b) => timeOfDay(a.scheduledTime).localeCompare(timeOfDay(b.scheduledTime)) || a.scheduledTime.localeCompare(b.scheduledTime));
}

export function byScheduledTime(a: Reminder, b: Reminder): number {
  return timeOfDay(a.scheduledTime).localeCompare(timeOfDay(b.scheduledTime)) || a.scheduledTime.localeCompare(b.scheduledTime);
}

/** "Snoozed · back 14:35" (today) or "Snoozed · back Tue 09:10". */
export function describeSnoozeUntil(
  snoozedUntil: number,
  now: Date,
  lang: string | null = "en",
): string {
  const at = new Date(snoozedUntil * 1000);
  const locale = lang ?? undefined;
  const time = at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (localDateKey(at) === localDateKey(now)) {
    return translate("schedule.snoozedToday", lang, { time });
  }
  const day = WEEKDAY_SHORT[at.getDay()] ?? "";
  return translate("schedule.snoozedDay", lang, { day, time });
}
