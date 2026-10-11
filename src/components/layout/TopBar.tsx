import type { CSSProperties } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { LanguageSwitcherCompact } from "./LanguageSwitcherCompact";
import { ThemeToggleCompact } from "./ThemeToggleCompact";

export function TopBar() {
  const { t } = useTranslation();
  const { connected, checking } = useConnectionStatus();

  return (
    <header className="top-bar">
      <span className="wordmark">{t("app.name")}</span>

      <div className="row" style={{ gap: 10 }}>
        <ThemeToggleCompact />
        <LanguageSwitcherCompact />

        <div
          className={`story-ring ${checking || !connected ? "is-muted" : ""}`}
          style={{ "--ring-size": "32px" } as CSSProperties}
          role="status"
          aria-label={connected ? t("home.connectionConnected") : t("home.connectionNotConnected")}
          title={connected ? t("home.connectionConnected") : t("home.connectionNotConnected")}
        >
          <div className="story-ring-inner">
            <Send size={14} strokeWidth={2.25} aria-hidden="true" />
          </div>
        </div>
      </div>
    </header>
  );
}
