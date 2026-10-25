import { AnimatePresence, motion } from "framer-motion";
import type { Reminder } from "../types";
import { byScheduledTime } from "../utils";
import { ReminderCard } from "./ReminderCard";

interface ReminderListProps {
  reminders: Reminder[];
  lang: string | null;
  onToggle: (id: number, enabled: boolean) => Promise<boolean>;
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}

/** Animated, time-ordered reminder list (empty state is the caller's job). */
export function ReminderList({ reminders, lang, onToggle, onEdit, onDelete }: ReminderListProps): JSX.Element {
  const ordered = reminders.slice().sort(byScheduledTime);
  return (
    <motion.div layout className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {ordered.map((reminder) => (
          <ReminderCard
            key={reminder.id}
            reminder={reminder}
            lang={lang}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
