import { Sun, Moon } from "lucide-react";
import { useTranslation } from "../../i18n";
import { useTheme } from "../../theme";

/**
 * Lives in TopBar next to the language switcher — always reachable,
 * regardless of connection state, same reasoning as
 * LanguageSwitcherCompact: a display preference shouldn't be gated behind
 * being logged in.
 */
export function ThemeToggleCompact() {
  const { t } = useTranslation();
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      className="lang-switch-trigger"
      aria-label={isDark ? t("settings.switchToLight") : t("settings.switchToDark")}
      title={isDark ? t("settings.switchToLight") : t("settings.switchToDark")}
      onClick={() => toggleTheme()}
    >
      {isDark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
    </button>
  );
}
