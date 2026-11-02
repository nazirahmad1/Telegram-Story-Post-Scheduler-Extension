import { describe, expect, it } from "vitest";
import { DEFAULT_TRANSFORM } from "../media-transform";
import {
  MAX_STORY_VIDEO_SECONDS,
  canUploadVideoOriginal,
  clampTrim,
  defaultTrim,
  videoHasChanges,
} from "../video-transform";

const mp4 = new File(["x"], "clip.mp4", { type: "video/mp4" });
const mov = new File(["x"], "clip.mov", { type: "video/quicktime" });

describe("video-transform", () => {
  it("caps the default trim at Telegram's 60-second story limit", () => {
    expect(defaultTrim(20)).toEqual({ start: 0, end: 20 });
    expect(defaultTrim(120)).toEqual({ start: 0, end: MAX_STORY_VIDEO_SECONDS });
    expect(defaultTrim(0)).toEqual({ start: 0, end: 0 });
  });

  it("keeps the trim range inside the source and at least 0.3s long", () => {
    expect(clampTrim({ start: -5, end: 10 }, 20)).toEqual({ start: 0, end: 10 });
    expect(clampTrim({ start: 19.9, end: 30 }, 20)).toEqual({ start: 19.7, end: 20 });
    expect(clampTrim({ start: 5, end: 5 }, 20)).toEqual({ start: 5, end: 5.3 });
  });

  it("uploads an untouched 60s-or-less MP4 as-is", () => {
    expect(canUploadVideoOriginal(mp4, DEFAULT_TRANSFORM, { start: 0, end: 20 }, 20)).toBe(true);
    expect(canUploadVideoOriginal(mp4, DEFAULT_TRANSFORM, { start: 0, end: 60 }, 60)).toBe(true);
  });

  it("re-encodes a non-MP4, an edited, or an over-60s video", () => {
    expect(canUploadVideoOriginal(mov, DEFAULT_TRANSFORM, { start: 0, end: 20 }, 20)).toBe(false);
    expect(canUploadVideoOriginal(mp4, { ...DEFAULT_TRANSFORM, zoom: 1.2 }, { start: 0, end: 20 }, 20)).toBe(false);
    expect(canUploadVideoOriginal(mp4, DEFAULT_TRANSFORM, { start: 0, end: 20 }, 90)).toBe(false);
  });

  it("reports changes consistently with the upload decision", () => {
    expect(videoHasChanges(mp4, DEFAULT_TRANSFORM, { start: 0, end: 20 }, 20)).toBe(false);
    expect(videoHasChanges(mp4, DEFAULT_TRANSFORM, { start: 2, end: 20 }, 20)).toBe(true);
    expect(videoHasChanges(mp4, DEFAULT_TRANSFORM, { start: 0, end: 10 }, 20)).toBe(true);
    expect(videoHasChanges(mov, DEFAULT_TRANSFORM, { start: 0, end: 20 }, 20)).toBe(true);
  });
});
