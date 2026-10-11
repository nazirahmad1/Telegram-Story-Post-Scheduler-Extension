import { TelegramClient, Api, utils } from "telegram";
import { StringSession } from "telegram/sessions";
import { FloodWaitError, RPCError } from "telegram/errors";
import { generateRandomLong } from "telegram/Helpers";
import { Raw } from "telegram/events";

import { getEffectiveApiCredentials } from "./config";
import { clearPersistedSession, getPersistedSession, persistSession } from "./session-storage";

/**
 * NOTE: this module talks to Telegram's real MTProto servers. The sandbox
 * this was authored in cannot reach those servers (network egress is
 * restricted to package registries), so this has been verified for
 * type-correctness and against GramJS's documented API surface, but NOT
 * exercised against a live account. Test the full phone -> code -> 2FA ->
 * publish flow against your own account before shipping.
 */

let clientPromise: Promise<TelegramClient> | null = null;
// Resolved once per client lifetime (not re-read from storage on every
// call) so a single session is never accidentally built against one
// api_id/api_hash pair and then queried against another mid-flow.
let cachedCredentials: { apiId: number; apiHash: string } | null = null;

async function getApiCredentials(): Promise<{ apiId: number; apiHash: string }> {
  if (!cachedCredentials) cachedCredentials = await getEffectiveApiCredentials();
  return cachedCredentials;
}

export class ConnectionTimeoutError extends Error {
  constructor() {
    super("Couldn't reach Telegram's servers in time.");
    this.name = "ConnectionTimeoutError";
  }
}

/**
 * GramJS's own `connectionRetries` option (set to 5 below) does not
 * reliably bound how long `client.connect()` can stay pending — confirmed
 * empirically: on an unreachable/very slow network it can hang well past
 * that retry count ever exhausting. Without an independent timeout here,
 * a bad network leaves every caller of getClient() (including the very
 * first "are we logged in" check on app load) awaiting a promise that
 * may never settle, with no way for the UI to recover or show an error.
 */
const CONNECT_TIMEOUT_MS = 15000;

async function getClient(): Promise<TelegramClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const [persisted, { apiId, apiHash }] = await Promise.all([getPersistedSession(), getApiCredentials()]);
      const session = new StringSession(persisted ?? "");
      const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
      });

      try {
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new ConnectionTimeoutError()), CONNECT_TIMEOUT_MS);
          }),
        ]);
      } catch (err) {
        // The real connect() attempt is still running in the background
        // even though we're giving up waiting on it — clearing the cache
        // means the NEXT call starts a fresh attempt instead of forever
        // awaiting this same stuck one.
        clientPromise = null;
        throw err;
      }

      return client;
    })();
  }
  return clientPromise;
}

/**
 * Call after saving new API credentials in Settings — a live client is
 * already connected under the OLD api_id/api_hash, and MTProto sessions
 * are established per-credential-pair, so the only correct move is to
 * drop everything (including the session, since it's tied to the old
 * pair) and let the person log in again under the new one.
 */
export async function resetClientForNewCredentials(): Promise<void> {
  try {
    await logout(); // best-effort server-side LogOut too, not just local cleanup
  } catch {
    // The old credentials may already be invalid — local reset below still happens either way.
  }
  cachedCredentials = null;
  clientPromise = null;
}

async function saveCurrentSession(client: TelegramClient): Promise<void> {
  const sessionString = client.session.save() as unknown as string;
  if (sessionString) await persistSession(sessionString);
}

export async function isAuthorized(): Promise<boolean> {
  const client = await getClient();
  return client.checkAuthorization();
}

export interface RequestCodeResult {
  phoneCodeHash: string;
  isCodeViaApp: boolean;
}

export async function requestLoginCode(phoneNumber: string): Promise<RequestCodeResult> {
  const client = await getClient();
  const { apiId, apiHash } = await getApiCredentials();
  return client.sendCode(
    { apiId, apiHash },
    phoneNumber,
  );
}

