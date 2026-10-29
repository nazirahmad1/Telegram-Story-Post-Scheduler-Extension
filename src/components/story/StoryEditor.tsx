import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImagePlus, Film, X, Star, AlertCircle, Radio, Users, Lock, Pin, ShieldOff, ArrowLeft, RefreshCw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Toast } from "../Toast";
import { ErrorPanel } from "../ErrorPanel";
import { MediaEditor, type MediaEditorHandle } from "./MediaEditor";
import { AudiencePicker } from "./AudiencePicker";
import {
  publishStory,
  editStory,
  downloadStoryMedia,
  getAccountCapabilities,
  getStoryTargets,
  forgetInvalidSession,
  STORY_PERIOD_OPTIONS,
  type MyStoryItem,
  type StoryTarget,
  type StoryTargetOption,
  type StoryPeriodSeconds,
} from "../../telegram/client";
import { describeTelegramError, type ErrorDescription } from "../../telegram/errors";
import { DEFAULT_AUDIENCE, validateAudience, type StoryAudienceConfig } from "../../telegram/privacy";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { readVideoMeta } from "../../utils/media-meta";
import type { Page } from "../layout/BottomTabBar";

const FALLBACK_CAPTION_MAX = 200;
const DEFAULT_PERIOD: StoryPeriodSeconds = 24 * 3600;
const ACCEPTED_TYPES = /^(image|video)\//;
const ME_TARGET: StoryTargetOption = { id: "me", title: "", kind: "channel", username: null };

interface TargetFailure {
  title: string;
  description: ErrorDescription;
}

interface Props {
  onNavigate?: (page: Page) => void;
  /** Edit an already-published story instead of creating a new one. */
  editing?: MyStoryItem;
  onDone?: () => void;
  onCancel?: () => void;
}

const sameAudience = (a: StoryAudienceConfig, b: StoryAudienceConfig) =>
  a.audience === b.audience &&
  [...a.allowUserIds].sort().join() === [...b.allowUserIds].sort().join() &&
  [...a.blockUserIds].sort().join() === [...b.blockUserIds].sort().join();

