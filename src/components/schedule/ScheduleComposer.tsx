import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Film, X, Users, Globe2, Star, AlertCircle, Radio, Lock, CalendarClock } from "lucide-react";
import { useTranslation, type TranslationKey } from "../../i18n";
import { Toast } from "../Toast";
import { MediaPreview } from "../story/MediaPreview";
import { DirectionalIcon } from "../Icon";
import {
  getAccountCapabilities,
  getStoryTargets,
  isSessionInvalidated,
  forgetInvalidSession,
  STORY_PERIOD_OPTIONS,
  type StoryPrivacy,
  type StoryTarget,
  type StoryTargetOption,
  type StoryPeriodSeconds,
} from "../../telegram/client";
import { addScheduledStory } from "../../scheduling/db";
import { createStoryAlarm } from "../../scheduling/alarms";
import { readVideoMeta } from "../../utils/media-meta";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";

const PRIVACY_OPTIONS: { value: StoryPrivacy; key: TranslationKey; icon: typeof Globe2 }[] = [
  { value: "everyone", key: "story.privacyEveryone", icon: Globe2 },
  { value: "contacts", key: "story.privacyContacts", icon: Users },
  { value: "closeFriends", key: "story.privacyCloseFriends", icon: Star },
];

const FALLBACK_CAPTION_MAX = 200;
const DEFAULT_PERIOD: StoryPeriodSeconds = 24 * 3600;
const ACCEPTED_TYPES = /^(image|video)\//;
const ME_TARGET: StoryTargetOption = { id: "me", title: "", kind: "channel", username: null };

/** Minimum lead time chrome.alarms reliably honors for a one-off alarm. */
const MIN_LEAD_MS = 60_000;

function defaultDateTimeLocalValue(): string {
  const inOneHour = new Date(Date.now() + 3600_000);
  inOneHour.setSeconds(0, 0);
  // datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time, no timezone suffix.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${inOneHour.getFullYear()}-${pad(inOneHour.getMonth() + 1)}-${pad(inOneHour.getDate())}T${pad(inOneHour.getHours())}:${pad(inOneHour.getMinutes())}`;
}

