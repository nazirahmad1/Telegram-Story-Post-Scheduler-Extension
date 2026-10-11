import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Film, X, Users, Globe2, Star, AlertCircle, Radio, Lock } from "lucide-react";
import { useTranslation, type TranslationKey } from "../../i18n";
import { Toast } from "../Toast";
import { MediaPreview } from "./MediaPreview";
import { DirectionalIcon } from "../Icon";
import {
  publishStory,
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
import { translateTelegramError } from "../../telegram/errors";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import type { Page } from "../layout/BottomTabBar";

const PRIVACY_OPTIONS: { value: StoryPrivacy; key: TranslationKey; icon: typeof Globe2 }[] = [
  { value: "everyone", key: "story.privacyEveryone", icon: Globe2 },
  { value: "contacts", key: "story.privacyContacts", icon: Users },
  { value: "closeFriends", key: "story.privacyCloseFriends", icon: Star },
];

const FALLBACK_CAPTION_MAX = 200;
const DEFAULT_PERIOD: StoryPeriodSeconds = 24 * 3600;
const ACCEPTED_TYPES = /^(image|video)\//;
const ME_TARGET: StoryTargetOption = { id: "me", title: "", kind: "channel", username: null };

export function StoryEditor({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useTranslation();
  const { connected, refresh } = useConnectionStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState<StoryPrivacy>("everyone");
  const [period, setPeriod] = useState<StoryPeriodSeconds>(DEFAULT_PERIOD);
  const [captionMax, setCaptionMax] = useState(FALLBACK_CAPTION_MAX);
  const [isPremium, setIsPremium] = useState(false);
  const [channelTargets, setChannelTargets] = useState<StoryTargetOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<StoryTarget>>(() => new Set(["me"]));
  const [status, setStatus] = useState<"idle" | "publishing">("idle");
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  // Premium status, the real caption limit, and available post-to
  // targets all require an authorized call, so they're only fetched once
  // actually connected. Fallbacks (200-char caption, "My Story" only,
  // fixed 24h) are what a brand-new non-Premium account would see anyway,
  // so nothing here can ever look more capable than it actually is — but
  // a genuine failure (not just "no channels") still gets surfaced
  // instead of silently pretending everything loaded fine.
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
        console.error("[story-editor] getAccountCapabilities failed:", err);
        setLoadWarning(t("errors.loadAccountInfoFailed"));
        if (isSessionInvalidated(err)) {
          await forgetInvalidSession();
          refresh();
        }
      });
    getStoryTargets()
      .then((targets) => {
        if (!cancelled) setChannelTargets(targets);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[story-editor] getStoryTargets failed:", err);
        setLoadWarning((prev) => prev ?? t("errors.loadChannelsFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [connected, refresh, t]);

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

  async function handlePublish() {
    if (!connected) return setErrorMessage(t("errors.sessionExpired"));
    if (!file) return setErrorMessage(t("validation.required"));
    if (captionTooLong) return setErrorMessage(t("validation.captionTooLong"));
    if (selectedTargets.size === 0) return setErrorMessage(t("story.selectAtLeastOneTarget"));

    setErrorMessage(null);
    setStatus("publishing");
    setProgress(0);
    try {
      const results = await publishStory({
        file,
        caption: caption || undefined,
        privacy,
        targets: [...selectedTargets],
        period: isPremium ? period : undefined,
        onProgress: setProgress,
      });
      const failed = results.filter((r) => r.error);
      const succeeded = results.filter((r) => !r.error);

      if (failed.length === 0) {
        setToast({ message: t("story.publishSuccess"), variant: "success" });
        setFile(null);
        setCaption("");
        // Give the success toast a moment to actually be read before the
        // screen changes out from under it — jumping to Home instantly
        // would make the confirmation flash by unseen.
        setTimeout(() => onNavigate("home"), 1200);
      } else if (succeeded.length === 0) {
        const message = translateTelegramError(failed[0].error, t);
        setErrorMessage(message);
        setToast({ message, variant: "error" });
        if (failed.some((r) => isSessionInvalidated(r.error))) {
          await forgetInvalidSession();
          refresh();
        }
      } else {
        setToast({
          message: t("story.publishPartial", { succeeded: succeeded.length, total: results.length }),
          variant: "error",
        });
        setFile(null);
        setCaption("");
      }
    } catch (err) {
      const message = translateTelegramError(err, t);
      setErrorMessage(message);
      setToast({ message, variant: "error" });
      if (isSessionInvalidated(err)) await forgetInvalidSession();
      refresh(); // a session-expired error should flip the connection pill too
    } finally {
      setStatus("idle");
      setProgress(0);
    }
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18 }}>{t("story.title")}</h1>

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
                disabled={status === "publishing"}
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
          disabled={status === "publishing"}
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
          disabled={status === "publishing"}
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
                disabled={status === "publishing"}
                onClick={() => toggleTarget(target.id)}
              >
                <Icon size={14} aria-hidden="true" />
                {target.title}
              </button>
            );
          })}
        </div>
        {channelTargets.length === 0 && (
          <span className="helper-text">{t("story.noChannels")}</span>
        )}
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
              disabled={status === "publishing"}
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
                disabled={status === "publishing" || isLocked}
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

      {status === "publishing" && (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-label">
            <span>{t("story.uploading")}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="upload-progress-track">
            <div className="upload-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      {errorMessage && (
        <span className="error-text">
          <AlertCircle size={13} /> {errorMessage}
        </span>
      )}

      <button
        type="button"
        className="btn btn-cta btn-block"
        disabled={status === "publishing"}
        onClick={handlePublish}
      >
        {status === "publishing" ? t("story.publishing") : t("story.publish")}
      </button>

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
