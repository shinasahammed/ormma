/**
 * Frontend entry point for all platform-specific functionality.
 *
 * Architecture (enforced since Phase 1):
 *
 *   React component
 *     -> feature service (`src/features/...`, e.g. `useReminders`)
 *       -> platform.ts (this module: typed wrappers only)
 *         -> Tauri command (invoke)
 *           -> Rust (src-tauri)
 *             -> Linux (SQLite in app-data dir)
 *
 * Components must NOT call `invoke()` directly — add a typed wrapper here.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  AppStatus,
  CreateReminderInput,
  PlatformError,
  PlatformInfo,
  Reminder,
  ReminderFilter,
  ReminderPosition,
  UpdateReminderInput,
} from "../features/reminders/types";

export interface AppInfo {
  readonly name: "Papa.app";
  readonly version: string;
  readonly backend: "Tauri 2 + Rust";
}

export function getAppInfo(): AppInfo {
  return {
    name: "Papa.app",
    version: __APP_VERSION__,
    backend: "Tauri 2 + Rust",
  };
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function describeError(error: unknown): string {
  let text: string;
  if (typeof error === "string") {
    text = error;
  } else if (error instanceof Error) {
    text = error.message;
  } else {
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      text = String(error);
    }
  }
  text = text.trim();
  return text === "" ? " (no details)" : `: ${text}`;
}

function toPlatformError(error: unknown, command: string): PlatformError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    return error as PlatformError;
  }
  // Tauri runtime/IPC failures (ACL denials, missing commands) reject with a
  // plain string. Keep it visible — it is the only clue to the real cause.
  console.error(`[papa.app] ${command} failed:`, error);
  const detail = describeError(error);
  return {
    code: "INTERNAL_ERROR",
    message: `Unexpected failure during ${command}${detail}`,
  };
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    // Opened in a plain browser tab (e.g. localhost:1420) — no backend here.
    throw {
      code: "INTERNAL_ERROR",
      message: "Desktop runtime unavailable — use the Papa.app window, not a browser tab.",
    } satisfies PlatformError;
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toPlatformError(error, command);
  }
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export function getReminders(filter?: ReminderFilter): Promise<Reminder[]> {
  return call<Reminder[]>("get_reminders", { filter: filter ?? null });
}

export function getReminder(id: number): Promise<Reminder> {
  return call<Reminder>("get_reminder", { id });
}

export function createReminder(input: CreateReminderInput): Promise<Reminder> {
  return call<Reminder>("create_reminder", { input });
}

export function updateReminder(input: UpdateReminderInput): Promise<Reminder> {
  return call<Reminder>("update_reminder", { input });
}

export function deleteReminder(id: number): Promise<void> {
  return call<void>("delete_reminder", { id });
}

export function setReminderEnabled(id: number, enabled: boolean): Promise<Reminder> {
  return call<Reminder>("set_reminder_enabled", { id, enabled });
}

/** Snooze `minutes` (0 clears). State persists; the engine refires on elapse. */
export function snoozeReminder(id: number, minutes: number): Promise<Reminder> {
  return call<Reminder>("snooze_reminder", { id, minutes });
}

/** Dev/verify helper: fixed-content notification, no reminder side effects. */
export function triggerReminderTest(): Promise<void> {
  return call<void>("trigger_reminder_test");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings(): Promise<AppSettings> {
  return call<AppSettings>("get_settings");
}

export function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return call<AppSettings>("update_settings", { settings });
}

// ---------------------------------------------------------------------------
// Linux platform integration (Phase 4)
// ---------------------------------------------------------------------------

export function getPlatformInfo(): Promise<PlatformInfo> {
  return call<PlatformInfo>("get_platform_info");
}

export function getAppStatus(): Promise<AppStatus> {
  return call<AppStatus>("get_app_status");
}

export function pauseReminders(): Promise<AppStatus> {
  return call<AppStatus>("pause_reminders");
}

export function resumeReminders(): Promise<AppStatus> {
  return call<AppStatus>("resume_reminders");
}

export function showMainWindow(): Promise<void> {
  return call<void>("show_main_window");
}

export function hideMainWindow(): Promise<void> {
  return call<void>("hide_main_window");
}

export function showReminderWindow(position?: ReminderPosition): Promise<void> {
  return call<void>("show_reminder_window", { position: position ?? null });
}

export function hideReminderWindow(): Promise<void> {
  return call<void>("hide_reminder_window");
}

export function setReminderPosition(position: ReminderPosition): Promise<void> {
  return call<void>("set_reminder_position", { position });
}

/** Applies the autostart preference; resolves with the actual system state. */
export function setAutostart(enabled: boolean): Promise<boolean> {
  return call<boolean>("set_autostart", { enabled });
}

export function quitApp(): Promise<void> {
  return call<void>("quit_app");
}
