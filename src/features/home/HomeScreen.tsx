import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { Toggle } from "../../components/Toggle";
import { useTranslation } from "../../lib/i18n";
import { CreateReminderDialog } from "../reminders/components/CreateReminderDialog";
import type { useReminders } from "../reminders/useReminders";
import { describeSnoozeUntil, greetingForHour, timeOfDay, todaysReminders } from "../reminders/utils";

interface HomeScreenProps {
  data: ReturnType<typeof useReminders>;
  now: Date;
}

/** Companion dashboard: greeting, pause state, and today's firing set. */
export function HomeScreen({ data, now }: HomeScreenProps): JSX.Element {
  const { t, locale } = useTranslation(data.settings?.language);
  const [adding, setAdding] = useState(false);
  const today = todaysReminders(data.reminders, now);
  const paused = data.status?.paused ?? false;

  return (
    <div>
      <h1 className="t-display">
        {greetingForHour(now.getHours())}
      </h1>
      <p className="t-body mt-1 text-muted">
        {now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })} ·{" "}
        {today.length === 0
          ? t("home.clearDay")
          : today.length === 1
            ? t("home.todayOne")
            : t("home.todayMany", { count: today.length })}
      </p>

      {paused && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-warning-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning">{t("home.pausedTitle")}</p>
            <p className="t-body mt-0.5 text-muted">
              {t("home.pausedCopy")}
            </p>
          </div>
          <Button variant="secondary" onClick={() => void data.resume()}>
            {t("home.resume")}
          </Button>
        </div>
      )}

      <Card title={t("home.todayTitle")} className="mt-5">
        {data.loading ? (
          <p className="t-body py-6 text-center text-muted" role="status">
            {t("home.loading")}
          </p>
        ) : today.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            copy={t("home.emptyCopy")}
            actionLabel={t("home.add")}
            onAction={() => setAdding(true)}
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {today.map((reminder) => (
              <motion.li
                key={reminder.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-raised"
              >
                <span className="w-14 shrink-0 rounded-lg bg-raised px-2 py-1 text-center text-xs font-semibold tabular-nums">
                  {timeOfDay(reminder.scheduledTime)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{reminder.title}</span>
                  {reminder.snoozedUntil !== null && (
                    <span className="t-caption text-warning">
                      {describeSnoozeUntil(reminder.snoozedUntil, now, locale)}
                    </span>
                  )}
                </span>
                <Toggle
                  checked={reminder.enabled}
                  label={reminder.enabled ? t("card.disableLabel", { title: reminder.title }) : t("card.enableLabel", { title: reminder.title })}
                  onChange={(next) => void data.toggle(reminder.id, next)}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setAdding(true)}>
          {t("home.add")}
        </Button>
        <Button variant="ghost" onClick={() => void data.testNotification()}>
          {t("home.testNotification")}
        </Button>
      </div>

      <CreateReminderDialog open={adding} data={data} onClose={() => setAdding(false)} />
    </div>
  );
}
