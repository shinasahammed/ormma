/**
 * Reminder feature service (Phase 2).
 *
 * Sits between React components and `src/lib/platform.ts`:
 *
 *   component -> useReminders (this hook) -> platform.ts -> invoke -> Rust
 *
 * Owns loading/error state and list synchronization after each mutation.
 */

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createReminder,
  deleteReminder,
  getAppStatus,
  getPlatformInfo,
  getReminders,
  getSettings,
  isTauriRuntime,
  pauseReminders,
  resumeReminders,
  setAutostart,
  setReminderEnabled,
  snoozeReminder,
  triggerReminderTest,
  updateReminder,
  updateSettings,
} from "../../lib/platform";
import type {
  AppSettings,
  AppStatus,
  CreateReminderInput,
  PlatformError,
  PlatformInfo,
  Reminder,
  UpdateReminderInput,
} from "./types";

export function toMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as PlatformError).message);
  }
  return "An unexpected error occurred";
}

interface RemindersState {
  readonly reminders: Reminder[];
  readonly settings: AppSettings | null;
  readonly status: AppStatus | null;
  readonly platform: PlatformInfo | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: (opts?: { quiet?: boolean }) => Promise<void>;
  readonly create: (input: CreateReminderInput) => Promise<Reminder | null>;
  readonly update: (input: UpdateReminderInput) => Promise<Reminder | null>;
  readonly remove: (id: number) => Promise<boolean>;
  readonly toggle: (id: number, enabled: boolean) => Promise<boolean>;
  readonly snooze: (id: number, minutes: number) => Promise<boolean>;
  readonly testNotification: () => Promise<boolean>;
  readonly pause: () => Promise<boolean>;
  readonly resume: () => Promise<boolean>;
  readonly setAutostartPref: (enabled: boolean) => Promise<boolean | null>;
  readonly saveSettings: (settings: AppSettings) => Promise<boolean>;
  readonly clearError: () => void;
}

export function useReminders(): RemindersState {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [nextStatus, nextPlatform] = await Promise.all([
        getAppStatus(),
        getPlatformInfo(),
      ]);
      setStatus(nextStatus);
      setPlatform(nextPlatform);
    } catch (err) {
      setError(toMessage(err));
    }
  }, []);

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }): Promise<void> => {
      if (!isTauriRuntime()) {
        setError("Desktop runtime unavailable — launch via Tauri to use reminders.");
        setLoading(false);
        return;
      }
      // Event-driven refreshes skip the loading flash; the list just updates.
      if (opts?.quiet !== true) {
        setLoading(true);
      }
      try {
        const [list, prefs] = await Promise.all([getReminders(), getSettings()]);
        setReminders(list);
        setSettings(prefs);
        setError(null);
      } catch (err) {
        setError(toMessage(err));
      } finally {
        setLoading(false);
      }
      await refreshStatus();
    },
    [refreshStatus],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Native async events: the scheduler fires independently of React, so the
  // list/status refresh when reminders trigger, pause, or resume.
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let disposed = false;
    let unlisteners: Array<() => void> = [];
    void (async () => {
      try {
        const subs = await Promise.all([
          listen("reminder-due", () => {
            void refresh({ quiet: true });
          }),
          listen("reminders-paused", () => {
            void refreshStatus();
          }),
          listen("reminders-resumed", () => {
            void refreshStatus();
            void refresh({ quiet: true });
          }),
        ]);
        if (disposed) {
          subs.forEach((unlisten) => unlisten());
        } else {
          unlisteners = subs;
        }
      } catch {
        // Event backend unavailable (e.g. plain browser dev): ignore.
      }
    })();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [refresh, refreshStatus]);

  const create = useCallback(async (input: CreateReminderInput) => {
    try {
      const created = await createReminder(input);
      setReminders((prev) => [...prev, created]);
      setError(null);
      return created;
    } catch (err) {
      setError(toMessage(err));
      return null;
    }
  }, []);

  const update = useCallback(async (input: UpdateReminderInput) => {
    try {
      const next = await updateReminder(input);
      setReminders((prev) => prev.map((r) => (r.id === next.id ? next : r)));
      setError(null);
      return next;
    } catch (err) {
      setError(toMessage(err));
      return null;
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    try {
      await deleteReminder(id);
      setReminders((prev) => prev.filter((r) => r.id !== id));
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const toggle = useCallback(async (id: number, enabled: boolean) => {
    try {
      const next = await setReminderEnabled(id, enabled);
      setReminders((prev) => prev.map((r) => (r.id === next.id ? next : r)));
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const snooze = useCallback(async (id: number, minutes: number) => {
    try {
      const next = await snoozeReminder(id, minutes);
      setReminders((prev) => prev.map((r) => (r.id === next.id ? next : r)));
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const testNotification = useCallback(async () => {
    try {
      await triggerReminderTest();
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const saveSettings = useCallback(async (prefs: AppSettings) => {
    try {
      const next = await updateSettings(prefs);
      setSettings(next);
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const pause = useCallback(async () => {
    try {
      setStatus(await pauseReminders());
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      setStatus(await resumeReminders());
      setError(null);
      return true;
    } catch (err) {
      setError(toMessage(err));
      return false;
    }
  }, []);

  const setAutostartPref = useCallback(async (enabled: boolean) => {
    try {
      const actual = await setAutostart(enabled);
      setSettings((prev) =>
        prev === null ? prev : { ...prev, autostartEnabled: actual },
      );
      setError(null);
      return actual;
    } catch (err) {
      setError(toMessage(err));
      return null;
    }
  }, []);

  return {
    reminders,
    settings,
    status,
    platform,
    loading,
    error,
    refresh,
    create,
    update,
    remove,
    toggle,
    snooze,
    testNotification,
    pause,
    resume,
    setAutostartPref,
    saveSettings,
    clearError,
  };
}
