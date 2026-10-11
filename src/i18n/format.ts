import type { LanguageCode } from "./config";

/**
 * Maps our internal language codes to full BCP-47 locale tags for Intl.
 * Persian defaults to the Afghan locale to match Karayehban-style
 * conventions (fa-AF) rather than fa-IR; extend here if a region-specific
 * variant is ever needed for another language.
 */
const INTL_LOCALE_MAP: Record<LanguageCode, string> = {
  en: "en-US",
  fa: "fa-AF",
  ar: "ar-SA",
  tr: "tr-TR",
  ru: "ru-RU",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
};

export function toIntlLocale(language: LanguageCode): string {
  return INTL_LOCALE_MAP[language];
}

export function formatDate(
  date: Date | number,
  language: LanguageCode,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" },
): string {
  return new Intl.DateTimeFormat(toIntlLocale(language), options).format(date);
}

export function formatNumber(
  value: number,
  language: LanguageCode,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toIntlLocale(language), options).format(value);
}