export type SubmitCodeResult = { status: "signedIn" } | { status: "passwordNeeded"; hint?: string };

export async function submitLoginCode(
  phoneNumber: string,
  phoneCodeHash: string,
  code: string,
): Promise<SubmitCodeResult> {
  const client = await getClient();
  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode: code }),
    );
    await saveCurrentSession(client);
    return { status: "signedIn" };
  } catch (err) {
    if (err instanceof RPCError && err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      return { status: "passwordNeeded", hint: passwordInfo.hint };
    }
    throw err;
  }
}

/**
 * Single-attempt password submission. GramJS's `signInWithPassword` is
 * built around a retry-callback, but our UI takes one password per submit
 * and lets the person resubmit on failure — so the callback only ever
 * offers the password once and surfaces a second call as a hard error
 * rather than looping silently.
 */
export async function submitTwoFactorPassword(password: string): Promise<void> {
  const client = await getClient();
  const { apiId, apiHash } = await getApiCredentials();
  let offered = false;
  let lastError: unknown = null;

  try {
    await client.signInWithPassword(
      { apiId, apiHash },
      {
        password: async () => {
          if (offered) throw new Error("PASSWORD_HASH_INVALID");
          offered = true;
          return password;
        },
        // Returning `true` tells GramJS to stop after one attempt (what we
        // want for a single-submit UI) — but GramJS then throws its own
        // generic "AUTH_USER_CANCEL" and discards whatever error actually
        // caused the failure (e.g. the real PASSWORD_HASH_INVALID RPCError).
        // Capture it here so we can re-throw the real one below; otherwise
        // translateTelegramError never sees a recognizable error code and
        // always falls back to the generic "unknown error" message.
        onError: async (err) => {
          lastError = err;
          return true;
        },
      },
    );
  } catch (err) {
    throw lastError ?? err;
  }

  await saveCurrentSession(client);
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface QrToken {
  /** Deep link to encode as a QR image, e.g. via the `qrcode` package. */
  url: string;
  /** Unix timestamp (seconds) after which this specific token stops being valid. */
  expires: number;
}

export type QrLoginResult = SubmitCodeResult;

interface ApiCredentials {
  apiId: number;
  apiHash: string;
}

/**
 * Calls auth.exportLoginToken and follows any DC migration to completion,
 * returning whatever the chain finally settles on (a fresh LoginToken to
 * display, or LoginTokenSuccess once someone has scanned and confirmed it).
 *
 * GramJS's own `signInUserWithQrCode` only follows a migration in the
 * *final* check after the scan is confirmed — if the very first export
 * call happens to come back as LoginTokenMigrateTo (which can happen on a
 * brand-new, un-persisted session), it throws a bare "Unexpected" instead
 * of switching data centers, and the QR code never even renders. Looping
 * here on every call, not just the last one, is what actually fixes that.
 */
async function exportLoginToken(
  client: TelegramClient,
  apiCredentials: ApiCredentials,
): Promise<Api.auth.TypeLoginToken> {
  // Migrating data centers means a full disconnect + reconnect with a new
  // auth key, which can take several seconds on a slow connection — long
  // enough for the short-lived migration token Telegram just handed us to
  // expire (AUTH_TOKEN_EXPIRED) before ImportLoginToken gets a chance to
  // redeem it. There's nothing to "fix" about a slow network; the correct
  // response, same as what a slow official client has to do, is just to
  // ask for a fresh token and try again.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      let result: Api.auth.TypeLoginToken = await client.invoke(
        new Api.auth.ExportLoginToken({ ...apiCredentials, exceptIds: [] }),
      );
      while (result instanceof Api.auth.LoginTokenMigrateTo) {
        await client._switchDC(result.dcId);
        result = await client.invoke(new Api.auth.ImportLoginToken({ token: result.token }));
      }
      return result;
    } catch (err) {
      const tokenExpiredMidSwitch = err instanceof RPCError && err.errorMessage === "AUTH_TOKEN_EXPIRED";
      if (!tokenExpiredMidSwitch || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  /* istanbul ignore next -- unreachable: the loop above always returns or throws */
  throw new Error("Failed to export a QR login token after retrying.");
}

/**
 * Resolves once either another device confirms the token (a real
 * `UpdateLoginToken` push arrives) or the token's own expiry passes,
 * whichever comes first — the caller re-exports either way to find out
 * which one happened.
 */
function waitForScanOrExpiry(client: TelegramClient, expiresAtSeconds: number): Promise<void> {
  return new Promise((resolve) => {
    const msLeft = Math.max(expiresAtSeconds * 1000 - Date.now(), 0);
    const event = new Raw({ types: [Api.UpdateLoginToken] });
    const handler = () => finish();
    const timer = setTimeout(finish, msLeft);
    function finish() {
      clearTimeout(timer);
      client.removeEventHandler(handler, event);
      resolve();
    }
    client.addEventHandler(handler, event);
  });
}

/**
 * Telegram's "scan to log in" flow, the same one used by the phone-number
 * dropdown QR option in Telegram's own apps. Exports a login token, hands
 * it to `onToken` so the caller can render it as a QR code, waits for an
 * already-signed-in device to scan and confirm it, and loops with a fresh
 * token if the current one expires unscanned. `onToken` fires again every
 * time the token is refreshed — the UI should just swap the image.
 *
 * Same caveat as the rest of this module: authored without a live Telegram
 * connection to verify against, since this sandbox can't reach Telegram's
 * servers. Test the full scan -> confirm (-> password) path for real.
 */
export async function startQrLogin(onToken: (token: QrToken) => void): Promise<QrLoginResult> {
  const client = await getClient();
  const apiCredentials = await getApiCredentials();

  try {
    while (true) {
      const result = await exportLoginToken(client, apiCredentials);

      if (result instanceof Api.auth.LoginTokenSuccess) {
        await saveCurrentSession(client);
        return { status: "signedIn" };
      }

      if (!(result instanceof Api.auth.LoginToken)) {
        throw new Error(`Unexpected response while starting QR login: ${result.className}`);
      }

      onToken({ url: `tg://login?token=${toBase64Url(result.token as unknown as Buffer)}`, expires: result.expires });
      await waitForScanOrExpiry(client, result.expires);
      // Loop: re-exporting now either hands back a fresh token (nobody
      // scanned in time) or resolves the branches above (somebody did).
    }
  } catch (err) {
    if (err instanceof RPCError && err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      return { status: "passwordNeeded", hint: passwordInfo.hint };
    }
    throw err;
  }
}

export async function logout(): Promise<void> {
  const client = await getClient();
  try {
    await client.invoke(new Api.auth.LogOut());
  } finally {
    await clearPersistedSession();
    clientPromise = null;
  }
}

export type StoryPrivacy = "everyone" | "contacts" | "closeFriends";

function toPrivacyRules(privacy: StoryPrivacy): Api.TypeInputPrivacyRule[] {
  switch (privacy) {
    case "contacts":
      return [new Api.InputPrivacyValueAllowContacts()];
    case "closeFriends":
      return [new Api.InputPrivacyValueAllowCloseFriends()];
    case "everyone":
    default:
      return [new Api.InputPrivacyValueAllowAll()];
  }
}

/** Telegram's allowed story durations, in seconds. 24h is the only one available without Premium. */
export const STORY_PERIOD_OPTIONS = [
  { seconds: 6 * 3600, hours: 6 },
  { seconds: 12 * 3600, hours: 12 },
  { seconds: 24 * 3600, hours: 24 },
  { seconds: 48 * 3600, hours: 48 },
] as const;
export type StoryPeriodSeconds = (typeof STORY_PERIOD_OPTIONS)[number]["seconds"];

/** "me" for the personal account, or a channel/group's entity id/username as a string for a target that isn't the account itself. */
export type StoryTarget = "me" | string;

export interface PublishStoryParams {
  file: File;
  caption?: string;
  privacy: StoryPrivacy;
  /** Defaults to ["me"]. Posting to more than one target uploads the file once and calls SendStory once per target. */
  targets?: StoryTarget[];
  /** Seconds; only Premium accounts may pick anything other than 24h — publishStory does NOT itself re-check this, the caller (StoryEditor) already only offers non-24h options once it has confirmed premium via getAccountCapabilities. Telegram's own server enforces it either way. */
  period?: StoryPeriodSeconds;
  /** Fraction from 0 to 1. Called repeatedly during upload; the publish RPC calls that follow have no granular signal of their own. */
  onProgress?: (fraction: number) => void;
}

export interface PublishStoryResult {
  target: StoryTarget;
  storyId: number | null;
  error: unknown | null;
}

function extractStoryId(updates: Api.TypeUpdates): number | null {
  const list = "updates" in updates ? updates.updates : [];
  for (const u of list) {
    if (u instanceof Api.UpdateStory) return u.story.id;
  }
  return null;
}

/**
 * Uploads media once and publishes it as a Telegram Story to one or more
 * targets — the personal account ("me") and/or any channel/group the
 * account has story-posting rights on (see getStoryTargets). Each target
 * gets its own SendStory call (Telegram's API has no batch/multi-peer
 * story endpoint) but reuses the same already-uploaded file, so a 10MB
 * video posted to 5 channels still only uploads once.
 *
 * Returns one result per target instead of throwing on the first failure,
 * so posting to 3 channels where one has since lost admin rights doesn't
 * lose the other 2 — the caller decides how to surface partial failure.
 */
export async function publishStory({
  file,
  caption,
  privacy,
  targets = ["me"],
  period,
  onProgress,
}: PublishStoryParams): Promise<PublishStoryResult[]> {
  const client = await getClient();

  // uploadFile's progress only covers the raw bytes going up (0..1); the
  // SendStory RPC calls that follow have no granular signal of their own,
  // so that leg is reported as a fixed 95% while in flight per target.
  const uploadedFile = await client.uploadFile({
    file,
    workers: 1,
    onProgress: onProgress ? (fraction) => onProgress(Math.min(fraction, 1) * 0.95) : undefined,
  });
  const isVideo = file.type.startsWith("video/");
  const privacyRules = toPrivacyRules(privacy);

  const results: PublishStoryResult[] = [];
  for (const target of targets) {
    // A fresh InputMedia wrapper per call — GramJS/MTProto consume the
    // uploaded file reference by value in each request; the underlying
    // uploaded bytes on Telegram's side are what's actually being reused.
    const media = isVideo
      ? new Api.InputMediaUploadedDocument({
          file: uploadedFile,
          mimeType: file.type || "video/mp4",
          attributes: [
            new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true }),
          ],
        })
      : new Api.InputMediaUploadedPhoto({ file: uploadedFile });

    try {
      const result = await client.invoke(
        new Api.stories.SendStory({
          peer: target,
          media,
          privacyRules,
          caption,
          period,
          randomId: generateRandomLong(),
        }),
      );
      results.push({ target, storyId: extractStoryId(result), error: null });
    } catch (error) {
      results.push({ target, storyId: null, error });
    }
  }

  onProgress?.(1);
  return results;
}

