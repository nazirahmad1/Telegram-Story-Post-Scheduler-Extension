import type { TranslationKey } from "../i18n";
import { FloodWaitError, RPCError, ConnectionTimeoutError } from "./client";
import { MissingApiCredentialsError } from "./config";

const ERROR_CODE_TO_KEY: Record<string, TranslationKey> = {
  PHONE_NUMBER_INVALID: "errors.phoneNumberInvalid",
  PHONE_CODE_INVALID: "errors.phoneCodeInvalid",
  PHONE_CODE_EXPIRED: "errors.phoneCodeExpired",
  PASSWORD_HASH_INVALID: "errors.passwordInvalid",
  SRP_PASSWORD_CHANGED: "errors.passwordInvalid",
  STORIES_TOO_MUCH: "errors.storiesTooMuch",
  MEDIA_FILE_TOO_BIG: "errors.fileTooLarge",
  FILE_PARTS_INVALID: "errors.fileTooLarge",
  MEDIA_TYPE_INVALID: "errors.unsupportedFormat",
  MEDIA_EMPTY: "errors.unsupportedFormat",
};

type TFunction = (
  key: TranslationKey,
  options?: { count?: number; [variable: string]: string | number | undefined },
) => string;

/**
 * Turns any error thrown by the telegram/ client module into an
 * already-translated, user-facing string. Never surface a raw Telegram
 * error code (e.g. "STORIES_TOO_MUCH") directly in the UI — always route
 * it through here first.
 */
export function translateTelegramError(err: unknown, t: TFunction): string {
  // Always log the real error to the console. The UI only ever shows the
  // translated, generic version — but without this, a config/connection
  // problem (missing api_id, blocked WebSocket, etc.) is indistinguishable
  // from any other failure, which makes it nearly impossible to debug.
  // eslint-disable-next-line no-console
  console.error("[telegram]", err);

  if (err instanceof FloodWaitError) {
    return t("errors.floodWait", { count: err.seconds });
  }
  if (err instanceof MissingApiCredentialsError) {
    return t("errors.missingApiCredentials");
  }
  if (err instanceof ConnectionTimeoutError) {
    return t("errors.connectionTimeout");
  }
  if (err instanceof RPCError) {
    const key = ERROR_CODE_TO_KEY[err.errorMessage];
    if (key) return t(key);
  }
  if (err instanceof Error && /network|fetch|websocket|offline/i.test(err.message)) {
    return t("errors.network");
  }
  return t("errors.unknown");
}
