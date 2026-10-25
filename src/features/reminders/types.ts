/**
 * Shared reminder domain types (Phase 2).
 *
 * Single source of truth for the frontend. Field names and shapes mirror the
 * Rust models in `src-tauri/src/models.rs` (serde `camelCase`); do not
 * redefine these in components.
 */

export type ReminderKind = "reminder" | "alarm";
export type ScheduleType = "once" | "daily" | "weekly";
import type { ThemePreference as CanonicalThemePreference } from "../../lib/theme";

/** Canonical theme preference (defined once in lib/theme, re-exported here). */
export type ThemePreference = CanonicalThemePreference;

export interface Reminder {
  readonly id: number;
  title: string;
  message: string | null;
  kind: ReminderKind;
  enabled: boolean;
  scheduleType: ScheduleType;
  /** "HH:MM" for daily/weekly, "YYYY-MM-DDTHH:MM" for once. */
  scheduledTime: string;
  /** Sorted weekdays 0 (Sun)..6 (Sat); null unless weekly. */
  daysOfWeek: number[] | null;
  /** Snooze length in minutes. */
  snoozeDuration: number;
  /** Tone id; null = default tone. */
  tone: string | null;
  /** Unix epoch seconds. */
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt: number | null;
  /** Snooze state (Phase 3): epoch seconds when the snooze elapses; null = not snoozed. */
  snoozedUntil: number | null;
}

export interface CreateReminderInput {
  title: string;
  message?: string | null;
  kind: ReminderKind;
  enabled: boolean;
  scheduleType: ScheduleType;
  scheduledTime: string;
  daysOfWeek?: number[] | null;
  snoozeDuration: number;
  tone?: string | null;
}

export interface UpdateReminderInput {
  id: number;
  title?: string;
  /** Omit = unchanged; "" clears to null. */
  message?: string | null;
  kind?: ReminderKind;
  enabled?: boolean;
  scheduleType?: ScheduleType;
  scheduledTime?: string;
  /** Omit = unchanged; [] clears to null. */
  daysOfWeek?: number[] | null;
  snoozeDuration?: number;
  /** Omit = unchanged; "" clears to null. */
  tone?: string | null;
}

export interface ReminderFilter {
  enabledOnly?: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  language: string;
  defaultTone: string;
  notificationsEnabled: boolean;
  autostartEnabled: boolean;
  launchMinimized: boolean;
  snoozeDuration: number;
  reducedMotion: boolean;
  /** Custom companion image (data URL, resized client-side) or null = Pip. */
  companionAvatar: string | null;
  /** Popup on-screen lifetime in seconds (auto-dismiss). */
  popupDurationSecs: number;
}

/** Structured error returned by every Rust command: `{ code, message }`. */
export interface PlatformError {
  readonly code:
    | "DATABASE_ERROR"
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "INVALID_REMINDER"
    | "INTERNAL_ERROR";
  readonly message: string;
}

/** Native scheduler/window state (authoritative in Rust). */
export interface AppStatus {
  paused: boolean;
  schedulerRunning: boolean;
}

/** Linux runtime environment detected natively. */
export interface PlatformInfo {
  os: string;
  desktop: string;
  displayServer: string;
}

export type ReminderPosition = "top-right" | "top-center" | "bottom-right" | "bottom-center";

/** Payload of the `reminder-due` event emitted per fired reminder. */
export interface ReminderDuePayload {
  id: number;
  title: string;
  message: string | null;
  kind: string;
  scheduleType: string;
  scheduledTime: string;
  daysOfWeek: number[] | null;
  /** The reminder's own snooze length in minutes (0 = none configured). */
  snoozeDuration: number;
  tone: string | null;
}
