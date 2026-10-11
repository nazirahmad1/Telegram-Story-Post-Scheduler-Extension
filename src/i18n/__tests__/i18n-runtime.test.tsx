import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nProvider, useTranslation } from "../I18nProvider";

/**
 * This test exists because of a real bug: react-i18next's useTranslation()
 * was never wired to our manually-initialized i18next instance (missing
 * `.use(initReactI18next)`), so every t(key) call silently returned the
 * raw key string — e.g. rendering the literal text "errors.unknown"
 * instead of "Something went wrong." `tsc` and `vite build` both stayed
 * green through that whole time, because the bug was a runtime wiring
 * problem, not a type error. This test actually mounts the provider and
 * asserts real, translated text comes out — not the key.
 */

function Probe() {
  const { t } = useTranslation();
  return <span data-testid="probe">{t("errors.unknown")}</span>;
}

describe("i18n runtime wiring", () => {
  it("resolves a translation key to real text, not the raw key", async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("Something went wrong.");
    });

    // The specific regression: the key itself must never leak to the screen.
    expect(screen.getByTestId("probe").textContent).not.toBe("errors.unknown");
  });
});
