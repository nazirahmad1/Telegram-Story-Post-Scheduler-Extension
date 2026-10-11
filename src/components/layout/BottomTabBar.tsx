import { Home, PlusCircle, History, Settings } from "lucide-react";
import { useTranslation, type TranslationKey } from "../../i18n";
import { DirectionalIcon } from "../Icon";

export type Page = "home" | "createStory" | "history" | "settings";

const TABS: { page: Page; key: TranslationKey; icon: typeof Home; iconName: string }[] = [
  { page: "home", key: "navigation.home", icon: Home, iconName: "home" },
  { page: "createStory", key: "navigation.createStory", icon: PlusCircle, iconName: "create" },
  { page: "history", key: "navigation.history", icon: History, iconName: "clock" },
  { page: "settings", key: "navigation.settings", icon: Settings, iconName: "settings" },
];

export function BottomTabBar({ page, onNavigate }: { page: Page; onNavigate: (p: Page) => void }) {
  const { t } = useTranslation();

  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.page}
          type="button"
          className="tab-bar-item"
          onClick={() => onNavigate(tab.page)}
          aria-current={page === tab.page ? "page" : undefined}
        >
          <DirectionalIcon name={tab.iconName} icon={tab.icon} size={20} />
          <span>{t(tab.key)}</span>
        </button>
      ))}
    </nav>
  );
}
