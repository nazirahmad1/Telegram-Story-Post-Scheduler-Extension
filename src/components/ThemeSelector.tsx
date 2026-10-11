import { Check, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { useTranslation } from "../i18n";
import { useTheme } from "../theme";
import type { ThemeMode } from "../theme";

interface ThemeSelectorProps {
  onThemeChanged?: (mode: ThemeMode) => void;
}

const OPTIONS: { mode: ThemeMode; icon: typeof Sun }[] = [
  { mode: "light", icon: Sun },
  { mode: "dark", icon: Moon },
  { mode: "system", icon: MonitorSmartphone },
];

/** Settings > Appearance. The TopBar toggle only flips light<->dark; "system" (follow the OS) is only available here. */
export function ThemeSelector({ onThemeChanged }: ThemeSelectorProps) {
  const { mode, setThemeMode } = useTheme();
  const { t } = useTranslation();

  const labels: Record<ThemeMode, string> = {
    light: t("settings.themeLight"),
    dark: t("settings.themeDark"),
    system: t("settings.themeSystem"),
  };

  return (
    <div className="stack" role="listbox" aria-label={t("settings.appearance")} style={{ gap: 2 }}>
      {OPTIONS.map(({ mode: optionMode, icon: Icon }) => {
        const isSelected = mode === optionMode;
        return (
          <button
            key={optionMode}
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
              await setThemeMode(optionMode);
              onThemeChanged?.(optionMode);
            }}
          >
            <span className="row" style={{ gap: 8 }}>
              <Icon size={16} aria-hidden="true" />
              {labels[optionMode]}
            </span>
            {isSelected && <Check size={16} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
