import { translate } from "../../lib/i18n";
import type {
  CreateReminderInput,
  ReminderKind,
  ScheduleType,
} from "./types";

/**
 * Frontend validation mirroring `src-tauri/src/models.rs`. Instant feedback
 * only — the Rust backend remains authoritative and its errors surface
 * through the hook's error banner.
 */

export interface ReminderFormValues {
  title: string;
  message: string;
  kind: ReminderKind;
  scheduleType: ScheduleType;
  scheduledTime: string;
  daysOfWeek: number[];
  tone: string;
}

export type FormErrors = Partial<
  Record<"title" | "scheduledTime" | "daysOfWeek" | "message" | "tone", string>
>;

export const EMPTY_VALUES: ReminderFormValues = {
  title: "",
  message: "",
  kind: "reminder",
  scheduleType: "daily",
  scheduledTime: "10:00",
  daysOfWeek: [1],
  tone: "",
};

function charCount(text: string): number {
  return Array.from(text).length;
}

export function defaultTimeFor(scheduleType: ScheduleType, now = new Date()): string {
  if (scheduleType === "once") {
    const pad = (n: number): string => String(n).padStart(2, "0");
    const plusOneHour = new Date(now.getTime() + 60 * 60 * 1000);
    return `${plusOneHour.getFullYear()}-${pad(plusOneHour.getMonth() + 1)}-${pad(plusOneHour.getDate())}T${pad(plusOneHour.getHours())}:${pad(plusOneHour.getMinutes())}`;
  }
  return "10:00";
}

export function validateReminderForm(
  values: ReminderFormValues,
  lang: string | null = "en",
): FormErrors {
  const errors: FormErrors = {};
  const t = (key: string): string => translate(key, lang);

  const title = values.title.trim();
  if (title.length === 0) {
    errors.title = t("validation.titleRequired");
  } else if (charCount(title) > 200) {
    errors.title = t("validation.titleLong");
  }

  if (charCount(values.message) > 2000) {
    errors.message = t("validation.messageLong");
  }

  if (values.scheduleType === "once") {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.scheduledTime)) {
      errors.scheduledTime = t("validation.dateTimeInvalid");
    }
  } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(values.scheduledTime)) {
    errors.scheduledTime = t("validation.timeInvalid");
  }

  if (values.scheduleType === "weekly") {
    if (values.daysOfWeek.length === 0) {
      errors.daysOfWeek = t("validation.daysRequired");
    } else if (values.daysOfWeek.some((day) => day < 0 || day > 6)) {
      errors.daysOfWeek = t("validation.daysInvalid");
    }
  }

  if (charCount(values.tone) > 100) {
    errors.tone = t("validation.toneLong");
  }

  return errors;
}

/** Normalizes form state into backend input (trims, nulls empties). */
export function toCreateInput(values: ReminderFormValues): CreateReminderInput {
  const message = values.message.trim();
  const tone = values.tone.trim();
  return {
    title: values.title.trim(),
    message: message.length === 0 ? null : message,
    kind: values.kind,
    enabled: true,
    scheduleType: values.scheduleType,
    scheduledTime: values.scheduledTime,
    daysOfWeek: values.scheduleType === "weekly" ? [...values.daysOfWeek].sort((a, b) => a - b) : null,
    tone: tone.length === 0 ? null : tone,
  };
}