/** Deletes a previously published story from Telegram (not just local history). */
export async function deleteStory(storyId: number, target: StoryTarget = "me"): Promise<void> {
  const client = await getClient();
  await client.invoke(new Api.stories.DeleteStories({ peer: target, id: [storyId] }));
}

/**
 * Same as deleteStory but for many at once, across possibly-different
 * targets — a bulk selection can span the personal account and several
 * channels now (see MyStoryItem.target), and Telegram's DeleteStories
 * takes one peer per call, so this groups by target and issues one call
 * per group rather than one call per story.
 */
export async function deleteStories(stories: { id: number; target: StoryTarget }[]): Promise<void> {
  if (stories.length === 0) return;
  const client = await getClient();
  const byTarget = new Map<StoryTarget, number[]>();
  for (const { id, target } of stories) {
    const list = byTarget.get(target) ?? [];
    list.push(id);
    byTarget.set(target, list);
  }
  await Promise.all(
    [...byTarget.entries()].map(([target, ids]) =>
      client.invoke(new Api.stories.DeleteStories({ peer: target, id: ids })),
    ),
  );
}

export interface StoryTargetOption {
  id: string; // pass straight back as StoryTarget
  title: string;
  kind: "channel" | "group";
  username: string | null;
}

/**
 * Channels and groups this account can post stories to (besides its own
 * personal "me" story) — anywhere it's the creator or has been granted
 * the postStories admin right. Fetched from the account's own dialog list
 * rather than a dedicated "which chats can I post stories to" endpoint,
 * because Telegram doesn't expose one; this is the same data Telegram's
 * own apps derive their story-composer target picker from.
 */
