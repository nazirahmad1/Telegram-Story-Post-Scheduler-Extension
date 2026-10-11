export const THEME_STORAGE_KEY = "storyExtension.theme" as const;

/**
 * "system" means "no explicit choice yet — follow the OS/browser setting".
 * The moment someone taps the toggle, it becomes "light" or "dark" and
 * stays that way (persisted) regardless of what the OS does afterwards.
 */
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}
