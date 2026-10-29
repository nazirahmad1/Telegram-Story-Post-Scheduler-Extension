import { useCallback, useEffect, useState } from "react";
import { Eye, Heart, Share2, Ban, EyeOff, Search } from "lucide-react";
import { useI18n, useTranslation, formatDate, formatNumber } from "../../i18n";
import { getStoryViewers, type MyStoryItem, type StoryViewer, type StoryViewersPage } from "../../telegram/client";
import { describeTelegramError, type ErrorDescription } from "../../telegram/errors";
import { ErrorPanel } from "../ErrorPanel";

/** Who actually watched a story (Telegram mobile's "Viewers" sheet): name, time, reaction. */
export function ViewersPanel({ story }: { story: MyStoryItem }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [page, setPage] = useState<StoryViewersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (offset: string, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const result = await getStoryViewers(story, { offset, query });
        setPage(result);
        setViewers((prev) => (replace ? result.viewers : [...prev, ...result.viewers]));
      } catch (err) {
        setError(describeTelegramError(err, t));
      } finally {
        setLoading(false);
      }
    },
    [story, query, t],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load("", true), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  return (
    <div className="viewers-panel">
      {page && (
        <span className="row helper-text" style={{ gap: 12, flexWrap: "wrap" }}>
          <span className="row" style={{ gap: 4 }}><Eye size={13} aria-hidden="true" />{formatNumber(page.total, language)}</span>
          {page.reactions > 0 && <span className="row" style={{ gap: 4 }}><Heart size={13} aria-hidden="true" />{formatNumber(page.reactions, language)}</span>}
          {page.forwards > 0 && <span className="row" style={{ gap: 4 }}><Share2 size={13} aria-hidden="true" />{formatNumber(page.forwards, language)}</span>}
        </span>
      )}
      <label className="row contact-search">
        <Search size={14} aria-hidden="true" />
        <input className="input" type="search" value={query} placeholder={t("viewers.search")} aria-label={t("viewers.search")} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && <ErrorPanel description={error} compact />}
      {!error && !loading && viewers.length === 0 && <span className="helper-text">{t("viewers.empty")}</span>}

      <ul className="contact-list">
        {viewers.map((v) => (
          <li key={v.userId} className="viewer-row">
            <span className="stack" style={{ gap: 0, flex: 1, minWidth: 0 }}>
              <bdi className="contact-name" dir="auto">{v.name}</bdi>
              <span className="helper-text">
                {v.username ? <><bdi dir="ltr">@{v.username}</bdi>{" · "}</> : null}
                {formatDate(new Date(v.date * 1000), language, { month: "short", day: "numeric", hour: "numeric", minute: "numeric" })}
              </span>
            </span>
            {v.reaction && <span aria-label={t("history.reactionsLabel", { count: 1 })}>{v.reaction}</span>}
            {v.blocked && <Ban size={13} aria-label={t("viewers.blocked")} />}
            {!v.blocked && v.hiddenFromThem && <EyeOff size={13} aria-label={t("viewers.hiddenFrom")} />}
          </li>
        ))}
      </ul>

      {loading && <span className="helper-text">{t("common.loading")}</span>}
      {page?.nextOffset && !loading && (
        <button type="button" className="btn btn-ghost" onClick={() => void load(page.nextOffset!, false)}>
          {t("viewers.loadMore")}
        </button>
      )}
    </div>
  );
}
