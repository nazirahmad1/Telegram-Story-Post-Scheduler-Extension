# Story Publisher — Chrome Extension

Manifest V3 extension (Vite + React 19 + TypeScript) with full multilingual support built in from day one.

> **Before publishing this anywhere**, read [`SECURITY.md`](./SECURITY.md) —
> permission justifications, what's stored where, and a real architectural
> risk (a publicly shared `api_id`) that no amount of code hardening fixes
> by itself.

## What's new in this pass

- **Multi-language switcher before login** — a compact language picker now lives in the top bar (visible on `ConnectGate` too, not just in the post-login Settings page), so someone whose browser language wasn't detected correctly isn't stuck reading a language they don't understand before they can even connect.
- **Real country/dial-code picker** (`telegram/countries.ts`, `auth/CountryPicker.tsx`) — phone entry now works like Telegram's own apps: pick a country from a searchable list, see its flag (rendered from the ISO code via Unicode regional indicators, not an image asset) and dial code, and the full `+<code><number>` is assembled automatically. Defaults to a guess from the browser locale, falling back to Afghanistan.
- **Password visibility toggle** — the 2FA password field now has an eye icon to show/hide the value.
- **Full back-navigation** — every step (phone → code → 2FA) can go back to the previous one; the phone step can cancel all the way back to the onboarding intro screen.
- **Real story management** — `HistoryPage` lists the account's actual current stories, fetched live from Telegram (`stories.GetPeerStories`) rather than a local log — so it reflects reality (including stories that expired or were posted from another device) instead of only what this extension itself remembers. Deleting calls `stories.DeleteStories` directly.
- **Defensive fix for "correct code still fails"** — Telegram's own apps often display the login code with a separating space (e.g. "1 2 3 4 5"); a copy-pasted code with that space would previously be silently rejected before it ever reached Telegram. Code (and phone number) input is now normalized to digits-only before validation/submission. If a rejection still happens after this, check DevTools Console for the underlying RPC error code — `translateTelegramError` logs it there even though the UI only shows the translated version.
- **Multi-target publishing, Premium expiry, filters, and scheduling** — the story composer can now post the same upload to the personal account and/or any channel/group with story-posting rights at once (`telegram/client.ts#getStoryTargets`/`publishStory`); Premium accounts can pick a story duration other than 24h; `HistoryPage` has media-type and date filters; and a new "Scheduled" tab lets you compose a story now and have it publish automatically later via a background service worker (`background.ts`) + `chrome.alarms` — **read the "Scheduled stories" section in `SECURITY.md`** before relying on this for anything time-sensitive, it documents a real GramJS/service-worker compatibility issue that had to be patched and the inherent limits of what `chrome.alarms` can guarantee.
- **Clear "you need to log in" warnings** — the login screen (`ConnectGate`) now shows how many scheduled stories are stuck waiting for a session before you even tap "Connect", instead of that context only showing up later, buried in the Scheduled tab. Scheduled-story failures now distinguish *why* they failed (`ScheduledStory.failureReason: "session" | "other"` in `scheduling/db.ts`): a dead session gets a distinct "log in again" banner with a one-tap button (that also cancels a pointless retry loop), while other failures still get the normal retry button. `background.ts` checks login state up front — before attempting an upload — and sends a translated (all 8 languages) notification either way, since there's no popup open at that moment to show a toast. `StoryEditor`/`ScheduleComposer` also now surface it (instead of silently swallowing it) if fetching account capabilities or the channel/group list fails for a reason other than "not Premium" or "no channels".
- **Self-service API credentials** — Settings now has an "API connection" section where anyone can swap in their own free api_id/api_hash from my.telegram.org/apps instead of relying on this build's shared default, directly addressing the shared-api_id risk documented in `SECURITY.md`. Also reachable from the login screen itself (before ever logging in), since `credentials-storage.ts`/`config.ts#getEffectiveApiCredentials` resolve custom-over-default independently of auth state. Saving new credentials always forces a fresh login — MTProto sessions are tied to the api_id/api_hash pair they were created under, so there's no safe way to hot-swap credentials on a live session.
- **History now shows channel/group stories too** — previously fixed limitation: the "Published" list only ever fetched `stories.GetPeerStories({peer: "me"})`, so a story posted to a channel via the multi-target composer never showed up in history at all. `getAllMyStories()`/`getAllActiveStories()` in `telegram/client.ts` now fetch per-target (personal account + every channel/group `getStoryTargets()` returns) and merge the results, tagging each `MyStoryItem` with `target`/`targetLabel` so the list can show which account/channel a story belongs to and route delete calls to the right peer. Story ids are only unique *per peer* in Telegram's model — not globally — so selection/delete/viewer state throughout `HistoryPage`/`StoryViewer` now keys off a composite `target:id` string instead of the bare numeric id, otherwise two different channels' story #5 would collide.
- **Fixed: private channels/groups (no public username) silently failed for every multi-target action** — `getStoryTargets()` was storing a private channel's *bare* numeric id as its `StoryTarget`, but GramJS's internal entity cache keys channels by the "marked" peer id (`-100` + id, confirmed by reading `Utils.js#getPeerId`/`getPeer` directly). The mismatch meant every cache lookup for a private channel/group missed, so publishing, listing, or deleting stories on any channel/group without a public @username would fail to resolve the peer. Now uses GramJS's own `utils.getPeerId()` to build the id, guaranteeing it always matches what the library expects internally — channels *with* a public username were never affected (they were already keyed by username, not id). If you already scheduled a story targeting an affected private channel before this fix, that scheduled entry still has the old broken id stored — delete and recreate it.
## Verified with a real headless browser, not just read

