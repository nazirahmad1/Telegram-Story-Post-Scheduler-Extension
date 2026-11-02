import {
  DEFAULT_TRANSFORM,
  drawStoryFrame,
  isDefaultTransform,
  STORY_HEIGHT,
  STORY_WIDTH,
  type MediaTransform,
  type Size,
} from "./media-transform";
import { isMp4Video } from "./media-file";

/** Telegram stories accept at most 60 seconds of video. */
export const MAX_STORY_VIDEO_SECONDS = 60;

/** Thrown when the person cancels while the edited video is being rendered. */
export class VideoEditCancelledError extends Error {
  constructor() {
    super("Video rendering was cancelled.");
    this.name = "VideoEditCancelledError";
  }
}

/**
 * Thrown when this browser can decode the video but can't *encode* it as an
 * MP4. Telegram stories only accept MP4, so silently producing WebM would
 * just fail later with a much less useful Telegram error.
 */
export class VideoExportUnsupportedError extends Error {
  constructor() {
    super("This browser can't export MP4 video. The video can still be posted without editing.");
    this.name = "VideoExportUnsupportedError";
  }
}

/** The selected trim range is longer than Telegram's story limit. */
export class VideoClipTooLongError extends Error {
  duration: number;
  constructor(duration: number) {
    super(`The selected video is ${Math.ceil(duration)} seconds; stories allow at most ${MAX_STORY_VIDEO_SECONDS}.`);
    this.name = "VideoClipTooLongError";
    this.duration = duration;
  }
}

/**
 * MP4 first: Telegram stories only accept MP4. The codec strings are ordered
 * from most compatible (H.264 baseline + AAC) to the generic container name.
 */
const MP4_RECORDER_MIMES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
] as const;

/** The MP4 MIME type MediaRecorder can actually produce here, or null. */
export function pickMp4RecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  try {
    return MP4_RECORDER_MIMES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
  } catch {
    return null;
  }
}

export interface VideoTrim {
  /** Seconds from the start of the source. */
  start: number;
  /** Seconds from the start of the source. */
  end: number;
}

/** Keeps the trim range inside the video and at least 0.3s long. */
export function clampTrim(trim: VideoTrim, duration: number): VideoTrim {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const start = Math.min(Math.max(0, trim.start), Math.max(0, safeDuration - 0.3));
  const end = Math.min(Math.max(start + 0.3, trim.end), safeDuration || start + 0.3);
  return { start, end };
}

/**
 * True when the original video bytes can be uploaded as-is: MP4, inside the
 * 60s limit, untouched transform, and no trimming. In that case we avoid a
 * costly re-encode entirely — which is also the path that was broken before
 * (metadata was missing, so Telegram rejected the upload).
 */
export function canUploadVideoOriginal(
  file: Pick<File, "type" | "name">,
  transform: MediaTransform,
  trim: VideoTrim,
  duration: number,
): boolean {
  if (!isMp4Video(file) || !isDefaultTransform(transform)) return false;
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_STORY_VIDEO_SECONDS + 0.5) return false;
  return trim.start < 0.05 && trim.end >= duration - 0.05;
}

export interface RenderVideoOptions {
  transform: MediaTransform;
  trim: VideoTrim;
  /** Output size. Defaults to Telegram's 1080x1920 story canvas. */
  width?: number;
  height?: number;
  fps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Re-encodes a video into a 9:16 MP4 with the same transform as the photo
 * editor (zoom/crop, pan, rotate, flip, colour adjustments) and an optional
 * trim range. Frames are painted to a canvas while the source plays; audio
 * is copied from the source element when the browser exposes it.
 *
 * This is real-time by nature (MediaRecorder records a live stream), so a
 * 20-second clip takes about 20 seconds to export. The UI shows progress.
 */
export async function renderVideoStory(file: File, src: Size, options: RenderVideoOptions): Promise<File> {
  if (options.signal?.aborted) throw new VideoEditCancelledError();
  const mimeType = pickMp4RecorderMime();
  if (!mimeType) throw new VideoExportUnsupportedError();

  const width = options.width ?? STORY_WIDTH;
  const height = options.height ?? STORY_HEIGHT;
  const fps = options.fps ?? 30;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;
  video.volume = 1;
  // A detached video still plays, but Chrome's captureStream() is more
  // reliable when the element is in the document.
  video.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    URL.revokeObjectURL(url);
    video.remove();
    throw new Error("Canvas is not available in this browser.");
  }

  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  let videoFrameId: number | null = null;
  let audioCleanup: (() => void) | null = null;
  let cancelled = false;
  let aborted = false;

  const stream = canvas.captureStream(fps);

