import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Film, Inbox, Globe2, Users, Star, Trash2, AlertCircle, Eye, Heart, Pin, Filter, CalendarPlus, CheckSquare, Square, X, Radio } from "lucide-react";
import { useI18n, useTranslation, formatDate, formatNumber, type TranslationKey } from "../../i18n";
import {
  getAllMyStories,
  deleteStory,
  deleteStories,
  isSessionInvalidated,
  forgetInvalidSession,
  type StoryPrivacy,
  type MyStoryItem,
} from "../../telegram/client";
import { translateTelegramError } from "../../telegram/errors";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { Toast } from "../Toast";
import { StoryViewer } from "./StoryViewer";
import { ScheduleComposer } from "../schedule/ScheduleComposer";
import { ScheduledList } from "../schedule/ScheduledList";
import type { Page } from "../layout/BottomTabBar";

const PRIVACY_META: Record<StoryPrivacy, { key: TranslationKey; icon: typeof Globe2 }> = {
  everyone: { key: "story.privacyEveryone", icon: Globe2 },
  contacts: { key: "story.privacyContacts", icon: Users },
  closeFriends: { key: "story.privacyCloseFriends", icon: Star },
};

type MediaFilter = "all" | "photo" | "video";
type Tab = "published" | "scheduled";

/** Story ids are only unique per-peer — a channel and the personal account (or two different channels) can both have a story #5. */
function storyKey(story: MyStoryItem): string {
  return `${story.target}:${story.id}`;
}

