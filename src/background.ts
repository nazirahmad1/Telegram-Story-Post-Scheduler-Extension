/// <reference types="chrome" />

// Manifest V3 service worker for the story scheduler.
//
// IMPORTANT CONTEXT: this file runs with no `window`, no `document`, and
// gets fully unloaded by Chrome after ~30s of idle — chrome.alarms is what
// wakes it back up at the right time, which is the whole point of using
// alarms instead of a plain setTimeout (a setTimeout set from the popup
// would simply stop existing the moment the popup closes). See
// SECURITY.md and patches/telegram+2.26.22.patch for the GramJS
// environment-detection patch that makes it possible to run GramJS here
// at all — without it, GramJS mistakes a service worker for Node.js (both
// lack `window`) and tries to open a raw TCP socket that doesn't exist in
// this context.
import { publishStory, isSessionInvalidated, checkSession } from "./telegram/client";
import { getScheduledStory, updateScheduledStory } from "./scheduling/db";
import {
  scheduledStoryIdFromAlarm,
  createStoryAlarm,
  SCHEDULED_STORY_UPDATED_MESSAGE,
  MAX_AUTO_RETRIES,
  AUTO_RETRY_DELAY_MS,
} from "./scheduling/alarms";
import { getNotificationStrings } from "./scheduling/notifications-i18n";

async function notify(title: string, message: string) {
  try {
    const id = await chrome.notifications.create({
      type: "basic",
      iconUrl: "icon-128.png",
      title,
      message,
      // Windows/macOS default notifications vanish after a few seconds on
      // their own — easy to miss if you're not looking right at that
      // moment. requireInteraction keeps it on screen until the person
      // actually dismisses it.
      requireInteraction: true,
    });
    console.log("[background] notification created:", id, title);
  } catch (err) {
    // Notifications are a courtesy, not load-bearing — never let a
    // notification failure mask the actual publish result. Still log it:
    // a silently-broken notification path is otherwise invisible, and is
    // exactly the kind of thing that looks like "nothing happened" even
    // when the actual publish succeeded.
    console.error("[background] notification failed:", title, err);
  }
}

/**
 * Backup channel for "a scheduled story finished" that doesn't depend on
 * OS notification settings, Focus Assist, or the person actually seeing a
 * transient popup — a badge on the toolbar icon is visible any time they
 * glance at the browser, and stays until they open the extension.
 * ScheduledList clears it (see clearScheduledBadge in scheduling/badge.ts)
 * the moment the Scheduled tab is actually viewed.
 */
async function bumpScheduledBadge() {
  try {
    const current = await chrome.action.getBadgeText({});
    const next = (Number(current) || 0) + 1;
    await chrome.action.setBadgeText({ text: String(next) });
    await chrome.action.setBadgeBackgroundColor({ color: "#e0433d" });
  } catch (err) {
    console.error("[background] failed to update badge:", err);
  }
}

/**
 * Lets an already-open popup/side panel know a scheduled story's status
 * just changed, so its Scheduled list can refresh itself instead of
 * showing stale state until the person closes and reopens it. If nothing
 * is listening (the common case — the popup is usually closed while
 * waiting for an alarm), sendMessage just resolves with no receiver;
 * this is never allowed to affect the actual publish outcome above it.
 */
function notifyPopup() {
  chrome.runtime.sendMessage({ type: SCHEDULED_STORY_UPDATED_MESSAGE }).catch(() => {});
}

async function runScheduledStory(id: string) {
  try {
    await runScheduledStoryInner(id);
  } finally {
    notifyPopup();
    // A story waiting for an automatic retry hasn't finished — no badge yet.
    const after = await getScheduledStory(id).catch(() => undefined);
    if (after?.status !== "pending") bumpScheduledBadge();
  }
}

