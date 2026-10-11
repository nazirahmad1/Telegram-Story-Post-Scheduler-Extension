/**
 * Central i18n configuration.
 *
 * This is the SINGLE source of truth for supported languages, native names,
 * text direction, and the default/fallback language. Nothing outside this
 * file should hardcode a language list or RTL logic — import from here.
 */

export const DEFAULT_LANGUAGE = "en" as const;

/**
 * Every supported language, in the order they should appear in the
 * Language Selector. `nativeName` is what gets shown in the UI — we never
 * use flags or English language names as the identifier.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", nativeName: "English", englishName: "English", dir: "ltr" },
  { code: "fa", nativeName: "فارسی", englishName: "Persian", dir: "rtl" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", dir: "rtl" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", dir: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", dir: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", dir: "ltr" },
  { code: "fr", nativeName: "Français", englishName: "French", dir: "ltr" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", dir: "ltr" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export type TextDirection = "ltr" | "rtl";

export const RTL_LANGUAGES: readonly LanguageCode[] = SUPPORTED_LANGUAGES.filter(
  (l) => l.dir === "rtl",
).map((l) => l.code);

export const SUPPORTED_LANGUAGE_CODES: readonly LanguageCode[] = SUPPORTED_LANGUAGES.map(
  (l) => l.code,
);

export function isSupportedLanguage(code: string): code is LanguageCode {
  return (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code);
}

export function getDirection(language: LanguageCode): TextDirection {
  return RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
}

export function getLanguageMeta(code: LanguageCode) {
  // SUPPORTED_LANGUAGES is exhaustive over LanguageCode, so this is always found.
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)!;
}

/** Key used to persist the user's language choice in chrome.storage.local */
export const LANGUAGE_STORAGE_KEY = "storyExtension.language" as const;