export async function getStoryTargets(): Promise<StoryTargetOption[]> {
  const client = await getClient();
  const dialogs = await client.getDialogs({ limit: 200 });
  const options: StoryTargetOption[] = [];

  for (const dialog of dialogs) {
    const entity = dialog.entity;
    if (!(entity instanceof Api.Channel)) continue;
    const canPost = entity.creator || entity.adminRights?.postStories;
    if (!canPost) continue;
    options.push({
      id: entity.username ? entity.username : utils.getPeerId(entity),
      title: entity.title,
      kind: entity.megagroup ? "group" : "channel",
      username: entity.username ?? null,
    });
  }

  return options;
}


function privacyFromRules(rules: Api.TypePrivacyRule[] | undefined): StoryPrivacy {
  for (const rule of rules ?? []) {
    if (rule instanceof Api.PrivacyValueAllowCloseFriends) return "closeFriends";
    if (rule instanceof Api.PrivacyValueAllowContacts) return "contacts";
  }
  return "everyone";
}

function mediaTypeFromStory(media: Api.TypeMessageMedia): "photo" | "video" {
  if (media instanceof Api.MessageMediaDocument) return "video";
  return "photo";
}

export interface MyStoryItem {
  id: number;
  date: number; // unix seconds, when it was posted
  expireDate: number; // unix seconds, when it disappears (or already has)
  expired: boolean;
  caption: string | null;
  privacy: StoryPrivacy;
  pinned: boolean;
  mediaType: "photo" | "video";
  views: number | null;
  /** Total reactions ("likes") on the story — Telegram stories use emoji reactions rather than a single like button, this is the sum across all of them. */
  reactions: number | null;
  /** Which account/channel/group this story was posted to — needed to delete it against the right peer. */
  target: StoryTarget;
  /** Display name for `target` — "" for the personal account (the UI already has its own "My Story" label for that case). */
  targetLabel: string;
  /** Kept for the viewer/download — not meant to be read directly by UI code. */
  media: Api.TypeMessageMedia;
}

