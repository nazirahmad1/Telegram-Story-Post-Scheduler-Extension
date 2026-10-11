/**
 * Persists the Telegram session STRING (GramJS StringSession) so the user
 * doesn't have to re-authenticate every time the popup closes.
 *
 * IMPORTANT — this is deliberately a separate storage key from
 * LANGUAGE_STORAGE_KEY (see src/i18n/storage.ts). A session string is a
 * live credential: whoever holds it can act as the logged-in account.
 * Never merge this into the same object/key as UI preferences, and never
 * log it or send it anywhere other than the storage backend below.
 */
import { storageGet, storageSet, storageRemove } from "../utils/storage-backend";

const TELEGRAM_SESSION_STORAGE_KEY = "storyExtension.telegramSession";

export async function getPersistedSession(): Promise<string | null> {
  const value = await storageGet<string>(TELEGRAM_SESSION_STORAGE_KEY);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function persistSession(sessionString: string): Promise<void> {
  await storageSet(TELEGRAM_SESSION_STORAGE_KEY, sessionString);
}

export async function clearPersistedSession(): Promise<void> {
  await storageRemove(TELEGRAM_SESSION_STORAGE_KEY);
}
