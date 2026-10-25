import type { ReactNode } from "react";
import { useTranslation } from "../lib/i18n";
import type { AppStatus } from "../features/reminders/types";

export type AppView = "home" | "reminders" | "settings";

interface ShellProps {
  view: AppView;
  lang: string | null;
  onNavigate: (view: AppView) => void;
  status: AppStatus | null;
  error: string | null;
  onDismissError: () => void;
  onResume: () => void;
  children: ReactNode;
}

const NAV: Array<{ id: AppView; labelKey: string; icon: JSX.Element }> = [
  {
    id: "home",
    labelKey: "nav.home",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M3 8.5 9 3l6 5.5V15H3V8.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M6.5 15v-4h5v4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "reminders",
    labelKey: "nav.reminders",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 2.5a4.5 4.5 0 0 1 4.5 4.5c0 3 1 4 1.5 4.5H3c.5-.5 1.5-1.5 1.5-4.5A4.5 4.5 0 0 1 9 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.5 14a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 1.8v2M9 14.2v2M1.8 9h2M14.2 9h2M3.9 3.9l1.4 1.4M12.7 12.7l1.4 1.4M14.1 3.9l-1.4 1.4M5.3 12.7l-1.4 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** Desktop shell: sidebar navigation, shared error banner, engine status. */
export function Shell({
  view,
  lang,
  onNavigate,
  status,
  error,
  onDismissError,
  onResume,
  children,
}: ShellProps): JSX.Element {
  const { t } = useTranslation(lang);
  const paused = status?.paused ?? false;
  const offline = status === null;
  return (
    <div className="flex h-full bg-paper text-ink">
      <nav aria-label={t("nav.primary")} className="flex w-16 shrink-0 flex-col border-r border-line bg-surface md:w-60">
        <div className="flex items-center gap-2.5 px-3 py-5 md:px-5">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="shrink-0">
            <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--color-accent)" />
            <circle cx="13" cy="11" r="4" fill="var(--color-on-accent)" opacity="0.9" />
            <path d="M5 19 Q 9 16 13 18 T 21 17" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
          </svg>
          <span className="t-h2 hidden md:block">Papa.app</span>
        </div>
        <ul className="flex flex-col gap-1 px-2 md:px-3">
          {NAV.map((item) => {
            const active = view === item.id;
            const label = t(item.labelKey);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  aria-label={label}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {item.icon}
                  <span className="hidden md:block">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto border-t border-line px-3 py-4 md:px-5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${
                offline ? "bg-muted" : paused ? "bg-warning" : "bg-success"
              }`}
            />
            <p className="hidden text-xs text-muted md:block">
              {offline ? (
                t("status.unknown")
              ) : paused ? (
                <>
                  {t("status.paused")} ·{" "}
                  <button type="button" onClick={onResume} className="font-semibold text-ink underline">
                    {t("status.resume")}
                  </button>
                </>
              ) : (
                t("status.active")
              )}
            </p>
          </div>
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8">
          {error !== null && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-line bg-danger-soft px-4 py-3 text-sm text-danger"
            >
              <span>{error}</span>
              <button type="button" onClick={onDismissError} className="shrink-0 font-semibold underline">
                {t("banner.dismiss")}
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
