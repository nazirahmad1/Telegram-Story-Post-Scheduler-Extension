const ALARM_PREFIX = "storyExtension:scheduledStory:";

/** chrome.runtime message type background.ts broadcasts after a scheduled story's status changes. */
export const SCHEDULED_STORY_UPDATED_MESSAGE = "storyExtension:scheduledStoryUpdated";

export function alarmNameFor(scheduledStoryId: string): string {
  return `${ALARM_PREFIX}${scheduledStoryId}`;
}

export function scheduledStoryIdFromAlarm(alarmName: string): string | null {
  return alarmName.startsWith(ALARM_PREFIX) ? alarmName.slice(ALARM_PREFIX.length) : null;
}

export async function createStoryAlarm(scheduledStoryId: string, whenMs: number): Promise<void> {
  await chrome.alarms.create(alarmNameFor(scheduledStoryId), { when: whenMs });
}

export async function cancelStoryAlarm(scheduledStoryId: string): Promise<void> {
  await chrome.alarms.clear(alarmNameFor(scheduledStoryId));
}

/** Automatic retries for temporary failures (offline, Telegram unreachable) — never for a dead session. */
export const MAX_AUTO_RETRIES = 5;
export const AUTO_RETRY_DELAY_MS = 2 * 60 * 1000;
