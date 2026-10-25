import { motion } from "framer-motion";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Accessible switch (button + role=switch, never a clickable div). */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-line"
      }`}
    >
      <motion.span
        aria-hidden="true"
        className="absolute top-0.5 left-0.5 block h-5 w-5 rounded-full bg-white shadow"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
      />
    </button>
  );
}
