/**
 * Geometry for the story media editor — zoom, pan, rotate, flip, adjust.
 * Pure functions (no DOM) so the exact same math drives the live preview and
 * the final 1080x1920 export, and so it can be unit-tested.
 */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 6;

export type Rotation = 0 | 90 | 180 | 270;

export interface Adjustments {
  /** 100 = unchanged. Range 50..150. */
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface MediaTransform {
  /** 1 = the image just covers the 9:16 frame; <1 zooms out (blurred fill shows), >1 zooms in. */
  zoom: number;
  /** Pan of the image centre from the frame centre, in frame pixels (1080x1920 space). */
  offsetX: number;
  offsetY: number;
  rotation: Rotation;
  flipX: boolean;
  adjust: Adjustments;
}

export const DEFAULT_ADJUST: Adjustments = { brightness: 100, contrast: 100, saturation: 100 };
export const DEFAULT_TRANSFORM: MediaTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipX: false,
  adjust: DEFAULT_ADJUST,
};

export interface Size {
  w: number;
  h: number;
}

/** Size of the source after the quarter-turn rotation is applied. */
export function rotatedSize(src: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270 ? { w: src.h, h: src.w } : src;
}

/** Scale at which the (rotated) source exactly covers the frame. */
export function coverScale(src: Size, rotation: Rotation, frame: Size = { w: STORY_WIDTH, h: STORY_HEIGHT }): number {
  const r = rotatedSize(src, rotation);
  return Math.max(frame.w / r.w, frame.h / r.h);
}

/** Zoom value (relative to cover) at which the whole source is visible — the "fit" button. */
export function fitZoom(src: Size, rotation: Rotation, frame: Size = { w: STORY_WIDTH, h: STORY_HEIGHT }): number {
  const r = rotatedSize(src, rotation);
  const contain = Math.min(frame.w / r.w, frame.h / r.h);
  return Math.max(MIN_ZOOM, Math.min(1, contain / coverScale(src, rotation, frame)));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the image from being dragged out of reach. When the image is larger
 * than the frame you can pan across all of it; when smaller you can still move
 * it around, but at least ~80% of the frame's width/height stays overlapped.
 */
export function clampTransform(
  tr: MediaTransform,
  src: Size,
  frame: Size = { w: STORY_WIDTH, h: STORY_HEIGHT },
): MediaTransform {
  const zoom = clamp(tr.zoom, MIN_ZOOM, MAX_ZOOM);
  const r = rotatedSize(src, tr.rotation);
  const scale = coverScale(src, tr.rotation, frame) * zoom;
  const scaledW = r.w * scale;
  const scaledH = r.h * scale;
  const maxX = Math.abs(scaledW - frame.w) / 2 + frame.w * 0.2;
  const maxY = Math.abs(scaledH - frame.h) / 2 + frame.h * 0.2;
  return {
    ...tr,
    zoom,
    offsetX: clamp(tr.offsetX, -maxX, maxX),
    offsetY: clamp(tr.offsetY, -maxY, maxY),
  };
}

/** Zoom around a point (frame coordinates) so the pixel under the cursor/fingers stays put. */
export function zoomAt(
  tr: MediaTransform,
  newZoom: number,
  anchor: { x: number; y: number },
  src: Size,
  frame: Size = { w: STORY_WIDTH, h: STORY_HEIGHT },
): MediaTransform {
  const zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / tr.zoom;
  // Image centre sits at frame centre + offset; scale the vector from anchor to centre.
  const cx = frame.w / 2 + tr.offsetX;
  const cy = frame.h / 2 + tr.offsetY;
  const nx = anchor.x + (cx - anchor.x) * ratio;
  const ny = anchor.y + (cy - anchor.y) * ratio;
  return clampTransform({ ...tr, zoom, offsetX: nx - frame.w / 2, offsetY: ny - frame.h / 2 }, src, frame);
}

export function rotateBy90(tr: MediaTransform, src: Size): MediaTransform {
  const rotation = ((tr.rotation + 90) % 360) as Rotation;
  return clampTransform({ ...tr, rotation, offsetX: 0, offsetY: 0, zoom: 1 }, src);
}

export function isDefaultAdjust(a: Adjustments): boolean {
  return a.brightness === 100 && a.contrast === 100 && a.saturation === 100;
}

export function isDefaultTransform(tr: MediaTransform): boolean {
  return (
    tr.zoom === 1 &&
    tr.offsetX === 0 &&
    tr.offsetY === 0 &&
    tr.rotation === 0 &&
    !tr.flipX &&
    isDefaultAdjust(tr.adjust)
  );
}

/** A photo that is already 9:16 and untouched can be uploaded byte-for-byte (no recompression). */
export function canUploadOriginal(src: Size, tr: MediaTransform): boolean {
  const ratio = src.w / src.h;
  return isDefaultTransform(tr) && Math.abs(ratio - STORY_WIDTH / STORY_HEIGHT) < 0.01;
}

export function cssFilter(a: Adjustments): string {
  return isDefaultAdjust(a) ? "none" : `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturation}%)`;
}

export type DrawSource = CanvasImageSource & { width?: number; height?: number };

/**
 * Paints the story frame: a blurred, covering copy of the image behind (so
 * zooming out never leaves ugly empty bars, like Telegram), then the
 * transformed image on top. `scaleToCanvas` lets the same call render the small
 * live preview and the full-size export.
 */
export function drawStoryFrame(
  ctx: CanvasRenderingContext2D,
  source: DrawSource,
  src: Size,
  tr: MediaTransform,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const k = canvasWidth / STORY_WIDTH;
  const r = rotatedSize(src, tr.rotation);
  const scale = coverScale(src, tr.rotation) * tr.zoom;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const place = (extraScale: number, filter: string) => {
    ctx.save();
    ctx.filter = filter;
    ctx.translate((STORY_WIDTH / 2 + tr.offsetX) * k, (STORY_HEIGHT / 2 + tr.offsetY) * k);
    ctx.scale(scale * k * extraScale * (tr.flipX ? -1 : 1), scale * k * extraScale);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.drawImage(source, -src.w / 2, -src.h / 2, src.w, src.h);
    ctx.restore();
  };

  const scaledW = r.w * scale;
  const scaledH = r.h * scale;
  if (scaledW < STORY_WIDTH || scaledH < STORY_HEIGHT) {
    // Background: same image zoomed to cover, blurred and slightly dimmed.
    const coverRatio = coverScale(src, tr.rotation) / scale;
    ctx.save();
    ctx.translate((STORY_WIDTH / 2) * k, (STORY_HEIGHT / 2) * k);
    ctx.scale(coverScale(src, tr.rotation) * k * 1.15 * (tr.flipX ? -1 : 1), coverScale(src, tr.rotation) * k * 1.15);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.filter = `blur(${Math.round(24 * k)}px) brightness(70%)`;
    ctx.drawImage(source, -src.w / 2, -src.h / 2, src.w, src.h);
    ctx.restore();
    void coverRatio;
  }
  place(1, cssFilter(tr.adjust));
  ctx.restore();
}
