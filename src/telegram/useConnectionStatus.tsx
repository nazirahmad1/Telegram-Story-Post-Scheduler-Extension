import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as telegram from "./client";

/**
 * - checking:      first check in flight
 * - connected:     Telegram confirmed the stored session is valid
 * - disconnected:  there is no session, or Telegram itself said it's dead → show login
 * - offline:       we could NOT find out (no network, timeout, Telegram unreachable).
 *                  The stored session is untouched and the person is NOT asked to log in.
 */
export type ConnectionState = "checking" | "connected" | "disconnected" | "offline";

interface ConnectionStatusValue {
  state: ConnectionState;
  connected: boolean;
  checking: boolean;
  offline: boolean;
  /** The last error that made us "offline", for the diagnostics line on the reconnect screen. */
  lastError: unknown;
  refresh: () => Promise<void>;
}

const ConnectionStatusContext = createContext<ConnectionStatusValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Must be LONGER than client.ts's own connect timeout (15s). The old 8s limit
 * fired first on any slow network, and the catch-all below turned that into
 * "not connected" — i.e. a login screen for someone who was logged in.
 */
const CHECK_TIMEOUT_MS = 30000;
/** While offline, quietly try again so the app recovers on its own when the network returns. */
const OFFLINE_RETRY_DELAYS_MS = [4000, 10000, 20000, 40000];

export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>("checking");
  const [lastError, setLastError] = useState<unknown>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const run = useCallback(async () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setState((prev) => (prev === "connected" ? prev : "checking"));
    try {
      const result = await withTimeout(telegram.checkSession(), CHECK_TIMEOUT_MS);
      retryCount.current = 0;
      setLastError(null);
      setState(result === "authorized" ? "connected" : "disconnected");
    } catch (err) {
      console.error("[connection-status] could not verify the session (keeping it):", err);
      setLastError(err);
      // Keep showing the app if it was already usable; otherwise show the reconnect screen.
      setState((prev) => (prev === "connected" ? prev : "offline"));
      const delay = OFFLINE_RETRY_DELAYS_MS[Math.min(retryCount.current, OFFLINE_RETRY_DELAYS_MS.length - 1)];
      retryCount.current++;
      retryTimer.current = setTimeout(() => void run(), delay);
    }
  }, []);

  const refresh = useCallback(() => {
    // Collapse concurrent callers (many screens call refresh() after errors) into one check.
    if (!inFlight.current) {
      inFlight.current = run().finally(() => {
        inFlight.current = null;
      });
    }
    return inFlight.current;
  }, [run]);

  useEffect(() => {
    void refresh();
    // Coming back online is the best possible moment to re-check.
    const onOnline = () => {
      retryCount.current = 0;
      void refresh();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [refresh]);

  const value = useMemo<ConnectionStatusValue>(
    () => ({
      state,
      connected: state === "connected",
      checking: state === "checking",
      offline: state === "offline",
      lastError,
      refresh,
    }),
    [state, lastError, refresh],
  );

  return <ConnectionStatusContext.Provider value={value}>{children}</ConnectionStatusContext.Provider>;
}

export function useConnectionStatus(): ConnectionStatusValue {
  const ctx = useContext(ConnectionStatusContext);
  if (!ctx) throw new Error("useConnectionStatus must be used within a ConnectionStatusProvider");
  return ctx;
}
