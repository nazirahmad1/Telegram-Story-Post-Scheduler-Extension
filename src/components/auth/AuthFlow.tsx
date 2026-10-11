import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Lock, Eye, EyeOff, AlertCircle, QrCode, Smartphone } from "lucide-react";
import { useTranslation } from "../../i18n";
import { DirectionalIcon } from "../Icon";
import * as telegram from "../../telegram/client";
import { translateTelegramError } from "../../telegram/errors";
import { useConnectionStatus } from "../../telegram/useConnectionStatus";
import { CountryPicker } from "./CountryPicker";
import { QrLogin } from "./QrLogin";
import { guessDefaultCountry, type Country } from "../../telegram/countries";

type Step = "phone" | "code" | "twoFactor" | "qr";
const STEP_ORDER: Step[] = ["phone", "code", "twoFactor"];

/**
 * Just the connect steps (phone -> code -> optional 2FA). Deliberately has
 * no "connected" state of its own: once login succeeds it calls refresh(),
 * and the parent ConnectGate (which only renders this while disconnected)
 * unmounts it in favor of the main app.
 *
 * `onCancel` is only offered on the phone step — once a code has actually
 * been requested from Telegram, "back" moves between steps instead, since
 * losing that in-flight state silently would be more confusing than
 * helpful.
 */
