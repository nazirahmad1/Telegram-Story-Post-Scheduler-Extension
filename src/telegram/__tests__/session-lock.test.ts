import { afterEach, describe, expect, it } from "vitest";
import { SessionBusyError, acquireSessionLock, holdsSessionLock, releaseSessionLock } from "../session-lock";

/** Tiny in-memory Web Locks: exclusive, FIFO, honours AbortSignal. */
function installFakeLocks() {
  let holder: Promise<void> | null = null;
  const locks = {
    request(_name: string, opts: { signal?: AbortSignal }, cb: () => Promise<void>) {
      return new Promise<void>((resolve, reject) => {
        const tryRun = async () => {
          if (holder) return void setTimeout(tryRun, 5);
          if (opts.signal?.aborted) return;
          holder = cb();
          await holder;
          holder = null;
          resolve();
        };
        opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        void tryRun();
      });
    },
  };
  Object.defineProperty(globalThis.navigator, "locks", { value: locks, configurable: true });
}

afterEach(() => releaseSessionLock());

describe("session lock", () => {
  it("is re-entrant inside one context", async () => {
    installFakeLocks();
    await acquireSessionLock(100);
    expect(holdsSessionLock()).toBe(true);
    await acquireSessionLock(100); // second call must not deadlock
  });

  it("a second context times out with SessionBusyError instead of hanging forever", async () => {
    installFakeLocks();
    await acquireSessionLock(100); // "context A" holds it
    // Simulate context B: a separate request that can never be granted while A holds.
    const other = (navigator.locks as unknown as { request: (n: string, o: object, cb: () => Promise<void>) => Promise<void> });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await expect(other.request("x", { signal: controller.signal }, () => Promise.resolve())).rejects.toMatchObject({ name: "AbortError" });
    expect(new SessionBusyError().name).toBe("SessionBusyError");
  });

  it("releasing lets the next owner in", async () => {
    installFakeLocks();
    await acquireSessionLock(100);
    releaseSessionLock();
    expect(holdsSessionLock()).toBe(false);
    await acquireSessionLock(200);
    expect(holdsSessionLock()).toBe(true);
  });
});

import { canReleaseConnection } from "../session-lock";

describe("idle release vs. pending login (PHONE_CODE_EXPIRED regression)", () => {
  it("never drops the connection while a login code is pending, even if idle for minutes", () => {
    const now = 1_000_000;
    expect(canReleaseConnection({ activeOps: 0, loginPendingUntil: now + 60_000, now })).toBe(false);
  });
  it("drops an idle connection once no login is pending", () => {
    expect(canReleaseConnection({ activeOps: 0, loginPendingUntil: 0, now: 5 })).toBe(true);
  });
  it("never drops while a call is running", () => {
    expect(canReleaseConnection({ activeOps: 1, loginPendingUntil: 0, now: 5 })).toBe(false);
  });
  it("gives up holding the connection after the pending window ends", () => {
    expect(canReleaseConnection({ activeOps: 0, loginPendingUntil: 100, now: 100 })).toBe(true);
  });
});
