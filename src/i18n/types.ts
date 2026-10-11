import type en from "./locales/en.json";

/**
 * The canonical translation schema. Every other locale file is expected
 * (and validated by `npm run i18n:check`) to expose exactly this shape.
 */
export type TranslationSchema = typeof en;

/**
 * Recursively builds a union of dot-separated key paths from the schema,
 * e.g. "story.publish" | "errors.floodWait" | "common.save" | ...
 *
 * This is what makes `t("story.publsih")` a compile-time TypeScript error:
 * TranslationKey only contains paths that actually exist in en.json.
 */
type PluralSuffix = "_zero" | "_one" | "_two" | "_few" | "_many" | "_other";

/** "errors.floodWait_one" -> "errors.floodWait" so call sites use the base key. */
type StripPluralSuffix<K extends string> = K extends `${infer Base}${PluralSuffix}`
  ? Base
  : K;

type DotPath<T, Prefix extends string = ""> = T extends string
  ? Prefix extends `${infer P}.`
    ? P
    : never
  : {
      [K in keyof T & string]: DotPath<T[K], `${Prefix}${StripPluralSuffix<K>}.`>;
    }[keyof T & string];

export type TranslationKey = DotPath<TranslationSchema>;

/**
 * i18next appends plural suffixes (_one, _other, _few, ...) at runtime based
 * on Intl.PluralRules — those suffixed keys intentionally aren't part of
 * TranslationKey. Call sites use the unsuffixed base key, e.g.
 * t("errors.floodWait", { count: 42 }), and i18next resolves the right form.
 */
