import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGE_CODES } from "./config";

import en from "./locales/en.json";
import fa from "./locales/fa.json";
import ar from "./locales/ar.json";
import tr from "./locales/tr.json";
import ru from "./locales/ru.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";

const resources = {
  en: { translation: en },
  fa: { translation: fa },
  ar: { translation: ar },
  tr: { translation: tr },
  ru: { translation: ru },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
};

let initialized = false;

/**
 * Initializes the shared i18next instance exactly once. `initialLanguage`
 * should already be resolved (persisted choice -> browser -> English) by
 * the caller — this module doesn't do detection itself, so it stays a pure
 * "given a language, configure i18next" concern.
 */
export async function initI18n(initialLanguage: string) {
  if (initialized) {
    await i18next.changeLanguage(initialLanguage);
    return i18next;
  }
  initialized = true;

  await i18next
    // THE FIX: without this, react-i18next's useTranslation() has no idea
    // which i18next instance to read from, and t(key) silently returns the
    // raw key string instead of the resolved translation — which is exactly
    // the "errors.unknown" showing up verbatim on screen.
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
      ns: ["translation"],
      defaultNS: "translation",
      interpolation: {
        // React already escapes output, and we never inject raw HTML this way.
        escapeValue: false,
      },
      returnNull: false,
      // If a key is entirely missing from a locale, fall back to English
      // instead of rendering "undefined" or the raw key.
      returnEmptyString: false,
    });

  return i18next;
}

export { i18next };