function toMyStoryItem(item: Api.StoryItem, target: StoryTarget, targetLabel: string): MyStoryItem {
  return {
    id: item.id,
    date: item.date,
    expireDate: item.expireDate,
    expired: item.expireDate * 1000 <= Date.now(),
    caption: item.caption ?? null,
    privacy: privacyFromRules(item.privacy),
    pinned: item.pinned ?? false,
    mediaType: mediaTypeFromStory(item.media),
    views: item.views?.viewsCount ?? null,
    reactions: item.views?.reactionsCount ?? null,
    target,
    targetLabel,
    media: item.media,
  };
}

/** Currently-active (not yet expired) stories for one target — what shows on that account/channel's story ring right now. */
export async function getMyStories(target: StoryTarget = "me", targetLabel = ""): Promise<MyStoryItem[]> {
  const client = await getClient();
  const result = await client.invoke(new Api.stories.GetPeerStories({ peer: target }));
  return result.stories.stories
    .filter((s): s is Api.StoryItem => s instanceof Api.StoryItem)
    .map((s) => toMyStoryItem(s, target, targetLabel))
    .sort((a, b) => b.date - a.date);
}

/**
 * Past stories that have already expired (>24h old) — Telegram keeps these
 * under a separate "archive" endpoint; GetPeerStories alone only ever
 * returns what's currently active, so a list built from that call alone
 * would lose every story as soon as a day passes.
 */