export function ScheduleComposer({ onScheduled }: { onScheduled: () => void }) {
  const { t } = useTranslation();
  const { connected, refresh: refreshConnection } = useConnectionStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<StoryPrivacy>("everyone");
  const [period, setPeriod] = useState<StoryPeriodSeconds>(DEFAULT_PERIOD);
  const [captionMax, setCaptionMax] = useState(FALLBACK_CAPTION_MAX);
  const [isPremium, setIsPremium] = useState(false);
  const [channelTargets, setChannelTargets] = useState<StoryTargetOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<StoryTarget>>(() => new Set(["me"]));
  const [publishAt, setPublishAt] = useState(defaultDateTimeLocalValue);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setLoadWarning(null);
    getAccountCapabilities()
      .then(({ isPremium: premium, captionLimit }) => {
        if (cancelled) return;
        setIsPremium(premium);
        setCaptionMax(captionLimit);
      })
      .catch(async (err) => {
        if (cancelled) return;
        console.error("[schedule-composer] getAccountCapabilities failed:", err);
        setLoadWarning(t("errors.loadAccountInfoFailed"));
        if (isSessionInvalidated(err)) {
          await forgetInvalidSession();
          refreshConnection();
        }
      });
    getStoryTargets()
      .then((targets) => {
        if (!cancelled) setChannelTargets(targets);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[schedule-composer] getStoryTargets failed:", err);
        setLoadWarning((prev) => prev ?? t("errors.loadChannelsFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [connected, refreshConnection, t]);

  const captionTooLong = caption.length > captionMax;
  const captionRemaining = captionMax - caption.length;
  const allTargets = [{ ...ME_TARGET, title: t("story.myStory") }, ...channelTargets];

  function toggleTarget(id: StoryTarget) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function acceptFile(candidate: File | null) {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.test(candidate.type)) {
      setErrorMessage(t("errors.unsupportedFormat"));
      return;
    }
    setErrorMessage(null);
    setFile(candidate);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragActive(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleSchedule() {
    if (!connected) return setErrorMessage(t("errors.sessionExpired"));
    if (!file) return setErrorMessage(t("validation.required"));
    if (captionTooLong) return setErrorMessage(t("validation.captionTooLong"));
    if (selectedTargets.size === 0) return setErrorMessage(t("story.selectAtLeastOneTarget"));

    const scheduledFor = new Date(publishAt).getTime();
    if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() + MIN_LEAD_MS) {
      return setErrorMessage(t("schedule.mustBeFuture"));
    }

    setErrorMessage(null);
    setBusy(true);
    try {
      // The service worker that publishes this later has no <video> element to
      // measure with, so the real duration/size is captured now.
      const video = file.type.startsWith("video/") ? ((await readVideoMeta(file)) ?? undefined) : undefined;
      const entry = await addScheduledStory({
        file,
        fileName: file.name,
        fileType: file.type,
        caption,
        privacy,
        video,
        targets: [...selectedTargets],
        period: isPremium ? period : undefined,
        scheduledFor,
      });
      await createStoryAlarm(entry.id, scheduledFor);
      setToast({ message: t("schedule.scheduled"), variant: "success" });
      setFile(null);
      setCaption("");
      // Give the toast a moment to actually be seen — calling onScheduled()
      // immediately would unmount this component (the parent swaps to the
      // list) before the toast set just above ever gets a chance to render.
      setTimeout(onScheduled, 1200);
    } catch (err) {
      // Always log the real cause — this previously swallowed it entirely,
      // which is exactly why "Something went wrong" gave no way to
      // diagnose what actually failed (IndexedDB write vs chrome.alarms).
      console.error("[schedule]", err);
      if (typeof chrome === "undefined" || !chrome.alarms) {
        setErrorMessage(t("schedule.needsExtensionContext"));
      } else {
        setErrorMessage(t("errors.unknown"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <span className="eyebrow">{t("story.uploadMedia")}</span>
        {file && <MediaPreview file={file} caption={caption} />}
        <div
          className={`dropzone ${isDragActive ? "is-active" : ""} ${file ? "has-file" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={t("story.uploadPhoto")}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={handleDrop}
        >
          {file ? (
            <>
              {file.type.startsWith("video/") ? <Film size={22} /> : <ImagePlus size={22} />}
              <span style={{ fontWeight: 600 }}>{file.name}</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "4px 10px" }}
                aria-label={t("a11y.removeFile")}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                <X size={14} />
                {t("common.delete")}
              </button>
            </>
          ) : (
            <>
              <ImagePlus size={26} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>{t("story.uploadPhoto")}</span>
              <span className="helper-text">{t("story.dragDropHint")}</span>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          disabled={busy}
          onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="card">
        <div className="spread">
          <span className="eyebrow">{t("story.caption")}</span>
          <span className="helper-text">{captionRemaining}</span>
        </div>
        <textarea
          className="input"
          rows={3}
          placeholder={t("story.captionPlaceholder")}
          value={caption}
          disabled={busy}
          onChange={(e) => setCaption(e.target.value)}
          aria-invalid={captionTooLong}
          aria-label={t("story.caption")}
        />
        {captionTooLong && (
          <span className="error-text">
            <AlertCircle size={13} /> {t("validation.captionTooLong")}
          </span>
        )}
      </div>

      <div className="card">
        <span className="eyebrow">{t("schedule.publishAt")}</span>
        <div className="input-wrap">
          <CalendarClock size={16} aria-hidden="true" />
          <input
            type="datetime-local"
            className="input"
            value={publishAt}
            min={defaultDateTimeLocalValue()}
            disabled={busy}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-label={t("schedule.publishAt")}
          />
        </div>
        <span className="helper-text">{t("schedule.publishAtHint")}</span>
      </div>

      {loadWarning && (
        <span className="error-text">
          <AlertCircle size={13} /> {loadWarning}
        </span>
      )}

      <div className="card">
        <span className="eyebrow">{t("story.postTo")}</span>
        <div className="chip-group" role="group" aria-label={t("story.postTo")}>
          {allTargets.map((target) => {
            const isSelected = selectedTargets.has(target.id);
            const Icon = target.id === "me" ? Star : target.kind === "group" ? Users : Radio;
            return (
              <button
                key={target.id}
                type="button"
                className="chip"
                aria-pressed={isSelected}
                disabled={busy}
                onClick={() => toggleTarget(target.id)}
              >
                <Icon size={14} aria-hidden="true" />
                {target.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <span className="eyebrow">{t("story.privacy")}</span>
        <div className="chip-group" role="radiogroup" aria-label={t("story.privacy")}>
          {PRIVACY_OPTIONS.map(({ value, key, icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={privacy === value}
              aria-pressed={privacy === value}
              className="chip"
              disabled={busy}
              onClick={() => setPrivacy(value)}
            >
              <DirectionalIcon name={value} icon={icon} size={14} />
              {t(key)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="spread">
          <span className="eyebrow">{t("story.expiry")}</span>
          {!isPremium && (
            <span className="row helper-text" style={{ gap: 4 }}>
              <Lock size={11} aria-hidden="true" />
              {t("story.premiumOnly")}
            </span>
          )}
        </div>
        <div className="chip-group" role="radiogroup" aria-label={t("story.expiry")}>
          {STORY_PERIOD_OPTIONS.map(({ seconds, hours }) => {
            const isLocked = !isPremium && seconds !== DEFAULT_PERIOD;
            return (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={period === seconds}
                aria-pressed={period === seconds}
                className="chip"
                disabled={busy || isLocked}
                aria-disabled={isLocked}
                onClick={() => setPeriod(seconds)}
              >
                {isLocked && <Lock size={12} aria-hidden="true" />}
                {t("story.expiryHours", { hours })}
              </button>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <span className="error-text">
          <AlertCircle size={13} /> {errorMessage}
        </span>
      )}

      <button type="button" className="btn btn-cta btn-block" disabled={busy} onClick={handleSchedule}>
        {busy ? t("story.publishing") : t("schedule.scheduleButton")}
      </button>

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
