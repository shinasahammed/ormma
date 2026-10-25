import { useMemo } from "react";
import { en } from "./locales/en";
import type { Dictionary } from "./types";

export const DEFAULT_LOCALE = "en";

/** Registry: add a locale code here together with its dictionary file. */
const LOCALES: Record<string, Dictionary> = { en };

export const AVAILABLE_LOCALES = Object.keys(LOCALES);

/** Normalizes a stored preference ("en", "en-US", …) to a shipped locale. */
export function normalizeLocale(language: unknown): string {
  const base = String(language ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return base !== "" && base in LOCALES ? base : DEFAULT_LOCALE;
}

/**
 * Looks up a key with English fallback and `{name}` interpolation.
 * Never returns undefined — worst case the key itself (never blank UI).
 */
export function translate(
  key: string,
  language?: string | null,
  vars?: Record<string, string | number>,
): string {
  const dict = LOCALES[normalizeLocale(language)] ?? en;
  let template = dict[key] ?? en[key] ?? key;
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) {
      template = template.split(`{${name}}`).join(String(value));
    }
  }
  return template;
}

/** Component binding: `const { t, locale } = useTranslation(settings?.language)`. */
export function useTranslation(language?: string | null): {
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
} {
  const locale = normalizeLocale(language);
  return useMemo(
    () => ({ locale, t: (key: string, vars?: Record<string, string | number>) => translate(key, locale, vars) }),
    [locale],
  );
}