export async function getMyStoryArchive(
  target: StoryTarget = "me",
  targetLabel = "",
  limit = 100,
): Promise<MyStoryItem[]> {
  const client = await getClient();
  const result = await client.invoke(
    new Api.stories.GetStoriesArchive({ peer: target, offsetId: 0, limit }),
  );
  return result.stories
    .filter((s): s is Api.StoryItem => s instanceof Api.StoryItem)
    .map((s) => toMyStoryItem(s, target, targetLabel))
    .sort((a, b) => b.date - a.date);
}

function logTargetFetchFailure(context: string, target: StoryTarget, err: unknown): void {
  // Deliberately non-fatal (one channel's stories failing to load shouldn't
  // blank the whole list), but silent-and-untraceable was the actual bug —
  // this is the only place these specific failures surface at all.
  console.error(`[telegram] ${context} failed for target "${target}":`, err);
}

/**
 * Active-only version of getAllMyStories (no archive) — for callers that
 * specifically mean "what's live right now across every target", like the
 * home screen's active-story count, where including expired stories would
 * misrepresent the number.
 */
export async function getAllActiveStories(): Promise<MyStoryItem[]> {
  const channelTargets = await getStoryTargets().catch((err) => {
    logTargetFetchFailure("getStoryTargets", "me", err);
    return [] as StoryTargetOption[];
  });
  const allTargets: { id: StoryTarget; label: string }[] = [
    { id: "me", label: "" },
    ...channelTargets.map((t) => ({ id: t.id, label: t.title })),
  ];
  const perTarget = await Promise.all(
    allTargets.map(({ id, label }) =>
      getMyStories(id, label).catch((err) => {
        logTargetFetchFailure("getMyStories", id, err);
        return [] as MyStoryItem[];
      }),
    ),
  );
  return perTarget.flat().sort((a, b) => b.date - a.date);
}

/**
 * Active + archived stories across the personal account AND every
 * channel/group this account can post stories to (same set
 * getStoryTargets/the composer's "post to" picker offers) — deduplicated
 * by id, newest first. This is the "all my stories, everywhere" list;
 * fetching per-target rather than just "me" is what makes a story posted
 * to a channel actually show up in history at all.
 */
export async function getAllMyStories(): Promise<MyStoryItem[]> {
  const channelTargets = await getStoryTargets().catch((err) => {
    logTargetFetchFailure("getStoryTargets", "me", err);
    return [] as StoryTargetOption[];
  });
  const allTargets: { id: StoryTarget; label: string }[] = [
    { id: "me", label: "" },
    ...channelTargets.map((t) => ({ id: t.id, label: t.title })),
  ];

  const perTarget = await Promise.all(
    allTargets.map(async ({ id, label }) => {
      const [active, archived] = await Promise.all([
        getMyStories(id, label).catch((err) => {
          logTargetFetchFailure("getMyStories", id, err);
          return [] as MyStoryItem[];
        }),
        getMyStoryArchive(id, label).catch((err) => {
          logTargetFetchFailure("getMyStoryArchive", id, err);
          return [] as MyStoryItem[];
        }),
      ]);
      return [...active, ...archived];
    }),
  );

  const byKey = new Map<string, MyStoryItem>();
  for (const item of perTarget.flat()) byKey.set(`${item.target}:${item.id}`, item);
  return [...byKey.values()].sort((a, b) => b.date - a.date);
}

