import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import { useI18n, useTranslation, formatNumber } from "../../i18n";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { getAllActiveStories } from "../../telegram/client";
import type { Page } from "../layout/BottomTabBar";

export function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { t } = useTranslation();
  const { language } = useI18n();
  const { connected, checking } = useConnectionStatus();
  const [storyCount, setStoryCount] = useState<number | null>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    getAllActiveStories()
      .then((stories) => {
        if (!cancelled) setStoryCount(stories.length);
      })
      .catch((err) => {
        console.error("[home] getAllActiveStories failed:", err);
        if (!cancelled) setStoryCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18 }}>{t("home.title")}</h1>

      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="card stat-card">
          <span
            className={`status-pill ${connected ? "is-connected" : "is-disconnected"}`}
            style={{ alignSelf: "flex-start" }}
          >
            <span className={`live-dot ${connected ? "is-live" : ""}`} />
            {checking
              ? t("common.loading")
              : connected
                ? t("home.connectionConnected")
                : t("home.connectionNotConnected")}
          </span>
        </div>

        <div className="card stat-card">
          <span className="stat-value">
            {storyCount === null ? "—" : formatNumber(storyCount, language)}
          </span>
          <span className="stat-label">{t("home.storiesPublishedLabel")}</span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-cta btn-block"
        onClick={() => onNavigate("createStory")}
      >
        <PlusCircle size={16} aria-hidden="true" />
        {t("home.createStoryCta")}
      </button>
    </div>
  );
}
