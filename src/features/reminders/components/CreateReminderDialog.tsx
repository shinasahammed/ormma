import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Modal } from "../../../components/Modal";
import { useTranslation } from "../../../lib/i18n";
import type { useReminders } from "../useReminders";
import { EMPTY_VALUES, toCreateInput, type ReminderFormValues } from "../validation";
import { ReminderForm } from "./ReminderForm";

interface CreateReminderDialogProps {
  open: boolean;
  /** Preset-derived (or empty) starting values; never creates on its own. */
  initial?: ReminderFormValues;
  data: ReturnType<typeof useReminders>;
  onClose: () => void;
}

/** Shared creation dialog used by Home and Reminders screens. */
export function CreateReminderDialog({ open, initial, data, onClose }: CreateReminderDialogProps): JSX.Element {
  const { t } = useTranslation(data.settings?.language);
  const lang = data.settings?.language ?? "en";
  const [pending, setPending] = useState(false);
  // Blank form starts from the user's default snooze (Settings); presets keep
  // their own tuned values.
  const startValues: ReminderFormValues = initial ?? {
    ...EMPTY_VALUES,
    snoozeDuration: data.settings?.snoozeDuration ?? EMPTY_VALUES.snoozeDuration,
  };

  async function handleSubmit(values: ReminderFormValues): Promise<void> {
    setPending(true);
    try {
      const created = await data.create(toCreateInput(values));
      if (created !== null) {
        onClose();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <Modal label={t("form.addTitle")} onClose={onClose}>
          <h2 className="t-h1">{t("form.addTitle")}</h2>
          <p className="t-body mt-1 text-muted">{t("form.addSubtitle")}</p>
          <div className="mt-4">
            <ReminderForm
              initial={startValues}
              lang={lang}
              submitLabel={pending ? t("form.adding") : t("form.addSubmit")}
              pending={pending}
              serverError={data.error}
              onSubmit={(values) => void handleSubmit(values)}
              onCancel={onClose}
            />
          </div>
        </Modal>
      )}
    </AnimatePresence>
  );
}
