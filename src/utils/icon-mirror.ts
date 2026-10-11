import type { CSSProperties } from "react";
import type { TextDirection } from "../i18n/config";

/**
 * Not every icon should mirror in RTL. Directional icons (arrows, chevrons,
 * "reply", pagination) represent motion/order and must flip so they still
 * point the way the eye reads. Object icons (camera, gear, trash, a logo)
 * depict a physical thing and must NEVER mirror — flipping a camera icon
 * doesn't make it "more RTL", it just makes it wrong.
 *
 * Add new icon names to the appropriate list below; nothing outside this
 * file should decide mirroring on its own.
 */

export const MIRRORS_IN_RTL = new Set([
  "arrow-forward",
  "arrow-back",
  "chevron-forward",
  "chevron-back",
  "chevron-left",
  "chevron-right",
  "reply",
  "redo",
  "undo",
  "send",
  "pagination-next",
  "pagination-prev",
  "sidebar-collapse",
  "sidebar-expand",
]);

export const NEVER_MIRRORS = new Set([
  "camera",
  "settings",
  "gear",
  "telegram-logo",
  "upload",
  "download",
  "delete",
  "trash",
  "search",
  "clock",
  "calendar",
  "user",
  "check",
  "close",
  "warning",
  "info",
  "home",
  "create",
  "logo",
  "qr-code",
  "phone",
]);

/**
 * Returns whether a given icon name should be horizontally mirrored for the
 * current text direction. Unknown icon names default to "never mirror" —
 * mirroring is opt-in, not opt-out, so a forgotten icon never mirrors by
 * accident.
 */
export function shouldMirrorIcon(iconName: string, dir: TextDirection): boolean {
  if (dir !== "rtl") return false;
  if (NEVER_MIRRORS.has(iconName)) return false;
  return MIRRORS_IN_RTL.has(iconName);
}

/** Convenience: a transform style to spread onto an icon's wrapper/svg. */
export function iconMirrorStyle(iconName: string, dir: TextDirection): CSSProperties {
  return shouldMirrorIcon(iconName, dir) ? { transform: "scaleX(-1)" } : {};
}
