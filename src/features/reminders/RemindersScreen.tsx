import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Modal } from "../../components/Modal";
import { useTranslation } from "../../lib/i18n";
import { PRESETS, presetToFormValues, type PresetDef } from "../presets/presets";
import type { Reminder } from "./types";
import type { useReminders } from "./useReminders";
import type { ReminderFormValues } from "./validation";
import { CreateReminderDialog } from "./components/CreateReminderDialog";
import { ReminderForm } from "./components/ReminderForm";
import { ReminderList } from "./components/ReminderList";

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; preset?: PresetDef }
  | { mode: "edit"; reminder: Reminder }
  | { mode: "delete"; reminder: Reminder };

interface RemindersScreenProps {
  data: ReturnType<typeof useReminders>;
  now: Date;
}

function editInitial(reminder: Reminder): ReminderFormValues {
  return {
    title: reminder.title,
    message: reminder.message ?? "",
    kind: reminder.kind as ReminderFormValues["kind"],
    scheduleType: reminder.scheduleType,
    scheduledTime: reminder.scheduledTime,
    daysOfWeek: reminder.daysOfWeek ?? [],
    snoozeDuration: reminder.snoozeDuration,
    tone: reminder.tone ?? "",
  };
}

/** Full reminder management: presets, list, shared create/edit form, delete confirm. */
export function RemindersScreen({ data, now }: RemindersScreenProps): JSX.Element {
  const { t } = useTranslation(data.settings?.language);
  const lang = data.settings?.language ?? "en";
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [pending, setPending] = useState(false);

  async function handleEdit(reminder: Reminder, values: ReminderFormValues): Promise<void> {
    setPending(true);
    try {
      const saved = await data.update({
        id: reminder.id,
        title: values.title.trim(),
        message: values.message.trim().length === 0 ? "" : values.message.trim(),
        kind: values.kind,
        scheduleType: values.scheduleType,
        scheduledTime: values.scheduledTime,
        daysOfWeek: values.scheduleType === "weekly" ? [...values.daysOfWeek] : [],
        snoozeDuration: values.snoozeDuration,
        tone: values.tone.trim().length === 0 ? "" : values.tone.trim(),
      });
      if (saved !== null) {
        setDialog({ mode: "closed" });
      }
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(reminder: Reminder): Promise<void> {
    setPending(true);
    try {
      if (await data.remove(reminder.id)) {
        setDialog({ mode: "closed" });
      }
    } finally {
      setPending(false);
    }
  }

  const activeCount = data.reminders.filter((r) => r.enabled).length;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="t-h1">{t("reminders.title")}</h1>
          <p className="t-body mt-0.5 text-muted">
            {data.reminders.length === 0
              ? t("reminders.subtitleEmpty")
              : t("reminders.subtitleActive", { active: activeCount, total: data.reminders.length })}
          </p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ mode: "create" })}>
          {t("reminders.add")}
        </Button>
      </div>

      <div className="mt-4">
        <p className="t-label mb-2 text-muted">{t("reminders.presetsTitle")}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setDialog({ mode: "create", preset })}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent-strong"
            >
              {t(preset.titleKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {data.loading ? (
          <p className="t-body py-10 text-center text-muted" role="status">
            {t("reminders.loading")}
          </p>
        ) : data.reminders.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
            <EmptyState
              title={t("reminders.emptyTitle")}
              copy={t("reminders.emptyCopy")}
              actionLabel={t("reminders.emptyAction")}
              onAction={() => setDialog({ mode: "create" })}
            />
          </div>
        ) : (
          <ReminderList
            reminders={data.reminders}
            now={now}
            lang={lang}
            onToggle={data.toggle}
            onSnooze={data.snooze}
            onEdit={(reminder) => setDialog({ mode: "edit", reminder })}
            onDelete={(reminder) => setDialog({ mode: "delete", reminder })}
          />
        )}
      </div>

      <CreateReminderDialog
        open={dialog.mode === "create"}
        initial={
          dialog.mode === "create" && dialog.preset !== undefined
            ? presetToFormValues(dialog.preset, t)
            : undefined
        }
        key={dialog.mode === "create" && dialog.preset !== undefined ? dialog.preset.id : "blank"}
        data={data}
        onClose={() => setDialog({ mode: "closed" })}
      />

      <AnimatePresence>
        {dialog.mode === "edit" && (
          <Modal label={t("reminders.editTitle")} onClose={() => setDialog({ mode: "closed" })}>
            <h2 className="t-h1">{t("reminders.editTitle")}</h2>
            <div className="mt-4">
              <ReminderForm
                key={dialog.reminder.id}
                initial={editInitial(dialog.reminder)}
                lang={lang}
                submitLabel={pending ? t("reminders.saving") : t("form.saveSubmit")}
                pending={pending}
                serverError={data.error}
                onSubmit={(values) => void handleEdit(dialog.reminder, values)}
                onCancel={() => setDialog({ mode: "closed" })}
              />
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialog.mode === "delete" && (
          <ConfirmDialog
            title={t("reminders.deleteTitle")}
            copy={t("reminders.deleteCopy", { title: dialog.reminder.title })}
            confirmLabel={pending ? t("reminders.deleting") : t("card.delete")}
            cancelLabel={t("form.cancel")}
            pending={pending}
            onConfirm={() => void handleDelete(dialog.reminder)}
            onCancel={() => setDialog({ mode: "closed" })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