export function AuthFlow({ onCancel }: { onCancel?: () => void }) {
  const { t } = useTranslation();
  const { refresh } = useConnectionStatus();
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<Country>(() => guessDefaultCountry());
  const [nationalNumber, setNationalNumber] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordHint, setPasswordHint] = useState<string | undefined>();
  const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [entryMethod, setEntryMethod] = useState<"phone" | "qr">("phone");

  const fullPhone = `+${country.dialCode}${nationalNumber.replace(/\D/g, "")}`;

  // Runs the whole scan-and-wait call for as long as the "qr" step is
  // mounted. `active` is checked before every state update because
  // telegram.startQrLogin has no cancellation hook of its own — if the
  // person switches back to phone entry mid-scan, the request that's
  // in-flight on Telegram's side just gets its result thrown away here
  // instead of touching state for a screen that's no longer showing.
  useEffect(() => {
    if (step !== "qr") return;

    let active = true;
    setQrUrl(null);
    setQrExpired(false);
    setError(null);

    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    function armExpiry(expiresAtSeconds: number) {
      if (expiryTimer) clearTimeout(expiryTimer);
      const msLeft = expiresAtSeconds * 1000 - Date.now();
      expiryTimer = setTimeout(() => {
        if (active) setQrExpired(true);
      }, Math.max(msLeft, 0));
    }

    telegram
      .startQrLogin((token) => {
        if (!active) return;
        setQrUrl(token.url);
        setQrExpired(false);
        armExpiry(token.expires);
      })
      .then(async (result) => {
        if (!active) return;
        if (result.status === "passwordNeeded") {
          setEntryMethod("qr");
          setPasswordHint(result.hint);
          setStep("twoFactor");
        } else {
          await refresh();
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(translateTelegramError(err, t));
      });

    return () => {
      active = false;
      if (expiryTimer) clearTimeout(expiryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = nationalNumber.replace(/\D/g, "");
    if (!digits) return setError(t("validation.required"));
    if (digits.length < 4) return setError(t("validation.invalidPhoneNumber"));

    setError(null);
    setBusy(true);
    try {
      const { phoneCodeHash: hash } = await telegram.requestLoginCode(fullPhone);
      setPhoneCodeHash(hash);
      setStep("code");
    } catch (err) {
      setError(translateTelegramError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    // Telegram's own apps often display the code with a separating space
    // (e.g. "1 2 3 4 5") for readability — normalize away anything that
    // isn't a digit before validating, so a copy-pasted code isn't
    // rejected by our own form for a formatting reason that has nothing
    // to do with whether the code is actually correct.
    const cleanCode = code.replace(/\D/g, "");
    if (!cleanCode) return setError(t("validation.required"));
    if (!/^\d{4,6}$/.test(cleanCode)) return setError(t("validation.invalidCode"));
    if (!phoneCodeHash) return setError(t("errors.unknown"));

    setError(null);
    setBusy(true);
    try {
      const result = await telegram.submitLoginCode(fullPhone, phoneCodeHash, cleanCode);
      if (result.status === "passwordNeeded") {
        setEntryMethod("phone");
        setPasswordHint(result.hint);
        setStep("twoFactor");
      } else {
        await refresh();
      }
    } catch (err) {
      setError(translateTelegramError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim()) return setError(t("validation.required"));

    setError(null);
    setBusy(true);
    try {
      await telegram.submitTwoFactorPassword(password);
      await refresh();
    } catch (err) {
      setError(translateTelegramError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="stack">
      <div className="spread">
        <button
          type="button"
          className="btn btn-ghost"
          aria-label={t("common.back")}
          disabled={busy}
          onClick={() => {
            if (step === "phone" || step === "qr") onCancel?.();
            else if (step === "code") setStep("phone");
            else if (step === "twoFactor") setStep(entryMethod === "qr" ? "qr" : "code");
          }}
          style={{ visibility: (step === "phone" || step === "qr") && !onCancel ? "hidden" : "visible" }}
        >
          <DirectionalIcon name="arrow-back" icon={ArrowLeft} size={16} />
        </button>

        {step === "qr" ? (
          <span className="field-label">{t("auth.qrTitle")}</span>
        ) : (
          <div className="step-dots" aria-hidden="true">
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={`step-dot ${i === currentIndex ? "is-active" : i < currentIndex ? "is-done" : ""}`}
              />
            ))}
          </div>
        )}

        {step === "phone" || step === "qr" ? (
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={step === "phone" ? t("auth.scanQrCode") : t("auth.usePhoneNumber")}
            disabled={busy}
            onClick={() => setStep(step === "phone" ? "qr" : "phone")}
          >
            <DirectionalIcon name={step === "phone" ? "qr-code" : "phone"} icon={step === "phone" ? QrCode : Smartphone} size={18} />
          </button>
        ) : (
          <span style={{ width: 32 }} aria-hidden="true" />
        )}
      </div>

      {step === "qr" && (
        <div className="stack">
          <QrLogin url={qrUrl} expired={qrExpired} />
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setStep("phone")}>
            {t("auth.usePhoneNumber")}
          </button>
        </div>
      )}

      {step === "phone" && (
        <form className="stack" onSubmit={handlePhoneSubmit}>
          <div className="field">
            <span className="field-label">{t("auth.phoneNumber")}</span>
            <div className="phone-row" dir="ltr">
              <CountryPicker value={country} onChange={setCountry} disabled={busy} />
              <div className="input-wrap">
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  aria-label={t("auth.phoneNumber")}
                  placeholder={t("auth.enterPhoneNumber")}
                  value={nationalNumber}
                  onChange={(e) => setNationalNumber(e.target.value)}
                  disabled={busy}
                  autoFocus
                  style={{ paddingInlineStart: "var(--space-3)" }}
                />
              </div>
            </div>
          </div>
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t("common.loading") : t("auth.sendCode")}
          </button>
        </form>
      )}

      {step === "code" && (
        <form className="stack" onSubmit={handleCodeSubmit}>
          <div className="field">
            <span className="field-label">{t("auth.loginCode")}</span>
            <div className="input-wrap">
              <KeyRound size={16} aria-hidden="true" />
              <input
                className="input"
                inputMode="numeric"
                aria-label={t("auth.loginCode")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                dir="ltr"
                disabled={busy}
                autoFocus
              />
            </div>
          </div>
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t("common.loading") : t("auth.verifyCode")}
          </button>
        </form>
      )}

      {step === "twoFactor" && (
        <form className="stack" onSubmit={handlePasswordSubmit}>
          <div className="field">
            <span className="field-label">{t("auth.twoFactorPassword")}</span>
            <div className="input-wrap">
              <Lock size={16} aria-hidden="true" />
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                aria-label={t("auth.twoFactorPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoFocus
                style={{ paddingInlineEnd: "calc(var(--space-3) * 2 + 16px)" }}
              />
              <button
                type="button"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                onClick={() => setShowPassword((s) => !s)}
                style={{
                  position: "absolute",
                  insetInlineEnd: "var(--space-3)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-soft)",
                  display: "flex",
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {passwordHint && <span className="helper-text">{passwordHint}</span>}
          </div>
          {error && (
            <span className="error-text">
              <AlertCircle size={13} /> {error}
            </span>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t("common.loading") : t("common.confirm")}
          </button>
        </form>
      )}
    </div>
  );
}
