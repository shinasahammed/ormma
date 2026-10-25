import type { ReminderFormValues } from "../reminders/validation";

/**
 * Built-in reminder presets (Phase 7): templates, not reminders.
 *
 * ```text
 * Preset → form values → user edits → CreateReminderInput → Reminder
 * ```
 * Nothing is stored in SQLite and selecting a preset never creates a
 * reminder by itself — the form always opens prefilled for review.
 */

export interface PresetDef {
  readonly id: string;
  readonly titleKey: string;
  readonly messageKey: string;
  readonly scheduleType: "daily" | "weekly";
  readonly scheduledTime: string;
  readonly daysOfWeek: readonly number[];
  readonly snoozeDuration: number;
  /** Tone id or "" for the default tone. */
  readonly tone: string;
}

export const PRESETS: readonly PresetDef[] = [
  { id: "drink-water", titleKey: "preset.drinkWater.title", messageKey: "preset.drinkWater.message", scheduleType: "daily", scheduledTime: "10:00", daysOfWeek: [], snoozeDuration: 5, tone: "" },
  { id: "take-break", titleKey: "preset.takeBreak.title", messageKey: "preset.takeBreak.message", scheduleType: "daily", scheduledTime: "15:00", daysOfWeek: [], snoozeDuration: 5, tone: "soft" },
  { id: "stretch", titleKey: "preset.stretch.title", messageKey: "preset.stretch.message", scheduleType: "daily", scheduledTime: "11:00", daysOfWeek: [], snoozeDuration: 5, tone: "" },
  { id: "have-lunch", titleKey: "preset.haveLunch.title", messageKey: "preset.haveLunch.message", scheduleType: "daily", scheduledTime: "12:30", daysOfWeek: [], snoozeDuration: 10, tone: "" },
  { id: "go-outside", titleKey: "preset.goOutside.title", messageKey: "preset.goOutside.message", scheduleType: "daily", scheduledTime: "16:00", daysOfWeek: [], snoozeDuration: 10, tone: "" },
  { id: "wind-down", titleKey: "preset.windDown.title", messageKey: "preset.windDown.message", scheduleType: "daily", scheduledTime: "22:00", daysOfWeek: [], snoozeDuration: 10, tone: "gentle" },
  { id: "call-family", titleKey: "preset.callFamily.title", messageKey: "preset.callFamily.message", scheduleType: "weekly", scheduledTime: "18:00", daysOfWeek: [6], snoozeDuration: 15, tone: "" },
];

/** Expands a preset into editable form values (copies arrays — never aliases). */
export function presetToFormValues(
  preset: PresetDef,
  t: (key: string) => string,
): ReminderFormValues {
  return {
    title: t(preset.titleKey),
    message: t(preset.messageKey),
    kind: "reminder",
    scheduleType: preset.scheduleType,
    scheduledTime: preset.scheduledTime,
    daysOfWeek: [...preset.daysOfWeek],
    snoozeDuration: preset.snoozeDuration,
    tone: preset.tone,
  };
}
