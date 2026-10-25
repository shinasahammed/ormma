import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Shell, type AppView } from "./components/Shell";
import { HomeScreen } from "./features/home/HomeScreen";
import { RemindersScreen } from "./features/reminders/RemindersScreen";
import { useReminders } from "./features/reminders/useReminders";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { applyThemeClass, normalizeTheme, resolveTheme } from "./lib/theme";

export default function App(): JSX.Element {
  const data = useReminders();
  const [view, setView] = useState<AppView>("home");
  const [now, setNow] = useState(() => new Date());

  // "Today" must not go stale across sleep/wake or long sessions: refresh the
  // clock whenever the window becomes visible again.
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Applies the persisted theme (light/dark/system, invalid-safe) to <html>
  // for Tailwind's class-based dark mode. No OS polling — media listener only.
  useEffect(() => {
    const preference = normalizeTheme(data.settings?.theme);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    applyThemeClass(resolveTheme(preference, query.matches));
    if (preference !== "system") {
      return;
    }
    const onChange = (event: MediaQueryListEvent): void => {
      applyThemeClass(resolveTheme(preference, event.matches));
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [data.settings?.theme]);

  return (
    <MotionConfig reducedMotion={data.settings?.reducedMotion === true ? "always" : "never"}>
      <Shell
        view={view}
        lang={data.settings?.language ?? null}
        onNavigate={setView}
        status={data.status}
        error={data.error}
        onDismissError={data.clearError}
        onResume={() => void data.resume()}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {view === "home" && <HomeScreen data={data} now={now} />}
            {view === "reminders" && <RemindersScreen data={data} now={now} />}
            {view === "settings" && <SettingsScreen data={data} />}
          </motion.div>
        </AnimatePresence>
      </Shell>
    </MotionConfig>
  );
}
