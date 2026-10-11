/// <reference types="chrome" />

/**
 * Single low-level key/value backend shared by every storage module in this
 * app (session, history, language). Two backends:
 *
 * 1. chrome.storage.local — used whenever the code is actually running
 *    inside the installed extension (popup, side panel). This is the ONLY
 *    backend used in that context; it's sandboxed per-extension, no other
 *    extension or web page can read it, and — importantly for the Telegram
 *    session string — it is never synced to any cloud account the way
 *    chrome.storage.sync would be.
 *
 * 2. window.localStorage — used ONLY when chrome.storage genuinely isn't
 *    present, which in practice means the app is being opened directly as
 *    a regular page (e.g. `npm run dev` in a browser tab) rather than
 *    loaded as an unpacked extension. This exists so the app is usable
 *    while developing without chrome://extensions in the loop every time.
 *    It is deliberately weaker: localStorage is visible to any script that
 *    runs on the same origin. Don't rely on it for anything you wouldn't
 *    also be fine with a page-level XSS reading — for a packaged build,
 *    always test as a real loaded extension so this path isn't the one
 *    protecting the session.
 */

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome?.storage?.local &&
    typeof chrome.storage.local.get === "function"
  );
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    // Accessing localStorage can itself throw (e.g. some sandboxed iframes).
    return false;
  }
}

export async function storageGet<T>(key: string): Promise<T | null> {
  if (hasChromeStorage()) {
    try {
      const result = await chrome.storage.local.get(key);
      return key in result ? (result[key] as T) : null;
    } catch {
      return null;
    }
  }
  if (hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  }
  return null;
}

export async function storageSet<T>(key: string, value: T): Promise<boolean> {
  if (hasChromeStorage()) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch {
      return false;
    }
  }
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function storageRemove(key: string): Promise<void> {
  if (hasChromeStorage()) {
    try {
      await chrome.storage.local.remove(key);
    } catch {
      // Non-fatal.
    }
    return;
  }
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Non-fatal.
    }
  }
}

/** Which backend is actually active right now — surfaced for diagnostics only. */
export function activeStorageBackend(): "chrome.storage.local" | "localStorage" | "none" {
  if (hasChromeStorage()) return "chrome.storage.local";
  if (hasLocalStorage()) return "localStorage";
  return "none";
}
