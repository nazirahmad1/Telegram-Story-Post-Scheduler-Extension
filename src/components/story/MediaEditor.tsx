import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type PointerEvent as RPointerEvent } from "react";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCw, FlipHorizontal2, SlidersHorizontal, RotateCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { decodeImage } from "../../utils/media-meta";
import {
  DEFAULT_ADJUST,
  DEFAULT_TRANSFORM,
  MAX_ZOOM,
  MIN_ZOOM,
  STORY_HEIGHT,
  STORY_WIDTH,
  canUploadOriginal,
  clampTransform,
  drawStoryFrame,
  fitZoom,
  isDefaultTransform,
  rotateBy90,
  zoomAt,
  type MediaTransform,
} from "../../utils/media-transform";

export interface MediaEditorHandle {
  /** True when the photo was zoomed/cropped/rotated/adjusted (so the edited version must be uploaded). */
  isChanged: () => boolean;
  /** The file to upload: the original when untouched and already 9:16, otherwise a 1080x1920 JPEG render. */
  render: () => Promise<File>;
}

interface Props {
  file: File;
  caption?: string;
  disabled?: boolean;
  /** Called once the photo is decoded, or with an error if the browser can't read it. */
  onStatus?: (status: { ok: true } | { ok: false; error: unknown }) => void;
  onChange?: (changed: boolean) => void;
  handleRef: Ref<MediaEditorHandle>;
}

const PREVIEW_W = 360;
const PREVIEW_H = 640;
const SLIDER_STEPS = 1000;

const zoomToSlider = (z: number) => Math.round((Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * SLIDER_STEPS);
const sliderToZoom = (s: number) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, s / SLIDER_STEPS);

