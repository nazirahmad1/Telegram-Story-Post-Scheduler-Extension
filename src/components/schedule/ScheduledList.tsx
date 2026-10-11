import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { Image, Film, Inbox, Clock, AlertCircle, CheckCircle2, X, RotateCcw, LogIn, Copy, Check } from "lucide-react";
import { useI18n, useTranslation, formatDate } from "../../i18n";
import {
  getAllScheduledStories,
  deleteScheduledStory,
  updateScheduledStory,
  addScheduledStory,
  type ScheduledStory,
} from "../../scheduling/db";
import { cancelStoryAlarm, createStoryAlarm, SCHEDULED_STORY_UPDATED_MESSAGE } from "../../scheduling/alarms";
import { clearScheduledBadge } from "../../scheduling/badge";
import { publishStory, isSessionInvalidated, forgetInvalidSession } from "../../telegram/client";
import { translateTelegramError } from "../../telegram/errors";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { Toast } from "../Toast";

const STATUS_META: Record<ScheduledStory["status"], { icon: typeof Clock }> = {
  pending: { icon: Clock },
  publishing: { icon: Clock },
  published: { icon: CheckCircle2 },
  failed: { icon: AlertCircle },
};

const MIN_LEAD_MS = 60_000;

function defaultDateTimeLocalValue(): string {
  const inOneHour = new Date(Date.now() + 3600_000);
  inOneHour.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${inOneHour.getFullYear()}-${pad(inOneHour.getMonth() + 1)}-${pad(inOneHour.getDate())}T${pad(inOneHour.getHours())}:${pad(inOneHour.getMinutes())}`;
}

export function ScheduledList({ refreshKey }: { refreshKey: number }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { refresh: refreshConnection } = useConnectionStatus();
  const [entries, setEntries] = useState<ScheduledStory[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [duplicateAt, setDuplicateAt] = useState(defaultDateTimeLocalValue);

  const load = useCallback(async () => {
    setEntries(await getAllScheduledStories());
  }, []);

  useEffect(() => {
    load();
    clearScheduledBadge();
  }, [load, refreshKey]);

  // background.ts broadcasts this after a scheduled story's status
  // changes — without it, an open popup would show stale status (e.g.
  // still "Scheduled") until manually closed and reopened, even though
  // the publish already happened in the background.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    function handleMessage(message: unknown) {
      if (
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === SCHEDULED_STORY_UPDATED_MESSAGE
      ) {
        load();
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [load]);

  const needsLogin = useMemo(
    () => entries?.filter((e) => e.status === "failed" && e.failureReason === "session") ?? [],
    [entries],
  );

  async function handleLogInAgain() {
    await forgetInvalidSession();
    refreshConnection(); // flips the whole app to the login screen — see App.tsx
  }

  async function handleCancel(entry: ScheduledStory) {
    setBusyId(entry.id);
    try {
      await cancelStoryAlarm(entry.id);
      await deleteScheduledStory(entry.id);
      await load();
      setToast({ message: t("schedule.canceled"), variant: "success" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRetryNow(entry: ScheduledStory) {
    setBusyId(entry.id);
    try {
      await updateScheduledStory(entry.id, { status: "publishing", lastError: null, failureReason: null });
      const file = new File([entry.file], entry.fileName, { type: entry.fileType });
      const results = await publishStory({
        file,
        caption: entry.caption || undefined,
        privacy: entry.privacy,
        targets: entry.targets,
        period: entry.period,
      });
      const failed = results.filter((r) => r.error);
      if (failed.length === 0) {
        await updateScheduledStory(entry.id, { status: "published", lastError: null, failureReason: null });
        setToast({ message: t("story.publishSuccess"), variant: "success" });
      } else {
        const message = translateTelegramError(failed[0].error, t);
        const sessionDead = isSessionInvalidated(failed[0].error);
        await updateScheduledStory(entry.id, {
          status: "failed",
          lastError: sessionDead ? t("schedule.needsLoginBody") : message,
          failureReason: sessionDead ? "session" : "other",
        });
        setToast({ message, variant: "error" });
        if (sessionDead) {
          await forgetInvalidSession();
          refreshConnection();
        }
      }
    } catch (err) {
      const message = translateTelegramError(err, t);
      const sessionDead = isSessionInvalidated(err);
      await updateScheduledStory(entry.id, {
        status: "failed",
        lastError: sessionDead ? t("schedule.needsLoginBody") : message,
        failureReason: sessionDead ? "session" : "other",
      });
      setToast({ message, variant: "error" });
    } finally {
      await load();
      setBusyId(null);
    }
  }

  async function handleDismiss(entry: ScheduledStory) {
    setBusyId(entry.id);
    try {
      await deleteScheduledStory(entry.id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function startDuplicate(entry: ScheduledStory) {
    setDuplicatingId(entry.id);
    setDuplicateAt(defaultDateTimeLocalValue());
  }

  async function confirmDuplicate(entry: ScheduledStory) {
    const scheduledFor = new Date(duplicateAt).getTime();
    if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() + MIN_LEAD_MS) {
      setToast({ message: t("schedule.mustBeFuture"), variant: "error" });
      return;
    }
    setBusyId(entry.id);
    try {
      const copy = await addScheduledStory({
        file: entry.file,
        fileName: entry.fileName,
        fileType: entry.fileType,
        caption: entry.caption,
        privacy: entry.privacy,
        targets: entry.targets,
        period: entry.period,
        scheduledFor,
      });
      await createStoryAlarm(copy.id, scheduledFor);
      setDuplicatingId(null);
      await load();
      setToast({ message: t("schedule.duplicated"), variant: "success" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      {needsLogin.length > 0 && (
        <div className="card" style={{ borderInlineStart: "3px solid var(--danger)" }}>
          <span className="row error-text" style={{ fontWeight: 600 }}>
            <AlertCircle size={14} aria-hidden="true" />
            {t("schedule.needsLoginTitle", { count: needsLogin.length })}
          </span>
          <span className="helper-text">{t("schedule.needsLoginBody")}</span>
          <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={handleLogInAgain}>
            <LogIn size={14} aria-hidden="true" />
            {t("schedule.logInAgain")}
          </button>
        </div>
      )}

      <div className="card">
        {entries === null ? (
          <span className="helper-text">{t("common.loading")}</span>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <Inbox size={32} aria-hidden="true" />
            <p style={{ margin: 0 }}>{t("schedule.empty")}</p>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {entries.map((entry) => {
              const StatusIcon = STATUS_META[entry.status].icon;
              const isBusy = busyId === entry.id;
              return (
                <Fragment key={entry.id}>
                <li className="history-item">
                  <div className="history-thumb">
                    {entry.fileType.startsWith("video/") ? <Film size={16} /> : <Image size={16} />}
                  </div>
                  <div className="stack" style={{ gap: 2, flex: 1 }}>
                    <span
                      className="row"
                      style={{
                        gap: 4,
                        fontWeight: 600,
                        fontSize: 13,
                        color:
                          entry.status === "failed"
                            ? "var(--danger)"
                            : entry.status === "published"
                              ? "var(--success)"
                              : "var(--ink)",
                      }}
                    >
                      <StatusIcon size={13} aria-hidden="true" />
                      {formatDate(new Date(entry.scheduledFor), language, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "numeric",
                      })}
                    </span>
                    <span className="helper-text">
                      {entry.status === "failed" && entry.failureReason === "session"
                        ? t("schedule.needsLoginShort")
                        : t(`schedule.status.${entry.status}` as const)}
                    </span>
                    {entry.status === "failed" && entry.failureReason !== "session" && entry.lastError && (
                      <span className="error-text">
                        <AlertCircle size={12} /> {entry.lastError}
                      </span>
                    )}
                  </div>
                  {entry.status === "pending" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={t("schedule.cancel")}
                      disabled={isBusy}
                      onClick={() => handleCancel(entry)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                  {entry.status === "failed" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={t("schedule.retryNow")}
                      disabled={isBusy}
                      onClick={() => handleRetryNow(entry)}
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label={t("schedule.duplicate")}
                    disabled={isBusy}
                    onClick={() => startDuplicate(entry)}
                  >
                    <Copy size={16} aria-hidden="true" />
                  </button>
                  {entry.status === "published" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={t("common.delete")}
                      disabled={isBusy}
                      onClick={() => handleDismiss(entry)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
                {duplicatingId === entry.id && (
                  <li className="history-item" style={{ paddingInlineStart: 48 }}>
                    <div className="row" style={{ gap: 8, flex: 1, flexWrap: "wrap" }}>
                      <input
                        type="datetime-local"
                        className="input"
                        style={{ flex: 1, minWidth: 160 }}
                        value={duplicateAt}
                        min={defaultDateTimeLocalValue()}
                        disabled={busyId === entry.id}
                        onChange={(e) => setDuplicateAt(e.target.value)}
                        aria-label={t("schedule.publishAt")}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: "6px 10px" }}
                        disabled={busyId === entry.id}
                        onClick={() => confirmDuplicate(entry)}
                      >
                        <Check size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "6px 10px" }}
                        disabled={busyId === entry.id}
                        onClick={() => setDuplicatingId(null)}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                )}
                </Fragment>
              );
            })}
          </ul>
        )}

        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
        )}
      </div>
    </div>
  );
}