async function runScheduledStoryInner(id: string) {
  const entry = await getScheduledStory(id);
  if (!entry || entry.status === "published") return; // already handled, or was canceled/deleted

  const strings = await getNotificationStrings();
  await updateScheduledStory(id, { status: "publishing", lastError: null, failureReason: null });

  // Check login state up front rather than only discovering it from a
  // failed upload. IMPORTANT: only an explicit "session is dead" answer from
  // Telegram counts as logged out. A network/timeout failure here used to be
  // treated as "not logged in", which marked perfectly valid scheduled
  // stories as "session expired" whenever the PC woke up before Wi-Fi did.
  let loggedIn: boolean;
  try {
    loggedIn = (await checkSession()) === "authorized";
  } catch (err) {
    const attempts = (entry.attempts ?? 0) + 1;
    if (attempts <= MAX_AUTO_RETRIES) {
      await updateScheduledStory(id, { status: "pending", attempts, lastError: null, failureReason: null });
      await createStoryAlarm(id, Date.now() + AUTO_RETRY_DELAY_MS);
      console.warn("[background] Telegram unreachable, retrying scheduled story in 2 minutes:", err);
    } else {
      const message = err instanceof Error ? err.message : strings.failedTitle;
      await updateScheduledStory(id, { status: "failed", attempts, lastError: message, failureReason: "other" });
      await notify(strings.failedTitle, message);
    }
    return;
  }
  if (!loggedIn) {
    await updateScheduledStory(id, {
      status: "failed",
      lastError: strings.sessionExpiredBody,
      failureReason: "session",
    });
    await notify(strings.sessionExpiredTitle, strings.sessionExpiredBody);
    return;
  }

  try {
    const file = new File([entry.file], entry.fileName, { type: entry.fileType });
    const results = await publishStory({
      file,
      caption: entry.caption || undefined,
      privacy: entry.privacy,
      allowUserIds: entry.allowUserIds,
      blockUserIds: entry.blockUserIds,
      pinned: entry.pinned,
      noforwards: entry.noforwards,
      video: entry.video,
      targets: entry.targets,
      period: entry.period,
    });

    const failed = results.filter((r) => r.error);
    if (failed.length === 0) {
      await updateScheduledStory(id, { status: "published", lastError: null, failureReason: null });
      await notify(strings.publishedTitle, strings.publishedBody);
      return;
    }

    const sessionDead = failed.some((r) => isSessionInvalidated(r.error));

    if (failed.length === results.length) {
      // Every target failed. If it's because the session is dead, that's
      // the ONE thing worth telling the person clearly — every other
      // detail (which specific RPC error) is secondary to "you need to
      // log in again", so that's what both the stored reason and the
      // notification lead with.
      if (sessionDead) {
        await updateScheduledStory(id, {
          status: "failed",
          lastError: strings.sessionExpiredBody,
          failureReason: "session",
        });
        await notify(strings.sessionExpiredTitle, strings.sessionExpiredBody);
      } else {
        const message = failed[0].error instanceof Error ? failed[0].error.message : strings.failedTitle;
        await updateScheduledStory(id, { status: "failed", lastError: message, failureReason: "other" });
        await notify(strings.failedTitle, message);
      }
    } else {
      const partialMessage = strings.partialBody(results.length - failed.length, results.length);
      await updateScheduledStory(id, {
        status: "failed",
        lastError: partialMessage,
        failureReason: sessionDead ? "session" : "other",
      });
      await notify(strings.partialTitle, partialMessage);
      if (sessionDead) await notify(strings.sessionExpiredTitle, strings.sessionExpiredBody);
    }
  } catch (err) {
    const sessionDead = isSessionInvalidated(err);
    if (sessionDead) {
      await updateScheduledStory(id, {
        status: "failed",
        lastError: strings.sessionExpiredBody,
        failureReason: "session",
      });
      await notify(strings.sessionExpiredTitle, strings.sessionExpiredBody);
    } else {
      const message = err instanceof Error ? err.message : strings.failedTitle;
      await updateScheduledStory(id, { status: "failed", lastError: message, failureReason: "other" });
      await notify(strings.failedTitle, message);
    }
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  const id = scheduledStoryIdFromAlarm(alarm.name);
  if (!id) return;
  // The alarm callback itself can't be async, but Chrome keeps the
  // service worker alive for pending extension-API work — this fire-and
  // -forget call is the documented pattern for MV3 alarm handlers.
  runScheduledStory(id);
});
