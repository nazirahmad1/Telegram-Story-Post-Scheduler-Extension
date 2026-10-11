/**
 * The toolbar badge (see background.ts#bumpScheduledBadge) is a backup
 * signal for "something finished while you weren't looking" — it doesn't
 * depend on OS notification settings at all, just on the person glancing
 * at their browser toolbar. Clearing it here, the moment they actually
 * open the Scheduled tab, is what makes it act like an unread count
 * rather than a number that just keeps climbing forever.
 */
export async function clearScheduledBadge(): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.action) {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // Non-fatal — the badge is a courtesy, not something worth surfacing an error for.
  }
}
