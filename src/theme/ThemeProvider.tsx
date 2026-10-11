import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPersistedTheme, persistTheme } from "./storage";
import type { ResolvedTheme, ThemeMode } from "./config";

interface ThemeContextValue {
  /** What's actually being rendered right now. This is what CSS/UI should read. */
  resolvedTheme: ResolvedTheme;
  /** "system" until the person makes an explicit choice via toggleTheme/setThemeMode. */
  mode: ThemeMode;
  /** Flips light<->dark and persists it as an explicit choice (leaves "system" mode). */
  toggleTheme: () => Promise<void>;
  /** Explicit setter, including handing "system" back to defer to the OS again. */
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
}

/**
 * The ONLY place that should ever touch document.documentElement.dataset.theme
 * — see globals.css's `:root[data-theme="dark"]` block, which every other
 * component's styling already keys off of via CSS variables.
 */
function applyDocumentTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Resolve synchronously on first render from the OS setting — this is the
  // best we can do without a flash, since Manifest V3's CSP forbids the
  // usual inline-script trick and chrome.storage has no synchronous API.
  // A persisted explicit choice (if any) is applied moments later, once
  // storage resolves — typically imperceptible in a small popup/side panel.
  const [mode, setMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolve("system"));

  useEffect(() => {
    applyDocumentTheme(resolvedTheme);
  }, [resolvedTheme]);

  // Load the persisted explicit choice, if any.
  useEffect(() => {
    let cancelled = false;
    getPersistedTheme().then((persisted) => {
      if (cancelled || !persisted) return;
      setMode(persisted);
      setResolvedTheme(resolve(persisted));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // While in "system" mode, stay in sync if the OS theme changes live.
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedTheme(resolve("system"));
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, [mode]);

  const setThemeMode = useCallback(async (next: ThemeMode) => {
    setMode(next);
    setResolvedTheme(resolve(next));
    await persistTheme(next);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: ThemeMode = resolve(mode) === "dark" ? "light" : "dark";
    await setThemeMode(next);
  }, [mode, setThemeMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, mode, toggleTheme, setThemeMode }),
    [resolvedTheme, mode, toggleTheme, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