export function StoryEditor({ onNavigate, editing, onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const { connected, refresh } = useConnectionStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaEditorHandle>(null);
  const isEdit = !!editing;

  const [file, setFile] = useState<File | null>(null);
  const [mediaReplaced, setMediaReplaced] = useState(false);
  const [caption, setCaption] = useState(editing?.caption ?? "");
  const [audience, setAudience] = useState<StoryAudienceConfig>(editing?.audienceConfig ?? DEFAULT_AUDIENCE);
  const [names, setNames] = useState<Record<string, string>>(editing?.userNames ?? {});
  const [audienceTouched, setAudienceTouched] = useState(false);
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [noforwards, setNoforwards] = useState(editing?.noforwards ?? false);
  const [period, setPeriod] = useState<StoryPeriodSeconds>(DEFAULT_PERIOD);
  const [captionMax, setCaptionMax] = useState(FALLBACK_CAPTION_MAX);
  const [isPremium, setIsPremium] = useState(false);
  const [channelTargets, setChannelTargets] = useState<StoryTargetOption[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<StoryTarget>>(() => new Set(["me"]));
  const [status, setStatus] = useState<"idle" | "loadingMedia" | "publishing">(isEdit ? "loadingMedia" : "idle");
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [targetFailures, setTargetFailures] = useState<TargetFailure[]>([]);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [mediaError, setMediaError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const busy = status !== "idle";

  // Edit mode: pull the current photo/video down so it can be shown, zoomed and re-uploaded.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setStatus("loadingMedia");
    setMediaError(null);
    downloadStoryMedia(editing, (f) => !cancelled && setProgress(f))
      .then((blob) => {
        if (cancelled) return;
        const ext = editing.mediaType === "video" ? "mp4" : "jpg";
        setFile(new File([blob], `story-${editing.id}.${ext}`, { type: blob.type }));
        setStatus("idle");
        setProgress(0);
      })
      .catch((err) => {
        if (cancelled) return;
        setMediaError(err);
        setStatus("idle");
        setProgress(0);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, loadAttempt]);

  // Premium status, the real caption limit, and available post-to targets all need an authorized call.
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
      .catch((err) => {
        if (cancelled) return;
        const d = describeTelegramError(err, t);
        setLoadWarning(t("errors.loadAccountInfoFailed"));
        if (d.sessionDead) void forgetInvalidSession().then(refresh);
      });
    if (!isEdit) {
      getStoryTargets()
        .then((targets) => !cancelled && setChannelTargets(targets))
        .catch((err) => {
          if (cancelled) return;
          console.error("[story-editor] getStoryTargets failed:", err);
          setLoadWarning((prev) => prev ?? t("errors.loadChannelsFailed"));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [connected, refresh, t, isEdit]);

  const captionTooLong = caption.length > captionMax;
  const captionRemaining = captionMax - caption.length;
  const allTargets = [{ ...ME_TARGET, title: t("story.myStory") }, ...channelTargets];
  const onlyChannels = !isEdit && selectedTargets.size > 0 && !selectedTargets.has("me");
  const channelStory = isEdit && editing!.target !== "me";

  function toggleTarget(id: StoryTarget) {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function simpleError(titleKey: Parameters<typeof t>[0], reasonKey?: Parameters<typeof t>[0]): ErrorDescription {
    return { id: "unknown", title: t(titleKey), reason: reasonKey ? t(reasonKey) : undefined, sessionDead: false, retryable: false };
  }

  function acceptFile(candidate: File | null) {
    if (!candidate) return;
    if (!ACCEPTED_TYPES.test(candidate.type)) {
      setError(simpleError("errors.unsupportedFormat", "errors.detail.mediaUnsupported.fix"));
      return;
    }
    setError(null);
    setFile(candidate);
    setMediaReplaced(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragActive(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function handleSessionDead(d: ErrorDescription | undefined) {
    if (d?.sessionDead) {
      await forgetInvalidSession();
      void refresh();
    }
  }

  async function handlePublish() {
    setTargetFailures([]);
    if (!connected) return setError(simpleError("errors.sessionExpired"));
    if (!file) return setError(simpleError("validation.required", "story.chooseMediaFirst"));
    if (captionTooLong) return setError(simpleError("validation.captionTooLong", "errors.detail.captionTooLong.fix"));
    if (!isEdit && selectedTargets.size === 0) return setError(simpleError("story.selectAtLeastOneTarget"));
    if (!channelStory && !onlyChannels && validateAudience(audience) === "selectedEmpty") {
      return setError(simpleError("validation.selectedEmpty", "audience.canSelectedNone"));
    }

    setError(null);
    setStatus("publishing");
    setProgress(0);
    try {
      if (isEdit) await submitEdit();
      else await submitNew();
    } catch (err) {
      const d = describeTelegramError(err, t);
      setError(d);
      setToast({ message: d.title, variant: "error" });
      await handleSessionDead(d);
      void refresh();
    } finally {
      setStatus("idle");
      setProgress(0);
    }
  }

  async function submitNew() {
    const rendered = await mediaRef.current!.render();
    const video = rendered.type.startsWith("video/") ? ((await readVideoMeta(rendered)) ?? undefined) : undefined;
    const results = await publishStory({
      file: rendered,
      caption: caption || undefined,
      privacy: audience.audience,
      allowUserIds: audience.allowUserIds,
      blockUserIds: audience.blockUserIds,
      pinned,
      noforwards,
      video,
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
      // Let the success toast be read before the screen changes.
      setTimeout(() => onNavigate?.("home"), 1200);
      return;
    }

    const titleOf = (target: StoryTarget) => allTargets.find((x) => x.id === target)?.title || t("story.myStory");
    const failures = failed.map((r) => ({ title: titleOf(r.target), description: describeTelegramError(r.error, t) }));
    setTargetFailures(failures);
    setError(failures[0].description);
    await handleSessionDead(failures.find((f) => f.description.sessionDead)?.description);

    if (succeeded.length === 0) {
      setToast({ message: failures[0].description.title, variant: "error" });
    } else {
      setToast({ message: t("story.publishPartial", { succeeded: succeeded.length, total: results.length }), variant: "error" });
      // Keep the media so the failed targets can simply be retried; drop the ones that already posted.
      setSelectedTargets(new Set(failed.map((r) => r.target)));
    }
  }

  async function submitEdit() {
    const story = editing!;
    const mediaChanged = mediaReplaced || (mediaRef.current?.isChanged() ?? false);
    const captionChanged = caption !== (story.caption ?? "");
    // If Telegram never told us the real audience, only send one when the person actually picked something.
    const audienceChanged = !channelStory && (story.audienceKnown ? !sameAudience(audience, story.audienceConfig) : audienceTouched);
    const pinChanged = pinned !== story.pinned;

    if (!mediaChanged && !captionChanged && !audienceChanged && !pinChanged) {
      setToast({ message: t("story.nothingChanged"), variant: "error" });
      return;
    }

    const rendered = mediaChanged ? await mediaRef.current!.render() : undefined;
    const video = rendered?.type.startsWith("video/") ? ((await readVideoMeta(rendered)) ?? undefined) : undefined;
    await editStory({
      story,
      file: rendered,
      video,
      caption: captionChanged ? caption : undefined,
      audience: audienceChanged ? audience : undefined,
      pinned: pinChanged ? pinned : undefined,
      onProgress: setProgress,
    });
    setToast({ message: t("story.editSuccess"), variant: "success" });
    setTimeout(() => onDone?.(), 900);
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ fontSize: 18 }}>{isEdit ? t("story.editTitle") : t("story.title")}</h1>
        {isEdit && (
          <button type="button" className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={onCancel} disabled={status === "publishing"}>
            <ArrowLeft size={14} aria-hidden="true" /> {t("common.back")}
          </button>
        )}
      </div>

      {isEdit && channelStory && (
        <span className="row helper-text" style={{ gap: 4 }}>
          <Radio size={12} aria-hidden="true" /> {editing!.targetLabel}
        </span>
      )}

      <div className="card">
        <span className="eyebrow">{t("story.uploadMedia")}</span>

        {status === "loadingMedia" && (
          <span className="helper-text" role="status">
            {t("story.loadingCurrentMedia")} {Math.round(progress * 100)}%
          </span>
        )}
        {mediaError ? (
          <div className="stack" style={{ gap: 8 }}>
            <ErrorPanel description={describeTelegramError(mediaError, t)} compact />
            <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setLoadAttempt((n) => n + 1)}>
              <RefreshCw size={14} aria-hidden="true" /> {t("common.retry")}
            </button>
          </div>
        ) : null}

        {file && (
          <MediaEditor
            file={file}
            caption={caption}
            disabled={busy}
            handleRef={mediaRef}
            onStatus={(s) => {
              if (!s.ok) {
                setError(simpleError("errors.unsupportedFormat", "errors.detail.mediaUnsupported.fix"));
              }
            }}
          />
        )}

        {!(isEdit && !file) && (
          <div
            className={`dropzone ${isDragActive ? "is-active" : ""} ${file ? "has-file" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={isEdit ? t("story.replaceMedia") : t("story.uploadPhoto")}
            onClick={() => !busy && fileInputRef.current?.click()}
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
                <span style={{ fontWeight: 600 }}>{isEdit && !mediaReplaced ? t("story.replaceMedia") : file.name}</span>
                {!isEdit && (
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
                )}
              </>
            ) : (
              <>
                <ImagePlus size={26} aria-hidden="true" />
                <span style={{ fontWeight: 600 }}>{t("story.uploadPhoto")}</span>
                <span className="helper-text">{t("story.dragDropHint")}</span>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          hidden
          disabled={busy}
          onChange={(e) => {
            acceptFile(e.target.files?.[0] ?? null);
            e.target.value = ""; // allow picking the same file again after removing it
          }}
        />
      </div>

      <div className="card">
        <div className="spread">
          <span className="eyebrow">{t("story.caption")}</span>
          <span className={`helper-text ${captionTooLong ? "error-text" : ""}`}>{captionRemaining}</span>
        </div>
        <textarea
          className="input"
          dir="auto"
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

      {loadWarning && (
        <span className="error-text">
          <AlertCircle size={13} /> {loadWarning}
        </span>
      )}

      {!isEdit && (
        <div className="card">
          <span className="eyebrow">{t("story.postTo")}</span>
          <div className="chip-group" role="group" aria-label={t("story.postTo")}>
            {allTargets.map((target) => {
              const isSelected = selectedTargets.has(target.id);
              const Icon = target.id === "me" ? Star : target.kind === "group" ? Users : Radio;
              return (
                <button key={target.id} type="button" className="chip" aria-pressed={isSelected} disabled={busy} onClick={() => toggleTarget(target.id)}>
                  <Icon size={14} aria-hidden="true" />
                  {target.title}
                </button>
              );
            })}
          </div>
          {channelTargets.length === 0 && <span className="helper-text">{t("story.noChannels")}</span>}
        </div>
      )}

      <div className="card">
        <span className="eyebrow">{isEdit ? t("audience.whoCanSee") : t("story.privacy")}</span>
        <AudiencePicker
          value={audience}
          onChange={(next) => {
            setAudienceTouched(true);
            setAudience(next);
          }}
          names={names}
          onNames={setNames}
          disabled={busy}
          isChannelOnly={onlyChannels || channelStory}
        />
        {isEdit && !channelStory && !editing!.audienceKnown && <span className="helper-text">{t("audience.unknownEdit")}</span>}
      </div>

      <div className="card">
        <span className="eyebrow">{t("story.options")}</span>
        <label className="option-row">
          <input type="checkbox" checked={pinned} disabled={busy} onChange={(e) => setPinned(e.target.checked)} />
          <span className="stack" style={{ gap: 0 }}>
            <span className="row" style={{ gap: 6, fontWeight: 600 }}>
              <Pin size={13} aria-hidden="true" /> {t("story.keepOnProfile")}
            </span>
            <span className="helper-text">{t("story.keepOnProfileHint")}</span>
          </span>
        </label>
        <label className="option-row">
          <input type="checkbox" checked={noforwards} disabled={busy || isEdit} onChange={(e) => setNoforwards(e.target.checked)} />
          <span className="stack" style={{ gap: 0 }}>
            <span className="row" style={{ gap: 6, fontWeight: 600 }}>
              <ShieldOff size={13} aria-hidden="true" /> {t("story.protectContent")}
            </span>
            <span className="helper-text">{isEdit ? t("story.protectContentLocked") : t("story.protectContentHint")}</span>
          </span>
        </label>
      </div>

      {!isEdit && (
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
      )}

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

      {error && targetFailures.length <= 1 && <ErrorPanel description={error} />}
      {targetFailures.length > 1 && (
        <div className="stack" style={{ gap: 8 }}>
          {targetFailures.map((f) => (
            <div key={f.title} className="stack" style={{ gap: 4 }}>
              <span className="row helper-text" style={{ gap: 4, fontWeight: 600 }}>
                <Radio size={12} aria-hidden="true" /> {f.title}
              </span>
              <ErrorPanel description={f.description} />
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn-cta btn-block" disabled={busy || (isEdit && !file)} onClick={handlePublish}>
        {status === "publishing" ? t("story.publishing") : isEdit ? t("story.saveChanges") : t("story.publish")}
      </button>

      {toast && <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />}
    </div>
  );
}
