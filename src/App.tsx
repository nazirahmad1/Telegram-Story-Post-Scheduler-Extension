import { useState } from "react";
import { TopBar } from "./components/layout/TopBar";
import { BottomTabBar, type Page } from "./components/layout/BottomTabBar";
import { HomePage } from "./components/layout/HomePage";
import { StoryEditor } from "./components/story/StoryEditor";
import { HistoryPage } from "./components/history/HistoryPage";
import { ConnectGate } from "./components/auth/ConnectGate";
import { SettingsPage } from "./components/SettingsPage";
import { useTranslation } from "./i18n";
import { ReconnectScreen } from "./components/auth/ReconnectScreen";
import { useConnectionStatus } from "./telegram/useConnectionStatus";

function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="app-content" style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
      <span className="helper-text">{t("common.loading")}</span>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const { connected, checking, offline } = useConnectionStatus();

  return (
    <div className="app-shell">
      <TopBar />

      {checking ? (
        <LoadingScreen />
      ) : offline ? (
        <ReconnectScreen />
      ) : !connected ? (
        <ConnectGate />
      ) : (
        <>
          <main className="app-content">
            {page === "home" && <HomePage onNavigate={setPage} />}
            {page === "createStory" && <StoryEditor onNavigate={setPage} />}
            {page === "history" && <HistoryPage onNavigate={setPage} />}
            {page === "settings" && <SettingsPage />}
          </main>
          <BottomTabBar page={page} onNavigate={setPage} />
        </>
      )}
    </div>
  );
}
