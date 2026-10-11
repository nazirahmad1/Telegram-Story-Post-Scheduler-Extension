import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download, AlertCircle, Trash2, Eye, Heart, Radio } from "lucide-react";
import { useTranslation, formatDate, formatNumber, useI18n } from "../../i18n";
import { DirectionalIcon } from "../Icon";
import { downloadStoryMedia, type MyStoryItem } from "../../telegram/client";
import { translateTelegramError } from "../../telegram/errors";

interface StoryViewerProps {
  stories: MyStoryItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete: (story: MyStoryItem) => Promise<void>;
  deletingKey: string | null;
}

/** Story ids are only unique per-peer — a channel and the personal account can both have a story #5. */
function storyKey(story: MyStoryItem): string {
  return `${story.target}:${story.id}`;
}

/**
 * Downloads and caches each story's media as an object URL, keyed by
 * target+id, so navigating back and forth doesn't re-download anything
 * already seen this session. Object URLs are revoked on unmount to avoid
 * leaking memory — this is the only place in the app that deals with Blobs.
 */
function useStoryMedia(story: MyStoryItem | undefined) {
  const cacheRef = useRef(new Map<string, string>());
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!story) return;
    const key = storyKey(story);
    const cached = cacheRef.current.get(key);
    if (cached) {
      setUrl(cached);
      setError(null);
      return;
    }

    let cancelled = false;
    setUrl(null);
    setProgress(0);
    setError(null);

    downloadStoryMedia(story, (fraction) => {
      if (!cancelled) setProgress(fraction);
    })
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        cacheRef.current.set(key, objectUrl);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(translateTelegramError(err, t));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story && storyKey(story)]);

  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const objectUrl of cache.values()) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return { url, progress, error };
}

export function StoryViewer({
  stories,
  index,
  onIndexChange,
  onClose,
  onDelete,
  deletingKey,
}: StoryViewerProps) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const story = stories[index];
  const { url, progress, error } = useStoryMedia(story);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const hasPrev = index > 0;
  const hasNext = index < stories.length - 1;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hasPrev, hasNext, index, onClose, onIndexChange]);

  if (!story) return null;

  async function handleSave() {
    if (!url || !story) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const extension = story.mediaType === "video" ? "mp4" : "jpg";
      const a = document.createElement("a");
      a.href = url;
      a.download = `story-${story.id}.${extension}`;
      a.click();
    } catch (err) {
      setDownloadError(translateTelegramError(err, t));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={t("history.viewStory")}>
      <div className="story-viewer-topbar">
        <span className="stack" style={{ gap: 0 }}>
          <span className="helper-text">
            {formatDate(new Date(story.date * 1000), language, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
          {story.target !== "me" && (
            <span className="row helper-text" style={{ gap: 4, fontSize: 11 }}>
              <Radio size={11} aria-hidden="true" />
              {story.targetLabel}
            </span>
          )}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={t("history.download")}
            disabled={!url || downloading}
            onClick={handleSave}
          >
            <Download size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={t("history.deleteStory")}
            disabled={deletingKey === storyKey(story)}
            onClick={() => onDelete(story)}
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="story-viewer-media">
        <button
          type="button"
          className="story-viewer-nav is-prev"
          aria-label={t("history.previousStory")}
          disabled={!hasPrev}
          onClick={() => onIndexChange(index - 1)}
        >
          <DirectionalIcon name="chevron-left" icon={ChevronLeft} size={22} />
        </button>

        {error ? (
          <span className="error-text">
            <AlertCircle size={13} /> {error}
          </span>
        ) : !url ? (
          <span className="helper-text">
            {t("story.uploading")} {Math.round(progress * 100)}%
          </span>
        ) : story.mediaType === "video" ? (
          // Native controls (not a custom player) — the browser's own video
          // element already gives play/pause, seek, and a volume slider,
          // which is the actual ask here and far more reliable than a
          // hand-rolled one.
          <video src={url} controls autoPlay />
        ) : (
          <img src={url} alt={story.caption ?? ""} />
        )}

        <button
          type="button"
          className="story-viewer-nav is-next"
          aria-label={t("history.nextStory")}
          disabled={!hasNext}
          onClick={() => onIndexChange(index + 1)}
        >
          <DirectionalIcon name="chevron-right" icon={ChevronRight} size={22} />
        </button>
      </div>

      <div className="story-viewer-footer">
        <div className="story-viewer-progress" aria-hidden="true">
          {stories.map((s, i) => (
            <span key={storyKey(s)} className={i === index ? "is-current" : ""} />
          ))}
        </div>
        {story.caption && <p style={{ margin: 0, fontSize: 13 }}>{story.caption}</p>}
        {(story.views !== null || !!story.reactions) && (
          <span className="row helper-text" style={{ gap: 12 }}>
            {story.views !== null && (
              <span className="row" style={{ gap: 4 }} aria-label={t("history.viewsLabel", { count: story.views })}>
                <Eye size={13} aria-hidden="true" />
                {formatNumber(story.views, language)}
              </span>
            )}
            {!!story.reactions && (
              <span className="row" style={{ gap: 4 }} aria-label={t("history.reactionsLabel", { count: story.reactions })}>
                <Heart size={13} aria-hidden="true" />
                {formatNumber(story.reactions, language)}
              </span>
            )}
          </span>
        )}
        {downloadError && (
          <span className="error-text">
            <AlertCircle size={13} /> {downloadError}
          </span>
        )}
      </div>
    </div>
  );
}