/**
 * Downloads a story's actual photo/video bytes (not just its metadata) as
 * a Blob the caller can show in an <img>/<video> or trigger a save-to-disk
 * download for via a temporary object URL.
 */
export async function downloadStoryMedia(
  story: MyStoryItem,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const client = await getClient();
  const bytes = await client.downloadMedia(story.media, {
    progressCallback: onProgress
      ? (received, total) => onProgress(received.toJSNumber() / total.toJSNumber())
      : undefined,
  });
  if (!bytes || typeof bytes === "string") throw new Error("Couldn't download story media.");
  const mime = story.mediaType === "video" ? "video/mp4" : "image/jpeg";
  return new Blob([new Uint8Array(bytes)], { type: mime });
}

const DEFAULT_CAPTION_LIMIT = 200;
const DEFAULT_PREMIUM_CAPTION_LIMIT = 2048;

function readAppConfigInt(config: Api.TypeJSONValue, key: string): number | null {
  if (!(config instanceof Api.JsonObject)) return null;
  for (const entry of config.value) {
    if (entry.key === key && entry.value instanceof Api.JsonNumber) return entry.value.value;
  }
  return null;
}

/**
 * The real caption length limit for THIS account, not a hardcoded guess,
 * plus whether it's Premium (which also gates being able to pick a story
 * duration other than 24h — see STORY_PERIOD_OPTIONS). Both come from
 * server-side config/account state that can change, so they're read live
 * rather than assumed. One combined call so the story composer — the only
 * caller that needs both — doesn't fetch getMe()/GetAppConfig() twice.
 */
export interface AccountCapabilities {
  isPremium: boolean;
  captionLimit: number;
}

export async function getAccountCapabilities(): Promise<AccountCapabilities> {
  const client = await getClient();
  const [me, appConfig] = await Promise.all([
    client.getMe() as Promise<Api.User>,
    client.invoke(new Api.help.GetAppConfig({})),
  ]);

  const isPremium = !!me.premium;
  if (!(appConfig instanceof Api.help.AppConfig)) {
    return { isPremium, captionLimit: isPremium ? DEFAULT_PREMIUM_CAPTION_LIMIT : DEFAULT_CAPTION_LIMIT };
  }

  const key = isPremium ? "story_caption_length_limit_premium" : "story_caption_length_limit_default";
  const fallback = isPremium ? DEFAULT_PREMIUM_CAPTION_LIMIT : DEFAULT_CAPTION_LIMIT;
  return { isPremium, captionLimit: readAppConfigInt(appConfig.config, key) ?? fallback };
}

/**
 * True when Telegram itself has already invalidated this session — logged
 * out remotely, the auth key was revoked, the account was deactivated —
 * as opposed to a transient network/rate-limit failure. There's nothing to
 * retry here: the credential is dead, so callers should wipe it locally
 * (clearPersistedSession) rather than let a known-invalid session string
 * keep sitting in storage.
 */
export function isSessionInvalidated(err: unknown): boolean {
  if (!(err instanceof RPCError)) return false;
  return (
    err.errorMessage === "AUTH_KEY_UNREGISTERED" ||
    err.errorMessage === "SESSION_REVOKED" ||
    err.errorMessage === "USER_DEACTIVATED" ||
    err.errorMessage === "USER_DEACTIVATED_BAN"
  );
}

/**
 * Wipes a session that's known to be dead (see isSessionInvalidated) —
 * same local cleanup as logout(), but without calling auth.LogOut on a
 * session Telegram has already killed, which would just fail.
 */
export async function forgetInvalidSession(): Promise<void> {
  await clearPersistedSession();
  clientPromise = null;
}

export { RPCError, FloodWaitError };
