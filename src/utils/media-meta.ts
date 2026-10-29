import type { VideoMeta } from "../telegram/client";

/** Reads a video's real duration and pixel size — Telegram wants them on the document. */
export function readVideoMeta(file: Blob): Promise<VideoMeta | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (meta: VideoMeta | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(meta);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(
        Number.isFinite(video.duration) && video.videoWidth > 0
          ? { duration: video.duration, width: video.videoWidth, height: video.videoHeight }
          : null,
      );
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  // imageOrientation applies the EXIF rotation, so phone photos aren't sideways.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}
