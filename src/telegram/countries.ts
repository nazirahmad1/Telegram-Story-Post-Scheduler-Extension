export interface Country {
  iso: string; // ISO 3166-1 alpha-2
  name: string;
  dialCode: string; // without "+"
}

/**
 * A country's flag emoji is just its ISO code re-encoded as two Unicode
 * "regional indicator" characters — no image asset, no icon font, and it
 * renders in full color via the OS's native emoji font on every platform
 * Chrome runs on. This is how Telegram's own clients do it too.
 */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(
    ...iso
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0)),
  );
}

/**
 * A curated list — not all ~240 ISO territories, but every country with
 * meaningful Telegram usage plus every neighbor of Afghanistan, since
 * that's this product's primary market. Sorted roughly by relevance, then
 * alphabetically; the picker itself supports search so completeness matters
 * more than order.
 */
export const COUNTRIES: Country[] = [
  { iso: "AF", name: "Afghanistan", dialCode: "93" },
  { iso: "IR", name: "Iran", dialCode: "98" },
  { iso: "PK", name: "Pakistan", dialCode: "92" },
  { iso: "TJ", name: "Tajikistan", dialCode: "992" },
  { iso: "TM", name: "Turkmenistan", dialCode: "993" },
  { iso: "UZ", name: "Uzbekistan", dialCode: "998" },
  { iso: "CN", name: "China", dialCode: "86" },
  { iso: "IN", name: "India", dialCode: "91" },
  { iso: "TR", name: "Turkey", dialCode: "90" },
  { iso: "AE", name: "United Arab Emirates", dialCode: "971" },
  { iso: "SA", name: "Saudi Arabia", dialCode: "966" },
  { iso: "QA", name: "Qatar", dialCode: "974" },
  { iso: "KW", name: "Kuwait", dialCode: "965" },
  { iso: "IQ", name: "Iraq", dialCode: "964" },
  { iso: "SY", name: "Syria", dialCode: "963" },
  { iso: "JO", name: "Jordan", dialCode: "962" },
  { iso: "LB", name: "Lebanon", dialCode: "961" },
  { iso: "EG", name: "Egypt", dialCode: "20" },
  { iso: "IL", name: "Israel", dialCode: "972" },
  { iso: "OM", name: "Oman", dialCode: "968" },
  { iso: "BH", name: "Bahrain", dialCode: "973" },
  { iso: "YE", name: "Yemen", dialCode: "967" },
  { iso: "KZ", name: "Kazakhstan", dialCode: "7" },
  { iso: "KG", name: "Kyrgyzstan", dialCode: "996" },
  { iso: "AZ", name: "Azerbaijan", dialCode: "994" },
  { iso: "AM", name: "Armenia", dialCode: "374" },
  { iso: "GE", name: "Georgia", dialCode: "995" },
  { iso: "RU", name: "Russia", dialCode: "7" },
  { iso: "UA", name: "Ukraine", dialCode: "380" },
  { iso: "BY", name: "Belarus", dialCode: "375" },
  { iso: "GB", name: "United Kingdom", dialCode: "44" },
  { iso: "DE", name: "Germany", dialCode: "49" },
  { iso: "FR", name: "France", dialCode: "33" },
  { iso: "IT", name: "Italy", dialCode: "39" },
  { iso: "ES", name: "Spain", dialCode: "34" },
  { iso: "PT", name: "Portugal", dialCode: "351" },
  { iso: "NL", name: "Netherlands", dialCode: "31" },
  { iso: "BE", name: "Belgium", dialCode: "32" },
  { iso: "CH", name: "Switzerland", dialCode: "41" },
  { iso: "AT", name: "Austria", dialCode: "43" },
  { iso: "SE", name: "Sweden", dialCode: "46" },
  { iso: "NO", name: "Norway", dialCode: "47" },
  { iso: "DK", name: "Denmark", dialCode: "45" },
  { iso: "FI", name: "Finland", dialCode: "358" },
  { iso: "PL", name: "Poland", dialCode: "48" },
  { iso: "GR", name: "Greece", dialCode: "30" },
  { iso: "CZ", name: "Czechia", dialCode: "420" },
  { iso: "RO", name: "Romania", dialCode: "40" },
  { iso: "HU", name: "Hungary", dialCode: "36" },
  { iso: "US", name: "United States", dialCode: "1" },
  { iso: "CA", name: "Canada", dialCode: "1" },
  { iso: "MX", name: "Mexico", dialCode: "52" },
  { iso: "BR", name: "Brazil", dialCode: "55" },
  { iso: "AR", name: "Argentina", dialCode: "54" },
  { iso: "AU", name: "Australia", dialCode: "61" },
  { iso: "NZ", name: "New Zealand", dialCode: "64" },
  { iso: "JP", name: "Japan", dialCode: "81" },
  { iso: "KR", name: "South Korea", dialCode: "82" },
  { iso: "ID", name: "Indonesia", dialCode: "62" },
  { iso: "MY", name: "Malaysia", dialCode: "60" },
  { iso: "SG", name: "Singapore", dialCode: "65" },
  { iso: "TH", name: "Thailand", dialCode: "66" },
  { iso: "BD", name: "Bangladesh", dialCode: "880" },
  { iso: "NP", name: "Nepal", dialCode: "977" },
  { iso: "LK", name: "Sri Lanka", dialCode: "94" },
  { iso: "ZA", name: "South Africa", dialCode: "27" },
  { iso: "NG", name: "Nigeria", dialCode: "234" },
];

export function findCountryByIso(iso: string): Country | undefined {
  return COUNTRIES.find((c) => c.iso === iso);
}

/**
 * Best-effort guess at the person's country from their browser locale
 * region subtag (e.g. "fa-AF" -> "AF", "en-US" -> "US"). Falls back to
 * Afghanistan, this product's primary market, rather than an arbitrary
 * default.
 */
export function guessDefaultCountry(): Country {
  const DEFAULT_ISO = "AF";
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region) {
      const match = findCountryByIso(region);
      if (match) return match;
    }
  } catch {
    // Intl.Locale not supported or navigator.language unparsable — fall through.
  }
  return findCountryByIso(DEFAULT_ISO)!;
}
