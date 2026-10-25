import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "../../lib/i18n";
import { applyThemeClass, normalizeTheme, resolveTheme } from "../../lib/theme";
import {
  getSettings,
  hideReminderWindow,
  isTauriRuntime,
  snoozeReminder,
} from "../../lib/platform";
import { toMessage } from "../reminders/useReminders";
import type { AppSettings } from "../reminders/types";
import { playTone } from "../tones/audio";
import { resolveTone } from "../tones/tones";
import {
  POPUP_EXIT_DELAY_MS,
  POPUP_EXIT_DELAY_REDUCED_MS,
  resolveMotion,
  resolvePopupDismissMs,
  type MotionPreference,
} from "./motion";
import { advance, enqueue, EMPTY_QUEUE, type PopupQueue } from "./queue";
import { validatePopupPayload } from "./types";

export const SNOOZE_PRESETS = [5, 10, 15, 30, 60] as const;

interface ReminderPopupState {
  readonly currentId: number | null;
  readonly queue: PopupQueue;
  readonly leaving: boolean;
  readonly snoozeOpen: boolean;
  readonly snoozing: boolean;
  readonly error: string | null;
  readonly motion: MotionPreference;
  readonly avatar: string | null;
  readonly t: (key: string, vars?: Record<string, string | number>) => string;
  readonly locale: string;
  readonly done: () => void;
  readonly close: () => void;
  readonly toggleSnoozeMenu: () => void;
  readonly snooze: (minutes: number) => void;
  readonly clearError: () => void;
}

/**
 * Popup presentation controller. Owns the in-memory queue, exit sequencing,
 * and Done/Snooze/Close actions. Decides nothing about due-ness: the Rust
 * scheduler already consumed the occurrence before the event arrives, so
 * Done/Close purely dismiss presentation (documented, no hidden states).
 */
export function useReminderPopup(): ReminderPopupState {
  const [queue, setQueue] = useState<PopupQueue>(EMPTY_QUEUE);
  const [leaving, setLeaving] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motion, setMotion] = useState<MotionPreference>("never");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { t, locale } = useTranslation(settings?.language);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const leavingRef = useRef(false);
  const hideTimer = useRef<number | null>(null);

  const refreshSettings = useCallback(async (): Promise<void> => {
    if (!isTauriRuntime()) {
      return;
    }
    try {
      const next = await getSettings();
      setSettings(next);
      setMotion(
        resolveMotion(
          next.reducedMotion,
          window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      );
      applyThemeClass(
        resolveTheme(
          normalizeTheme(next.theme),
          window.matchMedia("(prefers-color-scheme: dark)").matches,
        ),
      );
    } catch {
      // Backend unreachable (plain browser dev): keep defaults.
    }
  }, []);

  // Native event intake + settings lifecycle. The webview lives as long as
  // the app (hidden, never destroyed), so one subscription covers everything.
  useEffect(() => {
    void refreshSettings();
    if (!isTauriRuntime()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const stop = await listen("reminder-due", (event) => {
          const payload = validatePopupPayload(event.payload);
          if (payload === null) {
            return;
          }
          setQueue((prev) => enqueue(prev, payload));
          setError(null);
        });
        if (disposed) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch {
        // Event backend unavailable: ignore.
      }
    })();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemTheme = (): void => {
      void refreshSettings();
    };
    media.addEventListener("change", onSystemTheme);
    return () => {
      disposed = true;
      unlisten?.();
      media.removeEventListener("change", onSystemTheme);
      if (hideTimer.current !== null) {
        window.clearTimeout(hideTimer.current);
      }
    };
  }, [refreshSettings]);

  // Fresh prefs (theme, motion, language, tone default) for every presentation.
  const currentId = queue.current?.id ?? null;
  useEffect(() => {
    if (currentId !== null) {
      void refreshSettings();
    }
  }, [currentId, refreshSettings]);

  // Tone playback: presentation layer only, after settings are known.
  // Skipped when notifications are disabled; failure is silent by design
  // (audio must never block or crash the popup).
  const playedToneFor = useRef<number | null>(null);
  useEffect(() => {
    if (currentId === null) {
      // The webview outlives every presentation: forget the last tone so the
      // same reminder (next day, or after a snooze) plays again.
      playedToneFor.current = null;
      return;
    }
    if (!isTauriRuntime() || playedToneFor.current === currentId) {
      return;
    }
    playedToneFor.current = currentId;
    void (async () => {
      // Read prefs at presentation time: the cached copy may predate a mute
      // or tone change made in the main window.
      let prefs = settings;
      try {
        prefs = await getSettings();
      } catch {
        // Keep the cached copy.
      }
      if (prefs === null || !prefs.notificationsEnabled) {
        return;
      }
      const current = queueRef.current.current;
      if (current === null || current.id !== currentId) {
        return;
      }
      void playTone(resolveTone(current.tone, prefs.defaultTone));
    })();
    // `settings` is deliberately not a dependency: the tone must play once per
    // presentation, not again when the prefs refresh.
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishDismissal = useCallback((): void => {
    const reduced = motionRef.current === "always";
    const delay = reduced ? POPUP_EXIT_DELAY_REDUCED_MS : POPUP_EXIT_DELAY_MS;
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => {
      const next = advance(queueRef.current);
      setQueue(next);
      setLeaving(false);
      leavingRef.current = false;
      setSnoozeOpen(false);
      if (next.current === null) {
        void hideReminderWindow().catch(() => undefined);
      }
    }, delay);
  }, []);

  const dismissCurrent = useCallback((): void => {
    if (leavingRef.current || queueRef.current.current === null) {
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    finishDismissal();
  }, [finishDismissal]);

  // Auto-dismiss: each presentation floats for the configured duration,
  // then advances exactly like Done. Paused while the snooze menu is open
  // (choosing must never race dismissal) and restarted fresh for every
  // queued reminder.
  const dismissMs = resolvePopupDismissMs(settings?.popupDurationSecs);
  useEffect(() => {
    if (currentId === null || snoozeOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!leavingRef.current && queueRef.current.current?.id === currentId) {
        dismissCurrent();
      }
    }, dismissMs);
    return () => window.clearTimeout(timer);
  }, [currentId, snoozeOpen, dismissCurrent, dismissMs]);

  const snooze = useCallback(
    (minutes: number): void => {
      const current = queueRef.current.current;
      if (current === null || leavingRef.current) {
        return;
      }
      setSnoozing(true);
      void (async () => {
        try {
          await snoozeReminder(current.id, minutes);
          setError(null);
          dismissCurrent();
        } catch (err) {
          // Failure preserves the popup: message stays, retry allowed.
          setError(toMessage(err));
        } finally {
          setSnoozing(false);
        }
      })();
    },
    [dismissCurrent],
  );

  const toggleSnoozeMenu = useCallback((): void => {
    setError(null);
    setSnoozeOpen((open) => !open);
  }, []);

  const clearError = useCallback((): void => setError(null), []);

  return {
    currentId,
    queue,
    leaving,
    snoozeOpen,
    snoozing,
    error,
    motion,
    avatar: settings?.companionAvatar ?? null,
    t,
    locale,
    done: dismissCurrent,
    close: dismissCurrent,
    toggleSnoozeMenu,
    snooze,
    clearError,
  };
}
