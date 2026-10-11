import { useEffect, useState, type CSSProperties } from "react";
import { Send, CalendarClock, Settings2, AlertCircle } from "lucide-react";
import { useTranslation } from "../../i18n";
import { AuthFlow } from "./AuthFlow";
import { ApiCredentialsSettings } from "../ApiCredentialsSettings";
import { getActionableScheduledStoryCount } from "../../scheduling/db";
import { getCustomApiCredentials } from "../../telegram/credentials-storage";
import { hasBuildDefaultCredentials } from "../../telegram/config";

/**
 * "One screen, one message, one action" — the whole app (Home/Create/
 * History/Settings) is hidden behind this until the person connects.
 * Nothing else competes for attention on first open: a headline, one
 * sentence of context, and a single button. The phone/code form only
 * appears after that button is tapped (progressive disclosure per Hick's
 * Law), instead of dropping a form in front of someone who hasn't decided
 * to act yet.
 */
export function ConnectGate() {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [pendingScheduled, setPendingScheduled] = useState(0);
  const [showCredentials, setShowCredentials] = useState(false);
  const [missingCredentials, setMissingCredentials] = useState(false);

  useEffect(() => {
    // IndexedDB doesn't require an authorized session to read, so this
    // works even here, before login — it's specifically what explains
    // *why* logging back in matters beyond "the app wants it".
    getActionableScheduledStoryCount()
      .then(setPendingScheduled)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Check this UP FRONT rather than letting the person fill out the
    // phone form and only discover it after a failed submit — a missing
    // api_id/api_hash is a setup problem, not a login problem, and the
    // fastest way to a fix is showing the credentials section already
    // open with an explanation, not a generic error after the fact.
    Promise.all([getCustomApiCredentials(), hasBuildDefaultCredentials()]).then(([custom, hasDefault]) => {
      if (!custom && !hasDefault) {
        setMissingCredentials(true);
        setShowCredentials(true);
      }
    });
  }, []);

  return (
    <div className="app-content" style={{ justifyContent: "center", flex: 1 }}>
      <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: "var(--space-4)" }}>
        <div className="story-ring" style={{ "--ring-size": "64px" } as CSSProperties}>
          <div className="story-ring-inner">
            <Send size={26} strokeWidth={2} aria-hidden="true" />
          </div>
        </div>

        <div className="stack" style={{ gap: "var(--space-1)" }}>
          <h1 style={{ fontSize: 20 }}>{t("app.name")}</h1>
          <p className="helper-text" style={{ maxWidth: 280 }}>
            {t("auth.onboardingIntro")}
          </p>
        </div>

        {pendingScheduled > 0 && (
          <div className="card" style={{ width: "100%", borderInlineStart: "3px solid var(--signal)" }}>
            <span className="row helper-text" style={{ gap: 6, color: "var(--ink)", fontWeight: 600 }}>
              <CalendarClock size={14} aria-hidden="true" />
              {t("schedule.needsLoginTitle", { count: pendingScheduled })}
            </span>
          </div>
        )}

        {missingCredentials && (
          <div className="card" style={{ width: "100%", borderInlineStart: "3px solid var(--danger)" }}>
            <span className="row error-text" style={{ fontWeight: 600 }}>
              <AlertCircle size={14} aria-hidden="true" />
              {t("errors.missingApiCredentials")}
            </span>
          </div>
        )}

        {!started ? (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={missingCredentials}
            onClick={() => setStarted(true)}
          >
            {t("auth.connectTelegram")}
          </button>
        ) : (
          <div className="card" style={{ width: "100%", textAlign: "start" }}>
            <AuthFlow onCancel={() => setStarted(false)} />
          </div>
        )}

        {!started && (
          <button
            type="button"
            className="row helper-text"
            style={{ background: "none", border: "none", cursor: "pointer", gap: 4 }}
            onClick={() => setShowCredentials((v) => !v)}
          >
            <Settings2 size={12} aria-hidden="true" />
            {t("apiCredentials.title")}
          </button>
        )}
        {showCredentials && !started && (
          <div className="card" style={{ width: "100%", textAlign: "start" }}>
            <ApiCredentialsSettings onChanged={() => setMissingCredentials(false)} />
          </div>
        )}
      </div>
    </div>
  );
}
