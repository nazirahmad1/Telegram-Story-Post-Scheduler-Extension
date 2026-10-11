import { THEME_STORAGE_KEY, isThemeMode, type ThemeMode } from "./config";
import { storageGet, storageSet } from "../utils/storage-backend";

export async function getPersistedTheme(): Promise<ThemeMode | null> {
  const value = await storageGet<string>(THEME_STORAGE_KEY);
  return typeof value === "string" && isThemeMode(value) ? value : null;
}

export async function persistTheme(mode: ThemeMode): Promise<void> {
  await storageSet(THEME_STORAGE_KEY, mode);
}
