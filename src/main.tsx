import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { ConnectionStatusProvider } from "./telegram/useConnectionStatus";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ConnectionStatusProvider>
          <App />
        </ConnectionStatusProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);
