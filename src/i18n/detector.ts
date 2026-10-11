import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type LanguageCode,
} from "./config";

/**
 * Strips region/script subtags from a BCP-47 tag and lowercases it.
 *   fa-AF -> fa
 *   en-GB -> en
 *   zh-Hans-CN -> zh
 */
function toBaseLanguage(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? "";
}

/**
 * Resolves the best supported language from a list of BCP-47 tags
 * (as returned by navigator.languages), falling back to DEFAULT_LANGUAGE.
 */
export function resolveSupportedLanguage(
  tags: readonly string[],
): LanguageCode {
  for (const tag of tags) {
    const base = toBaseLanguage(tag);
    if (isSupportedLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Reads the browser's language preference (navigator.languages first,
 * falling back to navigator.language) and resolves it to a supported code.
 * Safe to call in a Chrome extension popup/options/content-script context.
 */
export function detectBrowserLanguage(): LanguageCode {
  const tags: string[] =
    typeof navigator !== "undefined"
      ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
      : [];
  return resolveSupportedLanguage(tags);
}