The four bugs below were confirmed by actually loading the built `dist/`
as an unpacked extension in a real Chromium instance (via Playwright) and
interacting with it — not just inferred from reading the source — since
this sandbox can reach npm/GitHub but not Telegram's own servers, which
turned out to be exactly the condition that exposed the first one.

- **Fixed: scheduling a story looked like it silently failed — it actually worked, but showed no confirmation** — found using a temporary test harness that bypassed the login gate, since scheduling itself needs no live Telegram connection to verify. `ScheduleComposer`'s success path called `onScheduled()` synchronously right after `setToast(...)`; the parent (`HistoryPage`) swaps away from the composer to the list on the very next render, unmounting the toast before it ever had a chance to paint. The schedule was genuinely being created correctly the whole time — confirmed by checking the list afterward — there was just zero visible confirmation that it happened. `onScheduled()` now fires after a 1.2s delay (same pattern as the immediate-publish → Home navigation fix below), giving the success toast time to actually be seen first.

- **Fixed: the whole app could get stuck on "Loading" forever** — confirmed by loading the real built extension against an unreachable network (this sandbox's own condition, but equally true for anyone on a slow/restricted connection) and watching it never settle, even after 15+ seconds. GramJS's own `connectionRetries` option does not reliably bound how long `client.connect()` stays pending; on a bad network it can hang well past that count ever exhausting. `getClient()` now races the actual connection attempt against an independent 15s timeout (`ConnectionTimeoutError`), and clears its cached promise on timeout so the next attempt starts fresh instead of forever awaiting the same stuck one; the initial "am I logged in" check on app load additionally gives up after 8s so the UI always reaches something interactive.
- **Fixed: the country-code dropdown (and any similar popover) rendered fully open and clickable, but off-screen** — confirmed by testing at the popup's actual dimensions (a full-size browser viewport had hidden this completely): the menu's bottom edge landed ~137px past the visible window in a realistic 380×600 popup. A fixed-size popup window can't grow to fit it, and nothing was scrolling it into view. `CountryPicker`/`LanguageSwitcherCompact` now call `scrollIntoView({block: "nearest"})` when they open, and the country menu's `max-height` dropped from 280px to 220px to need less room in the first place. Re-tested end-to-end at 380×600 after the fix: search → select → the trigger updates correctly, fully within view.
- **Fixed: popup rendered extremely narrow after building as a real extension** — `body` used `width: 100%`, which works fine in a normal browser tab (the viewport already has a size to be 100% of) but gives Chrome no concrete anchor to size an extension *popup* window against, since a popup's own window size is partly derived from its content. `body` now has an explicit `min-width: 360px`; the side panel (already normally wider than that) is unaffected.
- **Fixed: country code / any dropdown menu appeared to do nothing when clicked** — `.app-shell` had `overflow: hidden` with no `border-radius` to justify it, which silently clipped every absolutely-positioned popover that extends beyond the shell's box — the country picker and the language switcher menu both use exactly that pattern. The click handler and state were always working correctly; the dropdown was rendering, just invisible. Removed `overflow: hidden` from `.app-shell` — `.app-content`'s own `overflow-y: auto` already owns the actual scrollable region, nothing relied on the shell itself clipping content.
- **Fixed: login not working after a real build, with no indication why** — the most likely cause of this specific symptom is `.env.local` not being set up with real `VITE_TELEGRAM_API_ID`/`VITE_TELEGRAM_API_HASH` before building (`.env.example` intentionally ships with placeholders, not working values — see the earlier `.env.example` security fix). This previously surfaced as a generic "Something went wrong" with no way to tell it apart from an actual network/account problem, because (a) `MissingApiCredentialsError` fell through to the generic fallback in `errors.ts` instead of getting its own message, and (b) `useConnectionStatus.tsx`'s initial `isAuthorized()` check on every app load caught and discarded this error completely silently — invisible even in the console. `ConnectGate` now proactively checks for this on mount (no default *and* no custom credentials saved) and opens the "API connection" section automatically with a clear explanation, instead of letting someone fill out the phone form first and only find out afterward.

## Setup

```bash
npm install
npm run dev        # local dev server
npm run build       # production build -> dist/
npm run i18n:check  # validates all 8 locale files
npm test            # runtime smoke test (catches wiring bugs tsc/build can't see)
```

To load the built extension in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the `dist/` folder.

## i18n architecture

```
src/i18n/
├── config.ts     # SUPPORTED_LANGUAGES, RTL_LANGUAGES, default/fallback — single source of truth
├── detector.ts    # navigator.language(s) -> supported code (fa-AF -> fa, en-GB -> en)
├── storage.ts     # chrome.storage.local persistence, scoped to language ONLY
├── init.ts        # i18next instance + all 8 locale resources
├── I18nProvider.tsx  # owns document.lang/dir, persistence, and the useTranslation()/useI18n() hooks
├── types.ts       # TranslationKey — dot-path type derived from en.json; typo'd keys fail `tsc`
├── format.ts      # Intl.DateTimeFormat / Intl.NumberFormat wrappers
└── locales/
    ├── en.json  (canonical schema — every other file must match its keys)
    ├── fa.json, ar.json, tr.json, ru.json, es.json, fr.json, it.json
```

**Everything routes through `useTranslation()` and `useI18n()`** — no component reads `document.dir`, touches `chrome.storage.local`, or hardcodes a language list on its own.

### Type safety

```ts
t("story.publish")   // ✅ compiles
t("story.publsih")   // ❌ TS2345 — not assignable to TranslationKey
```

### Pluralization

Real CLDR plural categories via `i18next` + `Intl.PluralRules` — not hand-rolled if/else. Arabic gets all six forms (`zero/one/two/few/many/other`); Russian gets `one/few/many/other`; Spanish/French/Italian get `one/many/other` (that rare `many` form is for exact multiples of a million per CLDR).

```ts
t("errors.floodWait", { count: 42 })
```

### RTL

`fa` and `ar` render `dir="rtl"`; the rest `dir="ltr"` — set once, centrally, in `I18nProvider`. All layout in `src/styles/globals.css` uses **logical CSS properties** (`margin-inline-start`, `padding-inline-end`, `inset-inline-end`, `border-start-start-radius`, …), never `left`/`right`/`margin-left`.

### Icons

`src/utils/icon-mirror.ts` — directional icons (arrows, chevrons, pagination) mirror in RTL; object icons (camera, gear, trash, logo) never do. Centralized allow-list, not per-component judgment calls.

### Fonts

Bundled locally via `@fontsource/inter`, `@fontsource/vazirmatn`, `@fontsource/noto-sans-arabic` — zero external CDN requests, so nothing breaks under a strict extension CSP and no font request ever leaves the extension.

### `npm run i18n:check`

Validates, across all 8 locale files: missing keys, extra keys, type/nesting mismatches, `{{placeholder}}` consistency, and — per-language — that every plural family has the CLDR categories *that specific language* requires (so Arabic's dual/singular forms aren't flagged just because English only has `one`/`other`).

## Design

Redesigned around one signature idea: the **story ring** — a gradient border (indigo → coral) that echoes the actual visual language of "Stories" apps (the ring around a profile photo signaling a live story). It appears on the connection indicator in the top bar and the onboarding icon. Everything else stays quiet and disciplined around it: flat cards, one hairline border color, restrained motion (a single pulse animation, respecting `prefers-reduced-motion`).

- **Palette**: `--ink #14171F`, `--canvas #F6F7FB`, `--signal #3652E0` (brand indigo), `--pulse #FF5D73` (reserved for live/CTA moments only), `--success #1FAE6B`, `--danger #E14B4B`
- **Type**: Sora (display/headings, used sparingly) + Inter (body/UI) for Latin scripts; Vazirmatn (Persian) and Noto Sans Arabic (Arabic) take over automatically per-glyph and via `[dir="rtl"]`/`[lang="ar"]` overrides
- Real icons throughout via `lucide-react`, routed through `DirectionalIcon` so RTL mirroring stays centralized (see `utils/icon-mirror.ts`)
- Visible focus rings everywhere (`:focus-visible`), no motion unless `prefers-reduced-motion: no-preference`

## UX structure (researched, not guessed)

Searched current onboarding/popup-UI guidance before this pass and found a consistent, evidence-backed pattern: **"one screen, one message, one action"** on first open, plus Hick's Law (more visible choices = slower, less confident decisions). The previous version violated this — you could browse Home/Create/History while disconnected and see broken/zero states, which reads as confusing, not simple.

Fixed by restructuring the whole app around connection state:

- **`ConnectGate`** — while disconnected, this is the *entire* UI. One icon, one sentence, one button ("Connect Telegram"). The phone/code/2FA form only appears after that button is tapped (progressive disclosure), instead of a form sitting in front of someone who hasn't decided to act yet.
- Once connected, `ConnectGate` unmounts and the normal **4-tab** app appears — Home / Create / History / Settings, not 5: the old "Account" tab was redundant with the connect flow, so account status + Logout now live inside Settings, one less thing competing for attention in the tab bar.
- `useConnectionStatus()` is the single source of truth driving this branch — `App.tsx` just switches on `checking` / `connected`.

## Responsive

- `.app-shell` no longer has a fixed height/width — it fills its container (`height: 100%`, fluid `width` with `min/max`), so it adapts instead of clipping.
- Added real **Side Panel** support (`side_panel` in `manifest.json`, `sidePanel` permission) alongside the existing popup. Chrome's side panel is user-resizable, so this is genuine responsive behavior, not a media query inside a box that's fixed-size anyway. Right-click the extension icon → "Open side panel" to try it; the popup still opens as before on a normal click.

### Functionality fixes made during this pass

- **History was previously fake** — it rendered two hardcoded demo entries regardless of what you'd actually published. `telegram/history-storage.ts` is a dedicated `chrome.storage.local` key that `StoryEditor` writes to on every successful publish; `HistoryPage` now reads real data and shows a proper empty state with a "create your first story" call-to-action that navigates to the editor.
- **Connection status was checked in multiple places** — consolidated into `telegram/useConnectionStatus.tsx`, a single provider the top bar, home dashboard, gate, and settings all read from, so they can never disagree.
- **Home was a static Intl-formatting demo** — now a real dashboard: live connection status pill and an actual count of published stories, both backed by the stores above.
- Story upload supports **drag-and-drop**, not just click-to-browse, with file-type validation surfaced through the same translated error path as everything else.

## Pages

- **Home** (`layout/HomePage.tsx`) — connection status + real published-story count + primary CTA
- **Create Story** (`story/StoryEditor.tsx`) — drag-and-drop upload, caption with length validation, chip-style privacy picker, publish with a Telegram-error → translation-key map (`STORIES_TOO_MUCH` → `errors.storiesTooMuch`, flood-wait pluralized), writes to real history on success
- **History** (`history/HistoryPage.tsx`) — real persisted entries, empty state with CTA
- **Settings** (`SettingsPage.tsx` + `LanguageSelector.tsx`) — account/logout + native-name-only language list, no flags, instant switch with no reload
- **Connect** (`auth/ConnectGate.tsx` + `auth/AuthFlow.tsx`) — the single-action onboarding gate; phone → code → optional 2FA once started, all validation messages translated, phone/code inputs forced `dir="ltr"` even inside an RTL form



`src/telegram/`:

```
config.ts          # api_id/api_hash from .env.local (see .env.example) — never hardcoded
session-storage.ts  # chrome.storage.local, DEDICATED key, separate from language preference
client.ts           # TelegramClient wrapper: login flow + publishStory()
errors.ts           # RPC error code -> translation key (STORIES_TOO_MUCH -> errors.storiesTooMuch, etc.)
```

Setup:

```bash
cp .env.example .env.local
# fill in VITE_TELEGRAM_API_ID / VITE_TELEGRAM_API_HASH from https://my.telegram.org/apps
```

**Not yet live-tested.** This sandbox's network egress only reaches package registries (npm/GitHub/PyPI), not Telegram's servers, so the phone → code → 2FA → publish flow was built against GramJS's documented/typed API and compiles clean, but hasn't been exercised against a real account. Test it yourself before shipping — particularly `submitTwoFactorPassword`, where GramJS's retry-callback design was adapted for a single-attempt-per-submit UI.

A real CSP issue was caught and fixed during this build: `vite-plugin-node-polyfills` polyfills Node's `vm` module by default, and that polyfill uses `eval()` — which Manifest V3's CSP forbids. GramJS never actually needs `vm`, so it's excluded (`exclude: ["vm"]` in `vite.config.ts`). Verified zero `eval()` calls in the production bundle.

`manifest.json` requests `host_permissions` for `*://*.telegram.org/*` and `*://*.web.telegram.org/*` so the extension can reach Telegram's DCs — verify this is sufficient once you test against live servers; MTProto's actual WebSocket endpoints may need adjusting here.



- [x] All 8 languages render (`npm run i18n:check` passes)
- [x] RTL (`fa`, `ar`) / LTR (rest) switching, no reload
- [x] Language persists across restart (`chrome.storage.local`, isolated key)
- [x] Browser-language detection with region stripping
- [x] Type-safe translation keys (compile-time failure on typo)
- [x] Missing-translation fallback to English (i18next `fallbackLng`)
- [x] Placeholder + plural-form validation
- [x] `Intl.DateTimeFormat` / `Intl.NumberFormat` (no manual formatting)
- [x] ARIA labels translated throughout
- [x] Error messages mapped from Telegram codes to translation keys
- [x] Toasts, forms, validation all translation-aware
- [x] Story Editor / Settings / Auth / History all fully localized

## A real bug that shipped, and how it was caught

`react-i18next`'s `useTranslation()` was never wired to the manually-initialized `i18next` instance — missing `.use(initReactI18next)` in `src/i18n/init.ts`. The result: every `t(key)` call silently returned the **raw key string** instead of the translated text. `npx tsc -b` and `npm run build` both stayed green throughout, because it's a runtime wiring bug, not a type error — nothing in a type-only check can catch "this hook doesn't know which i18next instance to read from."

It surfaced as the literal text `errors.unknown` appearing on screen instead of "Something went wrong." — caught by testing the phone-login flow with a real number.

Fixed by adding `.use(initReactI18next)` before `.init()`. A regression test now lives at `src/i18n/__tests__/i18n-runtime.test.tsx` — it actually mounts `I18nProvider` and asserts a known key resolves to real text, not itself. Run `npm test`; it's the kind of check `tsc`/`build` can't do, because it requires actually executing the code, not just compiling it.

**If a raw key like `something.likeThis` ever shows up anywhere in the UI again, that's this exact class of bug — check `npm test` first.**

## Next steps (not yet built)

- **Live-test the Telegram flow** against a real account — phone/code/2FA and story publishing are wired to real GramJS calls but unverified end-to-end (see above)
- Persisted history from actual published stories (currently demo data)
- `@base-ui/react`-based Dialog/Select primitives if you want to match your Karayehban component conventions
- Extension icons (`icon-16/48/128.png`) — manifest currently omits `icons` since none exist yet
- Code-splitting: the production bundle is ~1.8MB (GramJS's crypto payload is the bulk of it) — fine for a popup today, but consider `import()`-based splitting if it grows further
"# Telegram-Story-Post-Scheduler-Extension" 