export function HistoryPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { refresh: refreshConnection } = useConnectionStatus();
  const [tab, setTab] = useState<Tab>("published");
  const [showComposer, setShowComposer] = useState(false);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const [stories, setStories] = useState<MyStoryItem[] | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await getAllMyStories();
      setStories(result);
    } catch (err) {
      setError(translateTelegramError(err, t));
      setStories([]);
      if (isSessionInvalidated(err)) {
        await forgetInvalidSession();
        refreshConnection();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredStories = useMemo(() => {
    if (!stories) return null;
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : null;
    // +1 day so "to" is inclusive of the whole selected day, not just its first instant.
    const toMs = dateTo ? new Date(dateTo).getTime() + 24 * 3600 * 1000 : null;
    return stories.filter((story) => {
      if (mediaFilter !== "all" && story.mediaType !== mediaFilter) return false;
      const postedMs = story.date * 1000;
      if (fromMs !== null && postedMs < fromMs) return false;
      if (toMs !== null && postedMs >= toMs) return false;
      return true;
    });
  }, [stories, mediaFilter, dateFrom, dateTo]);

  const filtersActive = mediaFilter !== "all" || !!dateFrom || !!dateTo;

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedKeys(new Set());
  }

  async function handleBulkDelete() {
    if (!stories) return;
    const selected = stories.filter((s) => selectedKeys.has(storyKey(s)));
    if (selected.length === 0) return;
    setBulkDeleting(true);
    setError(null);
    try {
      await deleteStories(selected.map((s) => ({ id: s.id, target: s.target })));
      setStories((prev) => (prev ? prev.filter((s) => !selectedKeys.has(storyKey(s))) : prev));
      setToast({ message: t("history.bulkDeleted", { count: selected.length }), variant: "success" });
      exitSelectionMode();
    } catch (err) {
      const message = translateTelegramError(err, t);
      setError(message);
      setToast({ message, variant: "error" });
      if (isSessionInvalidated(err)) {
        await forgetInvalidSession();
        refreshConnection();
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDelete(story: MyStoryItem) {
    setError(null);
    setDeletingKey(storyKey(story));
    try {
      await deleteStory(story.id, story.target);
      setStories((prev) => (prev ? prev.filter((s) => storyKey(s) !== storyKey(story)) : prev));
      setViewerIndex(null); // indices shift once the underlying list changes; reopening is one tap away
      setToast({ message: t("history.deleted"), variant: "success" });
    } catch (err) {
      const message = translateTelegramError(err, t);
      setError(message);
      setToast({ message, variant: "error" });
      if (isSessionInvalidated(err)) {
        await forgetInvalidSession();
        refreshConnection();
      }
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 style={{ fontSize: 18 }}>{t("history.title")}</h1>
        {tab === "scheduled" && !showComposer && (
          <button type="button" className="btn btn-primary" style={{ padding: "6px 10px" }} onClick={() => setShowComposer(true)}>
            <CalendarPlus size={14} aria-hidden="true" />
            {t("schedule.createNew")}
          </button>
        )}
        {tab === "published" && stories && stories.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "6px 10px" }}
            onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
          >
            {selectionMode ? t("common.cancel") : t("history.select")}
          </button>
        )}
      </div>

      <div className="chip-group" role="tablist" aria-label={t("history.title")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "published"}
          className="chip"
          aria-pressed={tab === "published"}
          onClick={() => setTab("published")}
        >
          {t("history.tabPublished")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scheduled"}
          className="chip"
          aria-pressed={tab === "scheduled"}
          onClick={() => {
            setTab("scheduled");
            setViewerIndex(null); // otherwise it silently reopens when switching back
            exitSelectionMode();
          }}
        >
          {t("history.tabScheduled")}
        </button>
      </div>

      {tab === "scheduled" ? (
        showComposer ? (
          <ScheduleComposer
            onScheduled={() => {
              setShowComposer(false);
              setScheduleRefreshKey((k) => k + 1);
            }}
          />
        ) : (
          <ScheduledList refreshKey={scheduleRefreshKey} />
        )
      ) : (
        <>
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}

          <div className="card">
            <span className="eyebrow">
              <Filter size={12} aria-hidden="true" style={{ verticalAlign: "-2px", marginInlineEnd: 4 }} />
              {t("history.filters")}
            </span>
            <div className="chip-group" role="radiogroup" aria-label={t("history.filterMediaType")}>
              {(["all", "photo", "video"] as const).map((option) => (
                <button
                  key={option}
              type="button"
              role="radio"
              aria-checked={mediaFilter === option}
              aria-pressed={mediaFilter === option}
              className="chip"
              onClick={() => setMediaFilter(option)}
            >
              {option === "photo" && <Image size={13} aria-hidden="true" />}
              {option === "video" && <Film size={13} aria-hidden="true" />}
              {t(
                option === "all"
                  ? "history.filterAll"
                  : option === "photo"
                    ? "history.filterPhotos"
                    : "history.filterVideos",
              )}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="stack" style={{ gap: 2, flex: 1, minWidth: 120 }}>
            <span className="helper-text">{t("history.filterFrom")}</span>
            <input
              type="date"
              className="input"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="stack" style={{ gap: 2, flex: 1, minWidth: 120 }}>
            <span className="helper-text">{t("history.filterTo")}</span>
            <input
              type="date"
              className="input"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>
        {filtersActive && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start", padding: "4px 8px" }}
            onClick={() => {
              setMediaFilter("all");
              setDateFrom("");
              setDateTo("");
            }}
          >
            {t("history.clearFilters")}
          </button>
        )}
      </div>

      <div className="card">
        {stories === null ? (
          <span className="helper-text">{t("common.loading")}</span>
        ) : stories.length === 0 ? (
          <div className="empty-state">
            <Inbox size={32} aria-hidden="true" />
            <p style={{ margin: 0 }}>{t("history.empty")}</p>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("createStory")}>
              {t("history.createFirst")}
            </button>
          </div>
        ) : filteredStories && filteredStories.length === 0 ? (
          <div className="empty-state">
            <Filter size={32} aria-hidden="true" />
            <p style={{ margin: 0 }}>{t("history.noResults")}</p>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {filteredStories?.map((story, i) => {
              const privacy = PRIVACY_META[story.privacy];
              const PrivacyIcon = privacy.icon;
              const key = storyKey(story);
              const isDeleting = deletingKey === key;
              const isSelected = selectedKeys.has(key);
              return (
                <li key={key} className="history-item">
                  <button
                    type="button"
                    className="history-thumb is-clickable"
                    aria-label={selectionMode ? t("history.select") : t("history.viewStory")}
                    onClick={() => (selectionMode ? toggleSelected(key) : setViewerIndex(i))}
                  >
                    {selectionMode ? (
                      isSelected ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )
                    ) : story.mediaType === "video" ? (
                      <Film size={16} />
                    ) : (
                      <Image size={16} />
                    )}
                  </button>
                  <div className="stack" style={{ gap: 2, flex: 1 }}>
                    <span className="row" style={{ gap: 4, fontWeight: 600, fontSize: 13 }}>
                      {story.pinned && <Pin size={12} aria-label={t("history.pinned")} />}
                      {story.expired
                        ? t("history.publishedAt", {
                            date: formatDate(new Date(story.date * 1000), language, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "numeric",
                            }),
                          })
                        : t("history.expiresAt", {
                            date: formatDate(new Date(story.expireDate * 1000), language, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "numeric",
                            }),
                          })}
                      {story.expired && <span className="history-badge">{t("history.expired")}</span>}
                    </span>
                    <span className="row helper-text" style={{ gap: 8, flexWrap: "wrap" }}>
                      {story.target !== "me" && (
                        <span className="row" style={{ gap: 4 }}>
                          <Radio size={12} aria-hidden="true" />
                          {story.targetLabel}
                        </span>
                      )}
                      <span className="row" style={{ gap: 4 }}>
                        <PrivacyIcon size={12} aria-hidden="true" />
                        {t(privacy.key)}
                      </span>
                      {story.views !== null && (
                        <span className="row" style={{ gap: 4 }} aria-label={t("history.viewsLabel", { count: story.views })}>
                          <Eye size={12} aria-hidden="true" />
                          {formatNumber(story.views, language)}
                        </span>
                      )}
                      {!!story.reactions && (
                        <span className="row" style={{ gap: 4 }} aria-label={t("history.reactionsLabel", { count: story.reactions })}>
                          <Heart size={12} aria-hidden="true" />
                          {formatNumber(story.reactions, language)}
                        </span>
                      )}
                    </span>
                  </div>
                  {!selectionMode && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={t("history.deleteStory")}
                      disabled={isDeleting}
                      onClick={() => handleDelete(story)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectionMode && (
        <div className="card spread">
          <span className="helper-text">{t("history.selectedCount", { count: selectedKeys.size })}</span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={exitSelectionMode} disabled={bulkDeleting}>
              <X size={14} aria-hidden="true" />
              {t("common.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selectedKeys.size === 0 || bulkDeleting}
              onClick={handleBulkDelete}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t("common.delete")}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}

      {stories && filteredStories && viewerIndex !== null && (
        <StoryViewer
          stories={filteredStories}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDelete}
          deletingKey={deletingKey}
        />
      )}
        </>
      )}
    </div>
  );
}
