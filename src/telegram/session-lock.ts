/**
 * Only ONE context (popup, side panel, background service worker) may hold a
 * live MTProto connection for the stored session at a time.
 *
 * Why this exists: Telegram invalidates an auth key that is used from two
 * places simultaneously (AUTH_KEY_DUPLICATED) and from then on every call
 * answers AUTH_KEY_UNREGISTERED — which the UI used to report as "you are not
 * logged in" even though the person had logged in minutes earlier. A popup,
 * a side panel and a scheduled-story alarm can all be alive at once, so the
 * session must be guarded across contexts. Web Locks (navigator.locks) are
 * shared by every extension page and the service worker of one extension.
 */
const LOCK_NAME = "story-extension:telegram-session";

export class SessionBusyError extends Error {
  constructor() {
    super("Another Story Publisher window is currently using this Telegram session.");
    this.name = "SessionBusyError";
  }
}

let releaseHeldLock: (() => void) | null = null;

export function holdsSessionLock(): boolean {
  return releaseHeldLock !== null;
}

function getLocks(): LockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}

/** Resolves once this context owns the session; rejects with SessionBusyError after `timeoutMs`. No-op where Web Locks don't exist (tests, very old browsers). */
export async function acquireSessionLock(timeoutMs: number): Promise<void> {
  if (releaseHeldLock) return;
  const locks = getLocks();
  if (!locks) return;

  await new Promise<void>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    locks
      .request(LOCK_NAME, { signal: controller.signal }, () => {
        clearTimeout(timer);
        resolve();
        // Returning a pending promise is what keeps the lock held.
        return new Promise<void>((release) => {
          releaseHeldLock = release;
        });
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        if (err instanceof DOMException && err.name === "AbortError") reject(new SessionBusyError());
        else resolve(); // locking itself is broken — better to work unguarded than not at all
      });
  });
}

export function releaseSessionLock(): void {
  releaseHeldLock?.();
  releaseHeldLock = null;
}

/** Message another context sends to ask idle holders to let go of the session. */
export const RELEASE_SESSION_MESSAGE = "story-extension/release-session";

export function broadcastReleaseRequest(): void {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: RELEASE_SESSION_MESSAGE }).catch(() => {});
    }
  } catch {
    // No receiver / not in an extension — nothing to do.
  }
}

/**
 * A connection may only be dropped when idle if no call is running AND no
 * login is half-finished. While a phone-code (or QR) login is pending, the
 * SAME connection must stay open: Telegram ties the sent code to the auth key
 * of the connection that requested it, so signing in through a fresh
 * connection fails with PHONE_CODE_EXPIRED ("code expired, request a new one")
 * even though the code is correct and seconds old.
 */
export const LOGIN_PENDING_MS = 10 * 60 * 1000;

export function canReleaseConnection(state: { activeOps: number; loginPendingUntil: number; now: number }): boolean {
  return state.activeOps === 0 && state.now >= state.loginPendingUntil;
}
