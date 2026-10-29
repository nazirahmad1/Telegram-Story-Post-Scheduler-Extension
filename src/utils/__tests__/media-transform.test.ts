import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSFORM,
  MAX_ZOOM,
  MIN_ZOOM,
  canUploadOriginal,
  clampTransform,
  coverScale,
  fitZoom,
  rotateBy90,
  zoomAt,
  STORY_HEIGHT,
  STORY_WIDTH,
} from "../media-transform";

const landscape = { w: 4000, h: 3000 };
const portrait916 = { w: 1080, h: 1920 };

describe("media-transform", () => {
  it("cover scale fills the frame on both axes", () => {
    const s = coverScale(landscape, 0);
    expect(landscape.w * s).toBeGreaterThanOrEqual(STORY_WIDTH - 0.001);
    expect(landscape.h * s).toBeGreaterThanOrEqual(STORY_HEIGHT - 0.001);
  });

  it("swaps width/height after a quarter turn", () => {
    expect(coverScale(landscape, 90)).toBeCloseTo(Math.max(STORY_WIDTH / 3000, STORY_HEIGHT / 4000));
  });

  it("fit zoom shows the whole image and is below 1 for a landscape photo", () => {
    const z = fitZoom(landscape, 0);
    expect(z).toBeLessThan(1);
    expect(landscape.w * coverScale(landscape, 0) * z).toBeCloseTo(STORY_WIDTH);
  });

  it("clamps zoom into the allowed range", () => {
    expect(clampTransform({ ...DEFAULT_TRANSFORM, zoom: 99 }, landscape).zoom).toBe(MAX_ZOOM);
    expect(clampTransform({ ...DEFAULT_TRANSFORM, zoom: 0 }, landscape).zoom).toBe(MIN_ZOOM);
  });

  it("limits panning so the image can't be lost off-screen", () => {
    const t = clampTransform({ ...DEFAULT_TRANSFORM, offsetX: 1e6, offsetY: -1e6 }, landscape);
    expect(Math.abs(t.offsetX)).toBeLessThan(STORY_WIDTH * 3);
    expect(t.offsetX).toBeGreaterThan(0);
    expect(t.offsetY).toBeLessThan(0);
  });

  it("zooming at the frame centre doesn't move the image", () => {
    const t = zoomAt(DEFAULT_TRANSFORM, 2, { x: STORY_WIDTH / 2, y: STORY_HEIGHT / 2 }, landscape);
    expect(t.zoom).toBe(2);
    expect(t.offsetX).toBeCloseTo(0);
    expect(t.offsetY).toBeCloseTo(0);
  });

  it("zooming at a corner keeps the pixel under that corner fixed", () => {
    const anchor = { x: 0, y: 0 };
    const before = DEFAULT_TRANSFORM;
    const after = zoomAt(before, 2, anchor, landscape);
    // The image-centre-to-anchor vector doubles when zoom doubles.
    const cxBefore = STORY_WIDTH / 2 + before.offsetX;
    const cxAfter = STORY_WIDTH / 2 + after.offsetX;
    expect(cxAfter - anchor.x).toBeCloseTo((cxBefore - anchor.x) * 2, 3);
  });

  it("rotating resets pan/zoom and cycles 0→90→180→270→0", () => {
    let t = DEFAULT_TRANSFORM;
    const seen = [];
    for (let i = 0; i < 4; i++) {
      t = rotateBy90({ ...t, zoom: 2, offsetX: 50 }, landscape);
      seen.push(t.rotation);
      expect(t.zoom).toBe(1);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it("uploads an untouched 9:16 photo as-is, but re-renders anything else", () => {
    expect(canUploadOriginal(portrait916, DEFAULT_TRANSFORM)).toBe(true);
    expect(canUploadOriginal(landscape, DEFAULT_TRANSFORM)).toBe(false);
    expect(canUploadOriginal(portrait916, { ...DEFAULT_TRANSFORM, zoom: 1.2 })).toBe(false);
    expect(canUploadOriginal(portrait916, { ...DEFAULT_TRANSFORM, flipX: true })).toBe(false);
  });
});
