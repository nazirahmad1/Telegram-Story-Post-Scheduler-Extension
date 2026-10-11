import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as telegram from "./client";

interface ConnectionStatusValue {
  connected: boolean;
  checking: boolean;
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
 * How long the initial "are we already logged in" check gets before this
 * gives up and shows the login screen anyway. Confirmed via an actual
 * headless-browser run against this build: when the network can't reach
 * Telegram, GramJS's own connect() can stay pending well past its
 * `connectionRetries` count (5, set in client.ts) exhausting — the app
 * must not depend on GramJS ever settling that promise, or a slow/
 * unreachable network leaves the whole UI stuck on "Loading" forever with
 * no way for the person to do anything, including trying to log in.
 */
const INITIAL_CHECK_TIMEOUT_MS = 8000;

export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setConnected(await withTimeout(telegram.isAuthorized(), INITIAL_CHECK_TIMEOUT_MS));
    } catch (err) {
      console.error("[connection-status] isAuthorized failed or timed out:", err);
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ConnectionStatusContext.Provider value={{ connected, checking, refresh }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus(): ConnectionStatusValue {
  const ctx = useContext(ConnectionStatusContext);
  if (!ctx) throw new Error("useConnectionStatus must be used within a ConnectionStatusProvider");
  return ctx;
}
