import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-ink",
  danger: "border border-line text-danger hover:bg-danger-soft",
};

/** Single button component for the whole app (a11y: native button). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading = false, disabled, className = "", children, ...rest },
  ref,
): JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled ?? loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
