import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation as useReactI18nTranslation } from "react-i18next";

import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  getDirection,
  type LanguageCode,
  type TextDirection,
} from "./config";
import { detectBrowserLanguage } from "./detector";
import { i18next } from "./init";
import { initI18n } from "./init";
import { getPersistedLanguage, persistLanguage } from "./storage";
import type { TranslationKey } from "./types";

interface I18nContextValue {
  language: LanguageCode;
  dir: TextDirection;
  /** Change the active language app-wide, persist it, and flip dir/lang — no reload. */
  setLanguage: (language: LanguageCode) => Promise<void>;
  languages: typeof SUPPORTED_LANGUAGES;
  ready: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Applies the resolved language to <html lang dir>. This is the ONLY place
 * in the app that should ever touch document.documentElement.lang/dir —
 * components must never duplicate this logic.
 */
function applyDocumentAttributes(language: LanguageCode) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = getDirection(language);
}

/**
 * Resolution order for the initial language:
 *   1. Previously persisted user selection (chrome.storage.local)
 *   2. Browser language (navigator.languages / navigator.language)
 *   3. English (DEFAULT_LANGUAGE) — always the final fallback
 */
async function resolveInitialLanguage(): Promise<LanguageCode> {
  const persisted = await getPersistedLanguage();
  if (persisted) return persisted;

  const browserLanguage = detectBrowserLanguage();
  return browserLanguage ?? DEFAULT_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const initial = await resolveInitialLanguage();
      await initI18n(initial);
      if (cancelled) return;
      applyDocumentAttributes(initial);
      setLanguageState(initial);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(async (next: LanguageCode) => {
    await i18next.changeLanguage(next);
    applyDocumentAttributes(next);
    await persistLanguage(next);
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      dir: getDirection(language),
      setLanguage,
      languages: SUPPORTED_LANGUAGES,
      ready,
    }),
    [language, setLanguage, ready],
  );

  // Avoid a flash of the wrong language/direction while we resolve it.
  if (!ready) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

interface TOptions {
  count?: number;
  [variable: string]: string | number | undefined;
}

/**
 * Type-safe translation hook. `t("story.publsih")` is a TypeScript error;
 * `t("story.publish")` is not. Wraps react-i18next so plural/interpolation
 * behavior (Intl.PluralRules-backed) comes for free.
 */
export function useTranslation() {
  const { t: rawT, i18n } = useReactI18nTranslation();

  const t = useCallback(
    (key: TranslationKey, options?: TOptions): string => rawT(key, options),
    [rawT],
  );

  return { t, i18n };
}
