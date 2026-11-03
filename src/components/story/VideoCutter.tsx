import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scissors } from "lucide-react";
import { useTranslation } from "../../i18n";

export interface TrimRange {
  start: number; // seconds
  end: number; // seconds
}

interface Props {
  videoUrl: string;
  duration: number;
  value: TrimRange;
  onChange: (range: TrimRange) => void;
  disabled?: boolean;
}

function fmtSec(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoCutter({ videoUrl, duration, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);

  const minDur = 0.5; // minimum segment length in seconds
  const HANDLE_SIZE = 24;

  const clamp = useCallback(
    (v: number) => Math.max(0, Math.min(duration, v)),
    [duration],
  );

  // Keep handles sync'd when duration/value change externally
  useEffect(() => {
    if (!dragging) return;
    // noop - dragging owns state
  }, [dragging]);

  const updateRange = useCallback(
    (nextStart: number, nextEnd: number) => {
      let s = clamp(nextStart);
      let e = clamp(nextEnd);
      if (e - s < minDur) {
        e = s + minDur;
        if (e > duration) {
          e = duration;
          s = Math.max(0, duration - minDur);
        }
      }
      s = Math.max(0, Math.min(duration - minDur, s));
      e = Math.max(minDur, Math.min(duration, e));
      onChange({ start: s, end: e });
    },
    [duration, minDur, onChange, clamp],
  );

  // Seek video to a time without changing the trim range
  const seek = useCallback(
    (t: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.max(0, Math.min(duration, t));
    },
    [duration],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || disabled || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      let t = pos * duration;
      if (dragging === "start") {
        updateRange(t, value.end);
      } else {
        updateRange(value.start, t);
      }
    },
    [dragging, disabled, duration, updateRange, value],
  );

  const onPointerUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragging, onPointerMove, onPointerUp]);

  // Playhead / loop preview of the trimmed segment
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) return;
    if (video.paused) {
      video.play().catch(() => {});
    }
    const id = requestAnimationFrame(() => {
      if (!video || video.paused) return;
      // Loop within the trimmed range
      if (video.currentTime >= value.end - 0.05) {
        video.currentTime = value.start;
      }
      rafRef.current = requestAnimationFrame(arguments.callee as FrameRequestCallback);
    });
    rafRef.current = id;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, value.start, value.end]);

  const startPct = (value.start / duration) * 100;
  const endPct = (value.end / duration) * 100;
  const playheadPct = duration > 0 ? ((videoRef.current?.currentTime || 0) / duration) * 100 : 0;
  const segmentSec = Math.max(0, value.end - value.start);

  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      {/* Video preview */}
      <div className="story-preview" style={{ position: "relative" }}>
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="metadata"
          style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 10, background: "#000" }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <div
          style={{
            position: "absolute",
            left: `${playheadPct}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: "#fff",
            pointerEvents: "none",
            zIndex: 3,
            opacity: playing ? 1 : 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            gap: 8,
            zIndex: 4,
          }}
        >
          <button
            type="button"
            aria-label={playing ? t("mediaEditor.pause") || "Pause" : t("mediaEditor.play") || "Play"}
            disabled={disabled}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              cursor: disabled ? "default" : "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                v.currentTime = Math.max(value.start, v.currentTime);
                v.play();
              } else {
                v.pause();
              }
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
        </div>
      </div>

      {/* Trim info */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Scissors size={14} aria-hidden="true" />
          <span className="helper-text">{t("mediaEditor.trimmed") || "Trimmed"}</span>
        </div>
        <span className="helper-text" style={{ fontVariantNumeric: "tabular-nums" }}>
          {fmtSec(value.start)} → {fmtSec(value.end)} ({segmentSec.toFixed(1)}s)
        </span>
      </div>

      {/* Single slider timeline with left & right handles */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Trim video start and end"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={value.start}
        aria-valuetext={`${fmtSec(value.start)} to ${fmtSec(value.end)}`}
        style={{
          position: "relative",
          height: 40,
          background: "#1a1a2e",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)",
          cursor: disabled ? "default" : "pointer",
          userSelect: "none",
          overflow: "visible",
        }}
      >
        {/* Track ticks */}
        <div style={{ position: "absolute", inset: 0, padding: "0 8px", display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <div key={f} style={{ height: 6, width: 1, background: "rgba(255,255,255,0.08)" }} />
          ))}
        </div>

        {/* Selected region */}
        <div
          style={{
            position: "absolute",
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            top: 0,
            bottom: 0,
            background: "linear-gradient(90deg, rgba(0,230,118,0.25), rgba(0,230,118,0.45))",
            borderLeft: "2px solid #00e676",
            borderRight: "2px solid #00e676",
            pointerEvents: "none",
          }}
        />

        {/* Left handle (start) */}
        <button
          type="button"
          aria-label="Trim start"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging("start");
          }}
          style={{
            position: "absolute",
            left: `calc(${startPct}% - ${HANDLE_SIZE / 2}px)`,
            top: "calc(50% - 12px)",
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: 6,
            border: "none",
            background: "#00e676",
            cursor: disabled ? "default" : "grab",
            zIndex: 5,
            boxShadow: "0 0 0 2px rgba(0,230,118,0.45), 0 1px 3px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "#000",
          }}
          title={`Start: ${fmtSec(value.start)}`}
        >
          ◀
        </button>

        {/* Right handle (end) */}
        <button
          type="button"
          aria-label="Trim end"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            setDragging("end");
          }}
          style={{
            position: "absolute",
            left: `calc(${endPct}% - ${HANDLE_SIZE / 2}px)`,
            top: "calc(50% - 12px)",
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: 6,
            border: "none",
            background: "#00e676",
            cursor: disabled ? "default" : "grab",
            zIndex: 5,
            boxShadow: "0 0 0 2px rgba(0,230,118,0.45), 0 1px 3px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "#000",
          }}
          title={`End: ${fmtSec(value.end)}`}
        >
          ▶
        </button>

        {/* Time labels along bottom */}
        <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{fmtSec(0)}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{fmtSec(duration / 2)}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{fmtSec(duration)}</span>
        </div>
      </div>
    </div>
  );
}
