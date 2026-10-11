#!/usr/bin/env node
/**
 * npm run i18n:check
 *
 * Validates that every locale file in src/i18n/locales/ matches the
 * canonical shape of en.json:
 *   - no missing keys
 *   - no extra keys
 *   - no invalid nesting (a leaf in one locale, an object in another)
 *   - no placeholder mismatches (e.g. en has {{count}}, fa is missing it)
 *   - plural families (e.g. errors.floodWait_one/_other) have every plural
 *     category that language's own CLDR rules require (via Intl.PluralRules)
 *     — so Arabic is checked against zero/one/two/few/many/other, not
 *     against English's one/other.
 *
 * Exits non-zero if anything fails, so it can run in CI.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const CANONICAL = "en";

// Mirrors src/i18n/format.ts's INTL_LOCALE_MAP — kept in sync manually since
// this script runs standalone via ts-agnostic node, not through the bundler.
const INTL_LOCALE_MAP = {
  en: "en-US",
  fa: "fa-AF",
  ar: "ar-SA",
  tr: "tr-TR",
  ru: "ru-RU",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
};

const PLURAL_SUFFIXES = ["zero", "one", "two", "few", "many", "other"];

function loadLocale(code) {
  const file = path.join(LOCALES_DIR, `${code}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function listLocaleCodes() {
  return readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Flattens a nested object into { "a.b.c": { value, path } } leaf entries. */
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, fullKey, out);
    } else {
      out[fullKey] = value;
    }
  }
  return out;
}

function pluralSuffixOf(key) {
  for (const s of PLURAL_SUFFIXES) {
    if (key.endsWith(`_${s}`)) return s;
  }
  return null;
}

function basePath(key) {
  const suffix = pluralSuffixOf(key);
  return suffix ? key.slice(0, -(suffix.length + 1)) : key;
}

function extractPlaceholders(value) {
  if (typeof value !== "string") return new Set();
  const matches = value.match(/\{\{\s*[\w]+\s*\}\}/g) ?? [];
  return new Set(matches.map((m) => m.replace(/[{}\s]/g, "")));
}

function requiredPluralCategories(localeTag) {
  try {
    return new Intl.PluralRules(localeTag).resolvedOptions().pluralCategories;
  } catch {
    return ["one", "other"];
  }
}

function run() {
  const codes = listLocaleCodes();
  if (!codes.includes(CANONICAL)) {
    console.error(`✗ Canonical locale "${CANONICAL}.json" not found.`);
    process.exit(1);
  }

  const canonicalFlat = flatten(loadLocale(CANONICAL));
  const canonicalKeys = Object.keys(canonicalFlat);

  // Plural families as declared by the canonical (English) file.
  const pluralFamilies = new Set(
    canonicalKeys.filter((k) => pluralSuffixOf(k)).map(basePath),
  );
  const regularCanonicalKeys = canonicalKeys.filter((k) => !pluralSuffixOf(k));

  let hasFailure = false;
  const summaryLines = [];

  for (const code of codes) {
    const localeTag = INTL_LOCALE_MAP[code] ?? code;
    const flat = flatten(loadLocale(code));
    const localeKeys = Object.keys(flat);
    const errors = [];

    if (code !== CANONICAL) {
      // Missing / extra among REGULAR (non-plural) keys.
      const localeRegularKeys = new Set(localeKeys.filter((k) => !pluralSuffixOf(k)));
      for (const key of regularCanonicalKeys) {
        if (!localeRegularKeys.has(key)) errors.push(`missing key: ${key}`);
      }
      for (const key of localeRegularKeys) {
        if (!regularCanonicalKeys.includes(key) && !pluralFamilies.has(basePath(key))) {
          errors.push(`extra key: ${key}`);
        }
      }

      // Invalid nesting: a key that's an object in one file, a string in another.
      for (const key of regularCanonicalKeys) {
        const enVal = canonicalFlat[key];
        const localeVal = flat[key];
        if (localeVal !== undefined && typeof enVal !== typeof localeVal) {
          errors.push(`type mismatch at "${key}": expected ${typeof enVal}, got ${typeof localeVal}`);
        }
      }

      // Placeholder consistency for regular keys.
      for (const key of regularCanonicalKeys) {
        const localeVal = flat[key];
        if (localeVal === undefined) continue;
        const expected = extractPlaceholders(canonicalFlat[key]);
        const actual = extractPlaceholders(localeVal);
        const missingPh = [...expected].filter((p) => !actual.has(p));
        const extraPh = [...actual].filter((p) => !expected.has(p));
        if (missingPh.length) errors.push(`"${key}" missing placeholder(s): ${missingPh.join(", ")}`);
        if (extraPh.length) errors.push(`"${key}" has unexpected placeholder(s): ${extraPh.join(", ")}`);
      }
    }

    // Plural completeness — every family needs all categories THIS language requires.
    const required = requiredPluralCategories(localeTag);
    for (const family of pluralFamilies) {
      for (const category of required) {
        const key = `${family}_${category}`;
        if (flat[key] === undefined) {
          errors.push(`plural family "${family}" missing required "${category}" form (${key}) for ${localeTag}`);
        }
      }
      // Placeholder check: only the "_other" form is required to carry every
      // placeholder the canonical "_other" has. Named forms like zero/one/two
      // are allowed to omit {{count}} where the language naturally implies
      // the number grammatically (e.g. Arabic's dual/singular forms) — that's
      // correct translation, not a bug.
      const canonicalOther = canonicalFlat[`${family}_other`];
      if (canonicalOther !== undefined && flat[`${family}_other`] !== undefined) {
        const expected = extractPlaceholders(canonicalOther);
        const actual = extractPlaceholders(flat[`${family}_other`]);
        const missingPh = [...expected].filter((p) => !actual.has(p));
        if (missingPh.length) {
          errors.push(`"${family}_other" missing placeholder(s): ${missingPh.join(", ")}`);
        }
      }
    }

    if (errors.length) {
      hasFailure = true;
      summaryLines.push(`✗ ${code}`);
      for (const e of errors) summaryLines.push(`    - ${e}`);
    } else {
      summaryLines.push(`✓ ${code}`);
    }
  }

  console.log(summaryLines.join("\n"));
  console.log("");
  if (hasFailure) {
    console.log("i18n:check failed — see errors above.");
    process.exit(1);
  }

  console.log("No missing translations.");
  console.log("No extra keys.");
  console.log("No placeholder mismatches.");
  console.log("No plural-form gaps.");
}

run();
