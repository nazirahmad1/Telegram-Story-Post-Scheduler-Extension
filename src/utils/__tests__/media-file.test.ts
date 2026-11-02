import { describe, expect, it } from "vitest";
import { isMp4Video, mediaKind, mp4FileName, normalizeMediaFile } from "../media-file";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("media-file", () => {
  it("detects the kind from the MIME type", () => {
    expect(mediaKind(file("clip.bin", "video/mp4"))).toBe("video");
    expect(mediaKind(file("photo.bin", "image/jpeg"))).toBe("image");
  });

  it("falls back to the extension when Windows reports no MIME type", () => {
    expect(mediaKind(file("holiday.MP4"))).toBe("video");
    expect(mediaKind(file("holiday.mov"))).toBe("video");
    expect(mediaKind(file("photo.JPG"))).toBe("image");
    expect(mediaKind(file("notes.txt"))).toBeNull();
  });

  it("fills in a missing MIME type so the rest of the app can use file.type", () => {
    expect(normalizeMediaFile(file("holiday.mp4")).type).toBe("video/mp4");
    expect(normalizeMediaFile(file("holiday.mov")).type).toBe("video/quicktime");
    expect(normalizeMediaFile(file("photo.png")).type).toBe("image/png");
    const alreadyTyped = file("clip.mp4", "video/mp4");
    expect(normalizeMediaFile(alreadyTyped)).toBe(alreadyTyped);
  });

  it("only treats MP4/M4V as Telegram-compatible video", () => {
    expect(isMp4Video(file("clip.mp4", "video/mp4"))).toBe(true);
    expect(isMp4Video(file("clip.M4V"))).toBe(true);
    expect(isMp4Video(file("clip.mov", "video/quicktime"))).toBe(false);
    expect(isMp4Video(file("clip.webm", "video/webm"))).toBe(false);
  });

  it("renames an upload to .mp4 for the document attribute", () => {
    expect(mp4FileName("holiday.MOV")).toBe("holiday.mp4");
    expect(mp4FileName("no-extension")).toBe("no-extension.mp4");
  });
});
