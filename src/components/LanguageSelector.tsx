import { Check } from "lucide-react";
import { useI18n, useTranslation } from "../i18n";

interface LanguageSelectorProps {
  onLanguageChanged?: (languageNativeName: string) => void;
}

/**
 * Settings > Language. Shows every supported language by its OWN native
 * name (never the English name, never a flag). Selecting a language updates
 * i18next, <html lang/dir>, and chrome.storage.local — all without a reload.
 */
export function LanguageSelector({ onLanguageChanged }: LanguageSelectorProps) {
  const { language, setLanguage, languages } = useI18n();
  const { t } = useTranslation();

  return (
    <div className="stack" role="listbox" aria-label={t("settings.language")} style={{ gap: 2 }}>
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
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              background: isSelected ? "var(--signal-soft)" : "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "start",
              color: isSelected ? "var(--signal)" : "var(--ink)",
              fontWeight: isSelected ? 600 : 400,
            }}
            onClick={async () => {
              if (isSelected) return;
              await setLanguage(lang.code);
              onLanguageChanged?.(lang.nativeName);
            }}
          >
            <span lang={lang.code} dir={lang.dir}>
              {lang.nativeName}
            </span>
            {isSelected && <Check size={16} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
