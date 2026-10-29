import { useEffect, useState } from "react";
import { AlertCircle, Copy, Lightbulb } from "lucide-react";
import { useTranslation } from "../i18n";
import type { ErrorDescription } from "../telegram/errors";

/**
 * Structured error display: what happened, why, what to do, and the exact
 * Telegram code (copyable for a bug report). Counts down flood waits live.
 */
export function ErrorPanel({ description, compact = false }: { description: ErrorDescription; compact?: boolean }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(description.retryAfter ?? 0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRemaining(description.retryAfter ?? 0);
    if (!description.retryAfter) return;
    const timer = setInterval(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [description]);

  async function copyCode() {
    if (!description.code) return;
    try {
      await navigator.clipboard.writeText(description.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the code is still visible on screen.
    }
  }

  return (
    <div className="error-panel" role="alert" style={compact ? { width: "100%" } : undefined}>
      <span className="error-panel-title">
        <AlertCircle size={15} aria-hidden="true" /> {description.title}
      </span>
      {description.reason && <p className="error-panel-reason">{description.reason}</p>}
      {description.retryAfter ? (
        <p className="error-panel-fix">
          <Lightbulb size={13} aria-hidden="true" />{" "}
          {remaining > 0 ? t("errors.floodWait", { count: remaining }) : t("errors.waitOver")}
        </p>
      ) : (
        description.fix && (
          <p className="error-panel-fix">
            <Lightbulb size={13} aria-hidden="true" /> {description.fix}
          </p>
        )
      )}
      {description.code && (
        <button type="button" className="error-panel-code" onClick={copyCode} aria-label={t("errors.copyCode")}>
          <code>{description.code}</code>
          <Copy size={12} aria-hidden="true" />
          {copied && <span>{t("toast.copied")}</span>}
        </button>
      )}
    </div>
  );
}
