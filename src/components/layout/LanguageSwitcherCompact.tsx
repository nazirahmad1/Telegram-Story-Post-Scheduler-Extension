import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useI18n, useTranslation } from "../../i18n";

/**
 * Deliberately lives in TopBar (rendered regardless of connection state),
 * not inside the gated Settings page — someone whose browser language
 * wasn't detected correctly needs a way to fix that BEFORE they can even
 * read the "Connect Telegram" screen, the same way Telegram's own apps
 * always keep a language switcher reachable from the very first screen.
 */
export function LanguageSwitcherCompact() {
  const { language, setLanguage, languages } = useI18n();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // See the same effect in CountryPicker — cheap insurance even though
  // this menu (near the top of the page) is much less likely to need it.
  useEffect(() => {
    if (open) menuRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const current = languages.find((l) => l.code === language);

  return (
    <div className="lang-switch" ref={containerRef}>
      <button
        type="button"
        className="lang-switch-trigger"
        aria-label={t("settings.language")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current?.code.toUpperCase()}
      </button>

      {open && (
        <div ref={menuRef} className="lang-switch-menu card" role="listbox" aria-label={t("settings.language")}>
          {languages.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className="spread"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: isSelected ? "var(--signal-soft)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "start",
                  color: isSelected ? "var(--signal)" : "var(--ink)",
                  fontWeight: isSelected ? 600 : 400,
                  fontSize: 13,
                }}
                onClick={async () => {
                  setOpen(false);
                  if (!isSelected) await setLanguage(lang.code);
                }}
              >
                <span lang={lang.code} dir={lang.dir}>
                  {lang.nativeName}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
