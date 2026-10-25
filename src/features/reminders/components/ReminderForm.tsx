import { useState } from "react";
import { Button } from "../../../components/Button";
import { SelectField, TextField } from "../../../components/Field";
import { useTranslation } from "../../../lib/i18n";
import { TONE_IDS } from "../../tones/tones";
import type { ReminderKind, ScheduleType } from "../types";
import {
  defaultTimeFor,
  validateReminderForm,
  type FormErrors,
  type ReminderFormValues,
} from "../validation";
import { WEEK_ORDER_MONDAY_FIRST } from "../utils";

interface ReminderFormProps {
  initial: ReminderFormValues;
  lang: string | null;
  submitLabel: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: ReminderFormValues) => void;
  onCancel: () => void;
}

const NARROW_DAY: Record<number, string> = { 0: "S", 1: "M", 2: "T", 3: "W", 4: "T", 5: "F", 6: "S" };
const DAY_KEY: Record<number, string> = {
  0: "day.sunday", 1: "day.monday", 2: "day.tuesday", 3: "day.wednesday",
  4: "day.thursday", 5: "day.friday", 6: "day.saturday",
};

/** Shared create/edit form — one implementation, two modes. */
export function ReminderForm({
  initial,
  lang,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: ReminderFormProps): JSX.Element {
  const { t } = useTranslation(lang);
  const [values, setValues] = useState<ReminderFormValues>(initial);
  const [errors, setErrors] = useState<FormErrors>({});

  function set<K extends keyof ReminderFormValues>(key: K, value: ReminderFormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function changeSchedule(scheduleType: ScheduleType): void {
    setValues((prev) => ({
      ...prev,
      scheduleType,
      scheduledTime: defaultTimeFor(scheduleType),
      daysOfWeek: scheduleType === "weekly" ? prev.daysOfWeek : [],
    }));
    setErrors((prev) => ({ ...prev, scheduledTime: undefined, daysOfWeek: undefined }));
  }

  function toggleDay(day: number): void {
    const next = values.daysOfWeek.includes(day)
      ? values.daysOfWeek.filter((d) => d !== day)
      : [...values.daysOfWeek, day];
    set("daysOfWeek", next);
  }

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const found = validateReminderForm(values, lang);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onSubmit(values);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        id="reminder-title"
        label={t("form.title")}
        placeholder={t("form.titlePlaceholder")}
        value={values.title}
        maxLength={201}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title}
        required
      />

      <div>
        <label htmlFor="reminder-message" className="t-label text-muted">
          {t("form.message")} <span className="font-normal normal-case">{t("form.messageOptional")}</span>
        </label>
        <textarea
          id="reminder-message"
          rows={2}
          placeholder={t("form.messagePlaceholder")}
          value={values.message}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={errors.message !== undefined}
          className="mt-1.5 w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted aria-[invalid=true]:border-danger"
        />
        {errors.message !== undefined && (
          <p role="alert" className="t-caption mt-1 text-danger">
            {errors.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="reminder-kind"
          label={t("form.kind")}
          value={values.kind}
          onChange={(e) => set("kind", e.target.value as ReminderKind)}
        >
          <option value="reminder">{t("form.kindReminder")}</option>
          <option value="alarm">{t("form.kindAlarm")}</option>
        </SelectField>
        <SelectField
          id="reminder-schedule"
          label={t("form.repeats")}
          value={values.scheduleType}
          onChange={(e) => changeSchedule(e.target.value as ScheduleType)}
        >
          <option value="once">{t("form.once")}</option>
          <option value="daily">{t("form.daily")}</option>
          <option value="weekly">{t("form.weekly")}</option>
        </SelectField>
      </div>

      <TextField
        id="reminder-time"
        label={values.scheduleType === "once" ? t("form.dateAndTime") : t("form.time")}
        type={values.scheduleType === "once" ? "datetime-local" : "time"}
        // Native picker widgets render per the element language: en-GB forces
        // 24-hour display. The value stays "HH:MM" either way.
        lang="en-GB"
        value={values.scheduledTime}
        onChange={(e) => set("scheduledTime", e.target.value)}
        error={errors.scheduledTime}
        required
      />

      {values.scheduleType === "weekly" && (
        <fieldset>
          <legend className="t-label text-muted">{t("form.days")}</legend>
          <div className="mt-2 flex gap-1.5" role="group" aria-label={t("form.days")}>
            {WEEK_ORDER_MONDAY_FIRST.map((day) => {
              const active = values.daysOfWeek.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  aria-label={t(DAY_KEY[day] ?? "form.days")}
                  title={t(DAY_KEY[day] ?? "form.days")}
                  onClick={() => toggleDay(day)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    active
                      ? "bg-accent text-on-accent"
                      : "border border-line bg-paper text-muted hover:text-ink"
                  }`}
                >
                  {NARROW_DAY[day]}
                </button>
              );
            })}
          </div>
          {errors.daysOfWeek !== undefined && (
            <p role="alert" className="t-caption mt-1.5 text-danger">
              {errors.daysOfWeek}
            </p>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="reminder-snooze"
          label={t("form.snooze")}
          type="number"
          min={0}
          max={180}
          value={values.snoozeDuration}
          onChange={(e) => set("snoozeDuration", Number(e.target.value))}
          error={errors.snoozeDuration}
        />
        <SelectField
          id="reminder-tone"
          label={t("form.tone")}
          value={values.tone}
          onChange={(e) => set("tone", e.target.value)}
          error={errors.tone}
          hint={t("form.toneHint")}
        >
          <option value="">{t("form.toneDefault")}</option>
          {TONE_IDS.map((id) => (
            <option key={id} value={id}>
              {t(`tone.${id}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {serverError !== null && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t("form.cancel")}
        </Button>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
