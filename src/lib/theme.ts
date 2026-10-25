/**
 * Canonical theme preference (single definition; features re-export it).
 * Unknown persisted values normalize to "system" — never a broken UI.
 */
export type ThemePreference = "light" | "dark" | "system";

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/** Resolves the effective theme. Pure — unit-tested, used by main + popup. */
export function resolveTheme(preference: ThemePreference, osPrefersDark: boolean): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return osPrefersDark ? "dark" : "light";
}

/** Applies the resolved theme to <html> for Tailwind's class dark mode. */
export function applyThemeClass(theme: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
