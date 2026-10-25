import { motion } from "framer-motion";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  copy: string;
  actionLabel: string;
  onAction: () => void;
}

/** Welcoming empty state with original line-art (sun over calm ridges). */
export function EmptyState({ title, copy, actionLabel, onAction }: EmptyStateProps): JSX.Element {
  return (
    <motion.div
      className="flex flex-col items-center px-6 py-12 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <svg
        width="120"
        height="84"
        viewBox="0 0 120 84"
        fill="none"
        role="img"
        aria-label="Calm sunrise illustration"
      >
        <circle cx="60" cy="38" r="16" fill="var(--color-accent-soft)" />
        <circle cx="60" cy="38" r="9" fill="var(--color-accent)" opacity="0.85" />
        <path d="M8 58 Q 30 48 52 56 T 96 54 T 112 56" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
        <path d="M14 68 Q 36 60 58 66 T 106 64" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        <path d="M24 76 Q 46 70 68 74 T 98 73" stroke="var(--color-line)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3 className="t-h1 mt-4">{title}</h3>
      <p className="t-body mt-2 max-w-sm text-muted">{copy}</p>
      <Button variant="primary" onClick={onAction} className="mt-5">
        {actionLabel}
      </Button>
    </motion.div>
  );
}
