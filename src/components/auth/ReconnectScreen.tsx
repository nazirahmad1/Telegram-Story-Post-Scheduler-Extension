import { WifiOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { describeTelegramError } from "../../telegram/errors";
import { ErrorPanel } from "../ErrorPanel";

/**
 * Shown when Telegram can't be reached to verify the login. The saved session
 * is NOT touched and the person is NOT asked to log in again — the previous
 * version showed the login form here, which read as "you're logged out".
 */
export function ReconnectScreen() {
  const { t } = useTranslation();
  const { refresh, lastError } = useConnectionStatus();
  const [busy, setBusy] = useState(false);
  const description = lastError ? describeTelegramError(lastError, t) : null;

  async function retry() {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-content" style={{ justifyContent: "center", flex: 1 }}>
      <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: "var(--space-4)" }}>
        <WifiOff size={36} aria-hidden="true" />
        <div className="stack" style={{ gap: "var(--space-1)" }}>
          <h1 style={{ fontSize: 18 }}>{t("auth.offlineTitle")}</h1>
          <p className="helper-text" style={{ maxWidth: 300 }}>
            {t("auth.offlineBody")}
          </p>
        </div>
        {description && <ErrorPanel description={description} compact />}
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={retry}>
          <RefreshCw size={14} aria-hidden="true" />
          {busy ? t("common.loading") : t("common.retry")}
        </button>
      </div>
    </div>
  );
}
