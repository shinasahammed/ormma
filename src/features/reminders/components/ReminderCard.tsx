import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../../components/Button";
import { Toggle } from "../../../components/Toggle";
import { useTranslation } from "../../../lib/i18n";
import type { Reminder } from "../types";
import { describeSchedule, describeSnoozeUntil } from "../utils";

interface ReminderCardProps {
  reminder: Reminder;
  now: Date;
  lang: string | null;
  onToggle: (id: number, enabled: boolean) => Promise<boolean>;
  onSnooze: (id: number, minutes: number) => Promise<boolean>;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}

/**
 * Self-explanatory reminder row: name, message, schedule, snooze, state and
 * actions without opening anything. Toggle applies pessimistically (previous
 * state stays until the backend confirms, so failure needs no rollback).
 */
export function ReminderCard({ reminder, now, lang, onToggle, onSnooze, onEdit, onDelete }: ReminderCardProps): JSX.Element {
  const { t } = useTranslation(lang);
  const [busy, setBusy] = useState(false);

  async function handleToggle(next: boolean): Promise<void> {
    setBusy(true);
    try {
      await onToggle(reminder.id, next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      aria-label={t("card.label", { title: reminder.title })}
      className={`rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-opacity ${
        reminder.enabled ? "" : "opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{reminder.title}</h3>
          {reminder.message !== null && (
            <p className="t-body mt-0.5 line-clamp-2 text-muted">{reminder.message}</p>
          )}
          <p className="t-caption mt-1.5 text-muted">{describeSchedule(reminder, lang)}</p>
          {reminder.snoozedUntil !== null && (
            <p className="mt-1.5 inline-block rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
              {describeSnoozeUntil(reminder.snoozedUntil, now, lang)}
            </p>
          )}
          {!reminder.enabled && (
            <p className="t-caption mt-1.5 text-muted">{t("card.disabledNote")}</p>
          )}
        </div>
        <Toggle
          checked={reminder.enabled}
          disabled={busy}
          label={reminder.enabled ? t("card.disableLabel", { title: reminder.title }) : t("card.enableLabel", { title: reminder.title })}
          onChange={(next) => void handleToggle(next)}
        />
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
        <Button
          variant="ghost"
          disabled={!reminder.enabled}
          onClick={() => void onSnooze(reminder.id, reminder.snoozeDuration)}
          className="px-2.5 py-1 text-xs"
        >
          {t("card.snooze", { minutes: reminder.snoozeDuration })}
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => onEdit(reminder)} className="px-2.5 py-1 text-xs">
          {t("card.edit")}
        </Button>
        <Button variant="ghost" onClick={() => onDelete(reminder)} className="px-2.5 py-1 text-xs text-danger">
          {t("card.delete")}
        </Button>
      </div>
    </motion.article>
  );
}
