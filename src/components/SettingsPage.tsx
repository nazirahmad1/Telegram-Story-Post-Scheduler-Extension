import { useState } from "react";
import { CheckCircle2, LogOut, AlertCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { LanguageSelector } from "./LanguageSelector";
import { ThemeSelector } from "./ThemeSelector";
import { ApiCredentialsSettings } from "./ApiCredentialsSettings";
import { Toast } from "./Toast";
import * as telegram from "../telegram/client";
import { translateTelegramError } from "../telegram/errors";
import { useConnectionStatus } from "../telegram/useConnectionStatus";

export function SettingsPage() {
  const { t } = useTranslation();
  const { connected, refresh } = useConnectionStatus();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    setError(null);
    try {
      await telegram.logout();
      await refresh();
    } catch (err) {
      setError(translateTelegramError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: 18 }}>{t("settings.title")}</h1>

      {connected && (
        <div className="card">
          <span className="eyebrow">{t("auth.connectTelegram")}</span>
          <div className="spread">
            <span className="row" style={{ color: "var(--success)" }}>
              <CheckCircle2 size={16} aria-hidden="true" />
              <span style={{ color: "var(--ink)", fontWeight: 600 }}>
                {t("home.connectionConnected")}
              </span>
            </span>
            <button type="button" className="btn btn-secondary" onClick={handleLogout} disabled={busy}>
              <LogOut size={14} aria-hidden="true" />
              {t("auth.logout")}
            </button>
          </div>
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}
        </div>
      )}

      <div className="card">
        <span className="eyebrow">{t("settings.language")}</span>
        <LanguageSelector
          onLanguageChanged={(nativeName) =>
            setToast(t("toast.languageChanged", { language: nativeName }))
          }
        />
      </div>

      <div className="card">
        <span className="eyebrow">{t("settings.appearance")}</span>
        <ThemeSelector
          onThemeChanged={(mode) =>
            setToast(
              t("toast.themeChanged", {
                theme:
                  mode === "light"
                    ? t("settings.themeLight")
                    : mode === "dark"
                      ? t("settings.themeDark")
                      : t("settings.themeSystem"),
              }),
            )
          }
        />
      </div>

      <div className="card">
        <span className="eyebrow">{t("apiCredentials.title")}</span>
        <ApiCredentialsSettings onChanged={() => setToast(t("apiCredentials.saved"))} />
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