export function MediaEditor({ file, caption, disabled, onStatus, onChange, handleRef }: Props) {
  const { t } = useTranslation();
  const isVideo = file.type.startsWith("video/");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [transform, setTransform] = useState<MediaTransform>(DEFAULT_TRANSFORM);
  const [showAdjust, setShowAdjust] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPinch = useRef<{ distance: number } | null>(null);

  // Decode the photo (or create a preview URL for a video) whenever the file changes.
  useEffect(() => {
    let cancelled = false;
    bitmapRef.current?.close();
    bitmapRef.current = null;
    setSize(null);
    setTransform(DEFAULT_TRANSFORM);

    if (isVideo) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      onStatus?.({ ok: true });
      return () => URL.revokeObjectURL(url);
    }
    setVideoUrl(null);
    decodeImage(file)
      .then((bitmap) => {
        if (cancelled) return bitmap.close();
        bitmapRef.current = bitmap;
        setSize({ w: bitmap.width, h: bitmap.height });
        onStatus?.({ ok: true });
      })
      .catch((error) => !cancelled && onStatus?.({ ok: false, error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, isVideo]);

  useEffect(() => () => bitmapRef.current?.close(), []);

  const update = useCallback(
    (next: MediaTransform | ((prev: MediaTransform) => MediaTransform)) => {
      setTransform((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        return size ? clampTransform(value, size) : value;
      });
    },
    [size],
  );

  // Live preview: the same drawing code as the export, just smaller.
  useEffect(() => {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    if (!canvas || !bitmap || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const id = requestAnimationFrame(() => drawStoryFrame(ctx, bitmap, size, transform, PREVIEW_W, PREVIEW_H));
    return () => cancelAnimationFrame(id);
  }, [transform, size]);

  const changed = !isVideo && !isDefaultTransform(transform);
  useEffect(() => {
    onChange?.(changed);
  }, [changed, onChange]);

  useImperativeHandle(
    handleRef,
    () => ({
      isChanged: () => changed,
      render: async () => {
        const bitmap = bitmapRef.current;
        if (isVideo || !bitmap || !size) return file;
        if (canUploadOriginal(size, transform)) return file;
        const canvas = document.createElement("canvas");
        canvas.width = STORY_WIDTH;
        canvas.height = STORY_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        drawStoryFrame(ctx, bitmap, size, transform, STORY_WIDTH, STORY_HEIGHT);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        if (!blob) throw new Error("Couldn't render the edited photo.");
        const base = file.name.replace(/\.[^.]+$/, "") || "story";
        return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      },
    }),
    [changed, isVideo, size, transform, file],
  );

  // ----- gestures: drag to pan, wheel / pinch to zoom -----
  function toFrame(e: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * STORY_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * STORY_HEIGHT,
      factor: STORY_WIDTH / rect.width,
    };
  }

  function onPointerDown(e: RPointerEvent<HTMLCanvasElement>) {
    if (disabled || !size) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinch.current = null;
  }

  function onPointerMove(e: RPointerEvent<HTMLCanvasElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !size) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    const pts = [...pointers.current.values()];

    if (pts.length === 1) {
      const { factor } = toFrame(e);
      update((tr) => ({ ...tr, offsetX: tr.offsetX + (next.x - prev.x) * factor, offsetY: tr.offsetY + (next.y - prev.y) * factor }));
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toFrame({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      if (lastPinch.current && lastPinch.current.distance > 0) {
        const ratio = distance / lastPinch.current.distance;
        update((tr) => zoomAt(tr, tr.zoom * ratio, mid, size));
      }
      lastPinch.current = { distance };
    }
  }

  function onPointerUp(e: RPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    lastPinch.current = null;
  }

  // Wheel needs a non-passive listener to be able to preventDefault the page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = {
        x: ((e.clientX - rect.left) / rect.width) * STORY_WIDTH,
        y: ((e.clientY - rect.top) / rect.height) * STORY_HEIGHT,
      };
      const factor = Math.exp(-e.deltaY * 0.0015);
      update((tr) => zoomAt(tr, tr.zoom * factor, anchor, size));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [size, disabled, update]);

  const center = { x: STORY_WIDTH / 2, y: STORY_HEIGHT / 2 };
  const stepZoom = (factor: number) => size && update((tr) => zoomAt(tr, tr.zoom * factor, center, size));
  const zoomPercent = useMemo(() => Math.round(transform.zoom * 100), [transform.zoom]);

  if (isVideo) {
    return (
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <div className="story-preview">
          {videoUrl && <video src={videoUrl} muted autoPlay loop playsInline style={{ objectFit: "contain" }} />}
          {caption && (
            <div className="story-preview-caption">
              <span>{caption}</span>
            </div>
          )}
        </div>
        <span className="helper-text" style={{ textAlign: "center" }}>
          {t("mediaEditor.videoNote")}
        </span>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <div className="story-preview media-editor-frame" aria-label={t("mediaEditor.hint")}>
        <canvas
          ref={canvasRef}
          width={PREVIEW_W}
          height={PREVIEW_H}
          className="media-editor-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => size && update((tr) => (tr.zoom === 1 ? zoomAt(tr, 2, center, size) : { ...tr, zoom: 1, offsetX: 0, offsetY: 0 }))}
          tabIndex={0}
          role="img"
          aria-label={t("mediaEditor.hint")}
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") stepZoom(1.15);
            else if (e.key === "-") stepZoom(1 / 1.15);
            else if (e.key.startsWith("Arrow")) {
              e.preventDefault();
              const d = 30;
              update((tr) => ({
                ...tr,
                offsetX: tr.offsetX + (e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0),
                offsetY: tr.offsetY + (e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0),
              }));
            }
          }}
        />
        {caption && (
          <div className="story-preview-caption">
            <span>{caption}</span>
          </div>
        )}
      </div>

      <div className="row media-editor-zoom" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost" disabled={disabled || !size} aria-label={t("mediaEditor.zoomOut")} onClick={() => stepZoom(1 / 1.25)}>
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={zoomToSlider(transform.zoom)}
          disabled={disabled || !size}
          aria-label={t("mediaEditor.zoom")}
          onChange={(e) => size && update((tr) => zoomAt(tr, sliderToZoom(Number(e.target.value)), center, size))}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-ghost" disabled={disabled || !size} aria-label={t("mediaEditor.zoomIn")} onClick={() => stepZoom(1.25)}>
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <span className="helper-text" style={{ minWidth: 44, textAlign: "end" }} aria-live="polite">
          {zoomPercent}%
        </span>
      </div>

      <div className="chip-group" role="toolbar" aria-label={t("mediaEditor.tools")}>
        <button type="button" className="chip" disabled={disabled || !size} onClick={() => size && update((tr) => ({ ...tr, zoom: fitZoom(size, tr.rotation), offsetX: 0, offsetY: 0 }))}>
          <Minimize2 size={13} aria-hidden="true" /> {t("mediaEditor.fit")}
        </button>
        <button type="button" className="chip" disabled={disabled || !size} onClick={() => update((tr) => ({ ...tr, zoom: 1, offsetX: 0, offsetY: 0 }))}>
          <Maximize2 size={13} aria-hidden="true" /> {t("mediaEditor.fill")}
        </button>
        <button type="button" className="chip" disabled={disabled || !size} onClick={() => size && update((tr) => rotateBy90(tr, size))}>
          <RotateCw size={13} aria-hidden="true" /> {t("mediaEditor.rotate")}
        </button>
        <button type="button" className="chip" aria-pressed={transform.flipX} disabled={disabled || !size} onClick={() => update((tr) => ({ ...tr, flipX: !tr.flipX }))}>
          <FlipHorizontal2 size={13} aria-hidden="true" /> {t("mediaEditor.flip")}
        </button>
        <button type="button" className="chip" aria-pressed={showAdjust} disabled={disabled || !size} onClick={() => setShowAdjust((v) => !v)}>
          <SlidersHorizontal size={13} aria-hidden="true" /> {t("mediaEditor.adjust")}
        </button>
        <button type="button" className="chip" disabled={disabled || !changed} onClick={() => update(DEFAULT_TRANSFORM)}>
          <RotateCcw size={13} aria-hidden="true" /> {t("mediaEditor.reset")}
        </button>
      </div>

      {showAdjust && (
        <div className="stack" style={{ gap: 4 }}>
          {(["brightness", "contrast", "saturation"] as const).map((key) => (
            <label key={key} className="row" style={{ gap: 8 }}>
              <span className="helper-text" style={{ width: 84 }}>{t(`mediaEditor.${key}`)}</span>
              <input
                type="range"
                min={50}
                max={150}
                value={transform.adjust[key]}
                disabled={disabled}
                onChange={(e) => update((tr) => ({ ...tr, adjust: { ...tr.adjust, [key]: Number(e.target.value) } }))}
                onDoubleClick={() => update((tr) => ({ ...tr, adjust: { ...tr.adjust, [key]: DEFAULT_ADJUST[key] } }))}
                style={{ flex: 1 }}
              />
              <span className="helper-text" style={{ width: 36, textAlign: "end" }}>{transform.adjust[key]}</span>
            </label>
          ))}
        </div>
      )}

      <span className="helper-text" style={{ textAlign: "center" }}>{t("mediaEditor.hint")}</span>
    </div>
  );
}
