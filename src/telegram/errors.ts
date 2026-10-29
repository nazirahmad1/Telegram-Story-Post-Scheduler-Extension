import type { TranslationKey } from "../i18n";
import { FloodWaitError, RPCError, ConnectionTimeoutError } from "./client";
import { MissingApiCredentialsError } from "./config";
import { AudienceUnresolvedError } from "./privacy";
import { SessionBusyError } from "./session-lock";
import { matchErrorCode, storyFloodPeriod, type ErrorEntryId } from "./error-catalog";

/** Login-form codes that already had their own short, self-explanatory message. */
const SHORT_MESSAGE_KEYS: Record<string, TranslationKey> = {
  PHONE_NUMBER_INVALID: "errors.phoneNumberInvalid",
  PHONE_CODE_INVALID: "errors.phoneCodeInvalid",
  PHONE_CODE_EMPTY: "errors.phoneCodeInvalid",
  PHONE_CODE_EXPIRED: "errors.phoneCodeExpired",
  PASSWORD_HASH_INVALID: "errors.passwordInvalid",
  SRP_PASSWORD_CHANGED: "errors.passwordInvalid",
};

type TFunction = (
  key: TranslationKey,
  options?: { count?: number; [variable: string]: string | number | undefined },
) => string;

export interface ErrorDescription {
  id: ErrorEntryId | "short";
  /** What happened, in a few words. */
  title: string;
  /** Why it happened. */
  reason?: string;
  /** What the person can do about it. */
  fix?: string;
  /** Raw Telegram code (e.g. STORY_SEND_FLOOD_WEEKLY_5) for support / bug reports. */
  code?: string;
  /** Seconds until retrying can work (flood wait). */
  retryAfter?: number;
  /** The Telegram session is dead — the app should go back to the login screen. */
  sessionDead: boolean;
  /** The very same request can succeed later without any change. */
  retryable: boolean;
}

function entry(id: ErrorEntryId, t: TFunction, params: Record<string, string | number> = {}) {
  return {
    title: t(`errors.detail.${id}.title` as TranslationKey, params),
    reason: t(`errors.detail.${id}.reason` as TranslationKey, params),
    fix: t(`errors.detail.${id}.fix` as TranslationKey, params),
  };
}

/**
 * Turns any error thrown by the telegram/ client module into a structured,
 * already-translated explanation: what happened, why, what to do, and the raw
 * Telegram code. Never show a bare "something went wrong" if we know more.
 */
export function describeTelegramError(err: unknown, t: TFunction): ErrorDescription {
  // Always log the real error — the UI shows the friendly version, the console keeps the truth.
  // eslint-disable-next-line no-console
  console.error("[telegram]", err);

  if (err instanceof FloodWaitError) {
    return {
      id: "floodWait",
      ...entry("floodWait", t, { seconds: err.seconds }),
      fix: t("errors.floodWait", { count: err.seconds }),
      code: `FLOOD_WAIT_${err.seconds}`,
      retryAfter: err.seconds,
      sessionDead: false,
      retryable: true,
    };
  }
  if (err instanceof MissingApiCredentialsError) {
    return { id: "missingApi", ...entry("missingApi", t), sessionDead: false, retryable: false };
  }
  if (err instanceof ConnectionTimeoutError) {
    return { id: "connectionTimeout", ...entry("connectionTimeout", t), sessionDead: false, retryable: true };
  }
  if (err instanceof SessionBusyError) {
    return { id: "sessionBusy", ...entry("sessionBusy", t), sessionDead: false, retryable: true };
  }
  if (err instanceof AudienceUnresolvedError) {
    return {
      id: "audienceUnresolved",
      ...entry("audienceUnresolved", t, { n: err.missingUserIds.length }),
      sessionDead: false,
      retryable: false,
    };
  }

  if (err instanceof RPCError) {
    const code = err.errorMessage ?? "";
    const short = SHORT_MESSAGE_KEYS[code];
    if (short) return { id: "short", title: t(short), code, sessionDead: false, retryable: false };

    const match = matchErrorCode(code);
    if (match) {
      const period = storyFloodPeriod(code);
      const params: Record<string, string | number> = { n: match.n ?? 0, period: period ?? "" };
      const base = entry(match.id, t, params);
      // The flood entry has two wordings (weekly vs monthly), picked here rather than with plural keys.
      const reason = match.id === "storyFlood" && period === "monthly" ? t("errors.detail.storyFlood.reasonMonthly", params) : base.reason;
      return {
        id: match.id,
        ...base,
        reason,
        code,
        sessionDead: !!match.sessionDead,
        retryable: !!match.retryable,
      };
    }
    // Unknown RPC error: still say exactly what Telegram answered.
    const generic = entry(err.code && err.code >= 500 ? "serverError" : "unknown", t);
    return { id: "unknown", ...generic, code: code || String(err.code ?? ""), sessionDead: false, retryable: !!err.code && err.code >= 500 };
  }

  if (err instanceof Error && /network|fetch|websocket|offline|connection|socket/i.test(err.message)) {
    return { id: "network", ...entry("network", t), sessionDead: false, retryable: true };
  }
  return {
    id: "unknown",
    ...entry("unknown", t),
    code: err instanceof Error ? err.message.slice(0, 120) : undefined,
    sessionDead: false,
    retryable: false,
  };
}

/** One-line version (title + reason + what to do) for toasts and plain text slots. */
export function formatErrorDescription(d: ErrorDescription): string {
  return [d.title, d.reason, d.fix].filter(Boolean).join(" ");
}

/**
 * Backwards-compatible one-string helper used across the app — now returns the
 * full explanation instead of a generic message.
 */
export function translateTelegramError(err: unknown, t: TFunction): string {
  return formatErrorDescription(describeTelegramError(err, t));
}