  const stopPlayback = () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (videoFrameId !== null) {
      try {
        video.cancelVideoFrameCallback(videoFrameId);
      } catch {
        /* Not supported. */
      }
      videoFrameId = null;
    }
    try {
      video.pause();
    } catch {
      /* Already stopped. */
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Already stopping. */
      }
    }
  };

  const onAbort = () => {
    aborted = true;
    stopPlayback();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const chunks: BlobPart[] = [];

  try {
    await waitFor(video, "loadedmetadata", 15000, options.signal);
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitFor(video, "loadeddata", 15000, options.signal);
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!duration) throw new Error("Couldn't read the video duration.");

    const trim = clampTrim(options.trim, duration);
    if (trim.end - trim.start > MAX_STORY_VIDEO_SECONDS + 0.5) {
      throw new VideoClipTooLongError(trim.end - trim.start);
    }

    await seekTo(video, trim.start);
    if (aborted || options.signal?.aborted) throw new VideoEditCancelledError();
    await resumeAudioOnGesture();
    if (aborted || options.signal?.aborted) throw new VideoEditCancelledError();

    // Audio: prefer the element's own captureStream (keeps A/V in sync), and
    // fall back to WebAudio where that isn't available.
    audioCleanup = attachAudio(video, stream);

    // Draw the first frame before recording starts so frame 0 is never black.
    drawStoryFrame(ctx, video, src, options.transform, width, height);
    if (aborted || options.signal?.aborted) throw new VideoEditCancelledError();

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: Math.min(12_000_000, Math.max(4_000_000, width * height * 4)),
      audioBitsPerSecond: 128_000,
    });
    const recorded = new Promise<Blob>((resolve, reject) => {
      const current = recorder!;
      current.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      current.onerror = () => reject(new Error("The video recorder failed while exporting."));
      current.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start(250);
    // An abort that landed between creating the recorder and starting it would
    // not have stopped it (its state was still "inactive"), leaving `recorded`
    // pending forever. Now that it is recording, stop it if we were cancelled.
    if (aborted || options.signal?.aborted) {
      stopPlayback();
      throw new VideoEditCancelledError();
    }

    const scheduleFrame = () => {
      if (cancelled) return;
      const t = video.currentTime;
      if (t >= trim.end - 0.02 || video.ended) {
        stopPlayback();
        return;
      }
      drawStoryFrame(ctx, video, src, options.transform, width, height);
      options.onProgress?.(Math.min(0.95, Math.max(0, (t - trim.start) / (trim.end - trim.start))));
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrameId = video.requestVideoFrameCallback(() => scheduleFrame());
      } else {
        rafId = requestAnimationFrame(scheduleFrame);
      }
    };

    await video.play();
    scheduleFrame();
    const recordedBlob = await recorded;
    if (aborted) throw new VideoEditCancelledError();
    options.onProgress?.(1);
    const base = file.name.replace(/\.[^.]+$/, "") || "story";
    return new File([recordedBlob], `${base}.mp4`, { type: "video/mp4", lastModified: Date.now() });
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (videoFrameId !== null) {
      try {
        video.cancelVideoFrameCallback(videoFrameId);
      } catch {
        /* Not supported. */
      }
    }
    try {
      video.pause();
    } catch {
      /* Already stopped. */
    }
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* Already stopping. */
      }
    }
    stream.getTracks().forEach((track) => track.stop());
    audioCleanup?.();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

function waitFor(video: HTMLVideoElement, event: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      signal?.removeEventListener("abort", onAbort);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(new VideoEditCancelledError());
    };
    if (signal?.aborted) return onAbort();
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load."));
    }, timeoutMs);
    video.addEventListener(event, onEvent, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

async function resumeAudioOnGesture(): Promise<void> {
  // AudioContexts start suspended until a user gesture. Publishing is always
  // triggered by a click, so this normally resolves immediately.
  const Ctor = window.AudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    await ctx.resume();
    await ctx.close();
  } catch {
    /* Ignore: audio capture falls back below. */
  }
}

/**
 * Returns audio tracks from the video to add to the canvas stream. Uses the
 * element's captureStream when present; otherwise routes the element through
 * a MediaStreamDestination with WebAudio.
 */
function attachAudio(video: HTMLVideoElement, canvasStream: MediaStream): (() => void) | null {
  const captured = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
  const capturedAudio = captured?.getAudioTracks() ?? [];
  if (capturedAudio.length > 0) {
    capturedAudio.forEach((track) => canvasStream.addTrack(track));
    return () => capturedAudio.forEach((track) => track.stop());
  }

  const Ctor = window.AudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(video);
    const destination = ctx.createMediaStreamDestination();
    source.connect(destination);
    source.connect(ctx.destination);
    const tracks = destination.stream.getAudioTracks();
    tracks.forEach((track) => canvasStream.addTrack(track));
    return () => {
      try {
        source.disconnect();
      } catch {
        /* Already disconnected. */
      }
      tracks.forEach((track) => track.stop());
      void ctx.close();
    };
  } catch {
    return null;
  }
}

/** Default trim for a freshly selected video: the whole clip, capped at Telegram's 60s story limit. */
export function defaultTrim(duration: number): VideoTrim {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  return { start: 0, end: Math.min(duration, MAX_STORY_VIDEO_SECONDS) };
}

/** Whether the editor has anything to export for this video. */
export function videoHasChanges(
  file: Pick<File, "type" | "name">,
  transform: MediaTransform,
  trim: VideoTrim,
  duration: number,
): boolean {
  if (!isMp4Video(file)) return true;
  if (!isDefaultTransform(transform)) return true;
  if (!Number.isFinite(duration) || duration <= 0) return true;
  if (trim.start > 0.05) return true;
  if (trim.end < duration - 0.05) return true;
  return trim.end - trim.start > MAX_STORY_VIDEO_SECONDS + 0.5;
}

export { DEFAULT_TRANSFORM };
