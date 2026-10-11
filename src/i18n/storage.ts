import { LANGUAGE_STORAGE_KEY, isSupportedLanguage, type LanguageCode } from "./config";
import { storageGet, storageSet } from "../utils/storage-backend";

/**
 * Reads/writes ONLY the language preference, under its own dedicated key.
 * Telegram session data, tokens, or any other secret must never be stored
 * here — keep those in a separate, purpose-built store.
 */

export async function getPersistedLanguage(): Promise<LanguageCode | null> {
  const value = await storageGet<string>(LANGUAGE_STORAGE_KEY);
  return typeof value === "string" && isSupportedLanguage(value) ? value : null;
}

export async function persistLanguage(language: LanguageCode): Promise<void> {
  await storageSet(LANGUAGE_STORAGE_KEY, language);
}
