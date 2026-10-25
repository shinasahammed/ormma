import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const CONTROL =
  "w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted aria-[invalid=true]:border-danger";

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function FieldShell({ id, label, error, hint, children }: FieldShellProps): JSX.Element {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="t-label text-muted">
        {label}
      </label>
      {children}
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="t-caption text-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role="alert" className="t-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ id, label, error, hint, ...rest }: TextFieldProps): JSX.Element {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined}
        className={CONTROL}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function SelectField({ id, label, error, hint, children, ...rest }: SelectFieldProps): JSX.Element {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : hint !== undefined ? `${id}-hint` : undefined}
        className={CONTROL}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
