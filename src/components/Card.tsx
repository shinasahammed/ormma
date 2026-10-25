import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Raised surface section used by lists, panels, and settings groups. */
export function Card({ title, action, children, className = "" }: CardProps): JSX.Element {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] ${className}`}
    >
      {(title !== undefined || action !== undefined) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title !== undefined && <h2 className="t-h2">{title}</h2>}
          {action}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
