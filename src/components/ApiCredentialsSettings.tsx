import { useEffect, useState } from "react";
import { KeyRound, ExternalLink, AlertCircle, Check } from "lucide-react";
import { useTranslation } from "../i18n";
import * as telegram from "../telegram/client";
import {
  getCustomApiCredentials,
  setCustomApiCredentials,
  clearCustomApiCredentials,
} from "../telegram/credentials-storage";
import { hasBuildDefaultCredentials } from "../telegram/config";
import { useConnectionStatus } from "../telegram/useConnectionStatus";

const MY_TELEGRAM_APPS_URL = "https://my.telegram.org/apps";

export function ApiCredentialsSettings({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const { refresh: refreshConnection } = useConnectionStatus();
  const [hasCustom, setHasCustom] = useState(false);
  const [hasDefault, setHasDefault] = useState(true);
  const [editing, setEditing] = useState(false);
  const [apiIdInput, setApiIdInput] = useState("");
  const [apiHashInput, setApiHashInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomApiCredentials().then((custom) => setHasCustom(!!custom));
    hasBuildDefaultCredentials().then(setHasDefault);
  }, []);

  function startEditing() {
    setError(null);
    setApiIdInput("");
    setApiHashInput("");
    setEditing(true);
  }

  async function handleSave() {
    setError(null);
    const apiId = Number(apiIdInput.trim());
    const apiHash = apiHashInput.trim();
    if (!Number.isInteger(apiId) || apiId <= 0) return setError(t("apiCredentials.invalidId"));
    if (!/^[a-f0-9]{32}$/i.test(apiHash)) return setError(t("apiCredentials.invalidHash"));

    setBusy(true);
    try {
      await setCustomApiCredentials({ apiId, apiHash });
      await telegram.resetClientForNewCredentials();
      setHasCustom(true);
      setEditing(false);
      refreshConnection(); // session is gone either way — this sends the app back to the login screen
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleUseDefault() {
    setBusy(true);
    setError(null);
    try {
      await clearCustomApiCredentials();
      await telegram.resetClientForNewCredentials();
      setHasCustom(false);
      setEditing(false);
      refreshConnection();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="stack">
        <label className="stack" style={{ gap: 4 }}>
          <span className="helper-text">{t("apiCredentials.apiId")}</span>
          <input
            className="input"
            inputMode="numeric"
            value={apiIdInput}
            disabled={busy}
            onChange={(e) => setApiIdInput(e.target.value)}
            placeholder="12345678"
          />
        </label>
        <label className="stack" style={{ gap: 4 }}>
          <span className="helper-text">{t("apiCredentials.apiHash")}</span>
          <input
            className="input"
            value={apiHashInput}
            disabled={busy}
            onChange={(e) => setApiHashInput(e.target.value)}
            placeholder="0123456789abcdef0123456789abcdef"
          />
        </label>

        <a
          href={MY_TELEGRAM_APPS_URL}
          target="_blank"
          rel="noreferrer"
          className="row helper-text"
          style={{ gap: 4 }}
        >
          <ExternalLink size={12} aria-hidden="true" />
          {t("apiCredentials.getCredentialsLink")}
        </a>

        <span className="error-text">
          <AlertCircle size={13} />
          {t("apiCredentials.logoutWarning")}
        </span>
        {error && (
          <span className="error-text">
            <AlertCircle size={13} /> {error}
          </span>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleSave}>
            {t("common.save")}
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <span className="row helper-text" style={{ gap: 6 }}>
        <KeyRound size={13} aria-hidden="true" />
        {hasCustom ? (
          <span className="row" style={{ gap: 4, color: "var(--success)" }}>
            <Check size={13} aria-hidden="true" />
            {t("apiCredentials.usingCustom")}
          </span>
        ) : hasDefault ? (
          t("apiCredentials.usingDefault")
        ) : (
          <span style={{ color: "var(--danger)" }}>{t("apiCredentials.noneConfigured")}</span>
        )}
      </span>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={startEditing}>
          {hasCustom ? t("apiCredentials.change") : t("apiCredentials.useOwn")}
        </button>
        {hasCustom && hasDefault && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={handleUseDefault}>
            {t("apiCredentials.useDefault")}
          </button>
        )}
      </div>
    </div>
  );
}
