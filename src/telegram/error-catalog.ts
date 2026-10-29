/**
 * Pure mapping from Telegram's error codes to the entry of the translated
 * catalog (`errors.detail.<id>.{title,reason,fix}`) that explains them.
 * No React, no network — unit-tested on its own.
 */
export type ErrorEntryId =
  | "sessionEnded"
  | "keyDuplicated"
  | "accountDeactivated"
  | "storyLimitActive"
  | "storyFlood"
  | "periodInvalid"
  | "premiumRequired"
  | "boostsRequired"
  | "noPermission"
  | "targetUnavailable"
  | "storyGone"
  | "notModified"
  | "captionTooLong"
  | "mediaTooBig"
  | "mediaUnsupported"
  | "photoInvalid"
  | "audienceInvalid"
  | "audienceUnresolved"
  | "apiCredentials"
  | "phoneBanned"
  | "phoneFlood"
  | "floodWait"
  | "serverError"
  | "network"
  | "connectionTimeout"
  | "sessionBusy"
  | "missingApi"
  | "unknown";

export interface CatalogMatch {
  id: ErrorEntryId;
  /** Number parsed out of the code, e.g. STORY_SEND_FLOOD_WEEKLY_5 -> 5. */
  n?: number;
  /** True when the session is definitely dead and must be discarded. */
  sessionDead?: boolean;
  /** True when trying again later (without changing anything) can succeed. */
  retryable?: boolean;
}

const EXACT: Record<string, CatalogMatch> = {
  AUTH_KEY_UNREGISTERED: { id: "sessionEnded", sessionDead: true },
  AUTH_KEY_INVALID: { id: "sessionEnded", sessionDead: true },
  AUTH_KEY_PERM_EMPTY: { id: "sessionEnded", sessionDead: true },
  SESSION_REVOKED: { id: "sessionEnded", sessionDead: true },
  SESSION_EXPIRED: { id: "sessionEnded", sessionDead: true },
  AUTH_KEY_DUPLICATED: { id: "keyDuplicated", sessionDead: true },
  USER_DEACTIVATED: { id: "accountDeactivated", sessionDead: true },
  USER_DEACTIVATED_BAN: { id: "accountDeactivated", sessionDead: true },

  STORIES_TOO_MUCH: { id: "storyLimitActive" },
  STORY_PERIOD_INVALID: { id: "periodInvalid" },
  PREMIUM_ACCOUNT_REQUIRED: { id: "premiumRequired" },
  BOOSTS_REQUIRED: { id: "boostsRequired" },
  CHAT_ADMIN_REQUIRED: { id: "noPermission" },
  CHAT_WRITE_FORBIDDEN: { id: "noPermission" },
  CHAT_RESTRICTED: { id: "noPermission" },
  USER_BANNED_IN_CHANNEL: { id: "noPermission" },
  CHANNEL_PRIVATE: { id: "targetUnavailable" },
  CHANNEL_INVALID: { id: "targetUnavailable" },
  CHAT_ID_INVALID: { id: "targetUnavailable" },
  PEER_ID_INVALID: { id: "targetUnavailable" },
  STORY_ID_INVALID: { id: "storyGone" },
  STORY_NOT_FOUND: { id: "storyGone" },
  STORY_NOT_MODIFIED: { id: "notModified" },
  MEDIA_CAPTION_TOO_LONG: { id: "captionTooLong" },
  CAPTION_TOO_LONG: { id: "captionTooLong" },
  MEDIA_FILE_TOO_BIG: { id: "mediaTooBig" },
  FILE_PARTS_INVALID: { id: "mediaTooBig" },
  FILE_PART_TOO_BIG: { id: "mediaTooBig" },
  FILE_PART_SIZE_INVALID: { id: "mediaTooBig" },
  MEDIA_TYPE_INVALID: { id: "mediaUnsupported" },
  MEDIA_EMPTY: { id: "mediaUnsupported" },
  MEDIA_INVALID: { id: "mediaUnsupported" },
  DOCUMENT_INVALID: { id: "mediaUnsupported" },
  VIDEO_CONTENT_TYPE_INVALID: { id: "mediaUnsupported" },
  PHOTO_INVALID_DIMENSIONS: { id: "photoInvalid" },
  PHOTO_SAVE_FILE_INVALID: { id: "photoInvalid" },
  PHOTO_EXT_INVALID: { id: "photoInvalid" },
  IMAGE_PROCESS_FAILED: { id: "photoInvalid" },
  PRIVACY_VALUE_INVALID: { id: "audienceInvalid" },
  PRIVACY_TOO_LONG: { id: "audienceInvalid" },
  USERS_TOO_MUCH: { id: "audienceInvalid" },
  USER_ID_INVALID: { id: "audienceInvalid" },
  API_ID_INVALID: { id: "apiCredentials" },
  API_ID_PUBLISHED_FLOOD: { id: "apiCredentials" },
  PHONE_NUMBER_BANNED: { id: "phoneBanned" },
  PHONE_NUMBER_FLOOD: { id: "phoneFlood", retryable: true },
  INTERNAL: { id: "serverError", retryable: true },
  RPC_CALL_FAIL: { id: "serverError", retryable: true },
  RPC_MCGET_FAIL: { id: "serverError", retryable: true },
  TIMEOUT: { id: "serverError", retryable: true },
};

/** Maps a raw Telegram `errorMessage` (e.g. "STORY_SEND_FLOOD_WEEKLY_5") to a catalog entry, or null if unknown. */
export function matchErrorCode(code: string): CatalogMatch | null {
  const exact = EXACT[code];
  if (exact) return exact;
  const flood = /^STORY_SEND_FLOOD_(WEEKLY|MONTHLY)_(\d+)$/.exec(code);
  if (flood) return { id: "storyFlood", n: Number(flood[2]) };
  if (/^FLOOD_WAIT_\d+$/.test(code) || /^FLOOD_PREMIUM_WAIT_\d+$/.test(code)) return { id: "floodWait", retryable: true };
  return null;
}

/** Returns "weekly" | "monthly" for the story flood family. */
export function storyFloodPeriod(code: string): "weekly" | "monthly" | null {
  const m = /^STORY_SEND_FLOOD_(WEEKLY|MONTHLY)_\d+$/.exec(code);
  return m ? (m[1] === "WEEKLY" ? "weekly" : "monthly") : null;
}
