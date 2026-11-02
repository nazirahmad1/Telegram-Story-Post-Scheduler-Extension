import type { VideoMeta } from "../telegram/client";

/**
 * Reads a video's real duration and pixel size — Telegram needs both on the
 * document attributes. A missing/zero value is exactly what makes
 * `stories.sendStory` answer MEDIA_FILE_INVALID, so callers must treat a
 * null result as "this file can't be posted", not as "post it with zeros".
 */
export function readVideoMeta(file: Blob): Promise<VideoMeta | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (meta: VideoMeta | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.ontimeupdate = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(meta);
    };
    const finish = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      done(
        Number.isFinite(duration) && duration > 0 && width > 0 && height > 0
          ? { duration, width, height, hasAudio: hasAudioTrack(video) }
          : null,
      );
    };
    const timer = setTimeout(() => done(null), 15000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      // Some containers (notably fragmented MP4/WebM) report Infinity until
      // the browser seeks near the end. Seeking once forces the real duration
      // to be calculated instead of giving up and uploading zeroed metadata.
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish();
        return;
      }
      video.ontimeupdate = () => {
        video.ontimeupdate = null;
        finish();
      };
      try {
        video.currentTime = 1e101;
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

function hasAudioTrack(video: HTMLVideoElement): boolean | undefined {
  const withLegacyAudio = video as HTMLVideoElement & {
    mozHasAudio?: boolean;
    webkitAudioDecodedByteCount?: number;
    audioTracks?: { length: number };
  };
  if (typeof withLegacyAudio.mozHasAudio === "boolean") return withLegacyAudio.mozHasAudio;
  if (withLegacyAudio.audioTracks) return withLegacyAudio.audioTracks.length > 0;
  return undefined;
}

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  // imageOrientation applies the EXIF rotation, so phone photos aren't sideways.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}
