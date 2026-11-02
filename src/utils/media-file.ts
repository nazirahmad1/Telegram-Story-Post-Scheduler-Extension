/**
 * File-type helpers shared by the composer, the scheduler and the Telegram
 * client. Browsers disagree about the `type` of a local file (Windows in
 * particular often reports an empty string for .mkv/.mov/.mp4), so every
 * decision here also falls back to the file extension. Without that fallback
 * a perfectly good MP4 can be rejected as an "unsupported format" before it
 * ever reaches Telegram.
 */
export type MediaKind = "image" | "video";

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;
const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv)$/i;
const MP4_EXTENSION = /\.(mp4|m4v)$/i;

/** "image", "video", or null for a file the extension doesn't understand. */
export function mediaKind(file: Pick<File, "type" | "name">): MediaKind | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (IMAGE_EXTENSION.test(file.name)) return "image";
  if (VIDEO_EXTENSION.test(file.name)) return "video";
  return null;
}

/**
 * Fills in a missing MIME type from the extension so the rest of the app can
 * keep using `file.type`. Returns the original file when nothing is missing.
 */
export function normalizeMediaFile(file: File): File {
  if (file.type) return file;
  const kind = mediaKind(file);
  if (!kind) return file;
  let type = "";
  if (kind === "image") {
    const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "jpg";
    type = ext === "jpg" ? "image/jpeg" : ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
  } else if (MP4_EXTENSION.test(file.name)) {
    type = "video/mp4";
  } else {
    const ext = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? "mp4";
    type = ext === "mov" ? "video/quicktime" : `video/${ext}`;
  }
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

/** True for an MP4/M4V container, which is the only video container Telegram stories reliably accept. */
export function isMp4Video(file: Pick<File, "type" | "name">): boolean {
  const type = file.type.toLowerCase();
  if (type === "video/mp4" || type === "video/x-m4v") return true;
  if (MP4_EXTENSION.test(file.name)) return !type || type === "video/quicktime" || type === "application/octet-stream";
  return false;
}

/** The MIME type Telegram should be told for an upload. */
export function uploadMimeFor(file: Pick<File, "type" | "name">): string {
  const kind = mediaKind(file);
  if (kind === "video") return isMp4Video(file) ? "video/mp4" : file.type || "video/mp4";
  if (file.type) return file.type;
  return "image/jpeg";
}

/** A safe .mp4 file name for the document attribute Telegram stores. */
export function mp4FileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "story";
  return `${base}.mp4`;
}
