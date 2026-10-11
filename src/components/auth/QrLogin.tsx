import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "../../i18n";

interface QrLoginProps {
  /** Deep link (tg://login?token=...) to render, or null while the first token is still loading. */
  url: string | null;
  /** true once the token has passed its `expires` timestamp and a fresh one hasn't arrived yet. */
  expired: boolean;
}

/**
 * Just the QR image itself. Regenerating the PNG is cheap and keeps this
 * component free of any Telegram-specific logic — AuthFlow owns the actual
 * login attempt (via telegram.startQrLogin) and only passes down the
 * current token's deep link.
 */
export function QrLogin({ url, expired }: QrLoginProps) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch((err) => {
        console.error("[qr-login] failed to render QR image:", err);
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="stack" style={{ alignItems: "center", textAlign: "center" }}>
      <div
        style={{
          width: 240,
          height: 240,
          borderRadius: "var(--radius-lg, 12px)",
          background: "var(--surface-2, #fff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={t("auth.scanQrCode")}
            width={240}
            height={240}
            style={{ opacity: expired ? 0.35 : 1, transition: "opacity 150ms ease" }}
          />
        ) : (
          <span className="helper-text">{t("common.loading")}</span>
        )}
        {expired && dataUrl && (
          <span
            className="helper-text"
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {t("auth.qrExpired")}
          </span>
        )}
      </div>
      <p className="helper-text" style={{ maxWidth: 260 }}>
        {t("auth.qrInstructions")}
      </p>
    </div>
  );
}
