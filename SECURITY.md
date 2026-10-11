# Security & privacy

This document exists for two audiences: reviewers (Chrome Web Store / any
extension store asks for exactly this kind of disclosure) and anyone
auditing the code before trusting it with a real Telegram account.

## What this extension stores, and where

| Data | Where | Why | Ever leaves the device? |
|---|---|---|---|
| Telegram session string (GramJS `StringSession`) | `chrome.storage.local` | Stay logged in between popup opens | No — never sent anywhere except directly to Telegram's own servers over the MTProto connection GramJS opens |
| Theme choice, language choice | `chrome.storage.local` | Remember UI preferences | No |
| Custom api_id/api_hash, if set (see "Self-service API credentials" below) | `chrome.storage.local` | Use your own Telegram API app instead of this build's shared default | No |
| Scheduled stories — media file, caption, targets, publish time | **IndexedDB** (not `chrome.storage`) | Needs to survive until the scheduled time, and hold the actual photo/video bytes, which `chrome.storage`'s size quota isn't meant for | No — only leaves the device at the actual scheduled publish moment, straight to Telegram |

`chrome.storage.local` is **not** synced to a Google account (that's what
`chrome.storage.sync` is for, and this project deliberately never uses it)
— the session string stays only on the one device it was created on.

There is no analytics, no telemetry, no third-party SDK, and no server of
this extension's own. The only network endpoints this code ever talks to
are Telegram's own (`*.web.telegram.org` over MTProto/WebSocket).

## Permission justification

Chrome Web Store review asks for a plain-language reason for every
permission — here's the complete list and why each one is requested,
nothing more:

- **`storage`** — persists the session string and UI preferences locally
  (see table above). Without it, the person would have to log in every
  time the popup closes.
- **`sidePanel`** — lets the UI open as a Chrome side panel instead of only
  a popup. Purely a UI surface; grants no additional data access.
- **`alarms`** — wakes the background service worker at the exact time a
  scheduled story should publish, even if the popup/side panel has been
  closed the whole time. This is the standard, documented Manifest V3
  mechanism for "run something later" — there's no way to do this
  reliably with a plain `setTimeout` in an extension, since that timer
  dies the moment the popup closes.
- **`notifications`** — lets the background worker tell you a scheduled
  story succeeded or failed when it fires, since there's no popup open at
  that moment to show a toast. These use `requireInteraction: true` so
  they stay on screen until dismissed rather than vanishing on their own
  after a few seconds — OS notification settings (Focus Assist, etc.)
  are still outside this extension's control, so `background.ts` also
  sets a badge count on the toolbar icon (via the `action` API, already
  covered by the `default_popup` in `action` — no separate permission
  needed) as a second channel that doesn't depend on OS notifications at
  all. The badge clears the moment the Scheduled tab is actually opened.
- **`host_permissions: https://*.telegram.org/*`, `https://*.web.telegram.org/*`**
  — GramJS opens a WebSocket connection to one of Telegram's own data
  center hostnames (all under `*.web.telegram.org`) to speak MTProto. No
  other host is ever contacted.

Nothing here requests `<all_urls>`, `tabs`, `cookies`, `webRequest`,
`scripting`, or any permission that would let the extension read or modify
other websites — it has no content script and injects nothing into any
page.

## Dependency audit

`npm audit` currently reports 6 low-severity advisories, all the same root
cause: `elliptic` (pulled in transitively by the browser `crypto` polyfill
that GramJS needs — `crypto-browserify` → `create-ecdh`/`browserify-sign`
→ `elliptic`). Checked directly: **nothing in GramJS or this codebase ever
calls an elliptic-curve function** (`grep -rl "createECDH" node_modules/telegram`
returns nothing) — MTProto uses RSA + classic (non-EC) Diffie-Hellman +
AES, not ECDH/ECDSA, so this vulnerable code path is bundled but never
executed. The available fix (`npm audit fix --force`) downgrades
`vite-plugin-node-polyfills` to a breaking older version for no actual
risk reduction, so it's left as-is. Re-check this if GramJS is ever
upgraded to a version that changes its crypto backend.

## Scheduled stories — how they actually work, and their real limits

A scheduled story's media (the actual photo/video bytes) is stored in
**IndexedDB**, not `chrome.storage` — `chrome.storage.local` has a small
size quota unsuitable for video files; IndexedDB can hold Blobs directly
and comfortably handles larger media. Only the story's own device ever
sees this data; it's never uploaded anywhere until the scheduled publish
actually happens.

At the chosen time, `chrome.alarms` wakes `background.js` (a Manifest V3
service worker — see `background.service_worker` in the manifest), which
loads the pending entry from IndexedDB and calls the same `publishStory`
function the popup uses, using the same persisted session.

**GramJS was never designed to run inside a service worker.** It decides
whether it's "in a browser" by checking for `window`, which doesn't exist
in a service worker either — so out of the box, GramJS would think it's
running in Node.js and try to open a real TCP socket, which doesn't exist
in this context. `patches/telegram+2.26.22.patch` fixes this by also
treating "has a `WebSocket` global" as browser-like (true in both regular
pages and service workers), and removes a couple of direct `window.`
references that would otherwise throw. This was verified by reading
GramJS's source directly against Chrome's documented service worker
capabilities, not by running it live — **test the full scheduled-publish
path against a real account before relying on it.**

Two limits worth knowing before trusting this with something time-sensitive:

- **If Chrome isn't running at all when the scheduled time arrives**,
  nothing publishes until Chrome is opened again — `chrome.alarms` wakes
  a *suspended* browser process, not a *fully closed* one. An overdue
  alarm fires as soon as Chrome next starts, not before.
- **The Telegram session has to still be valid at publish time.** If it
  was revoked (logged out elsewhere, etc.) between scheduling and firing,
  the scheduled story fails and a notification says so — see
  `isSessionInvalidated` in `telegram/client.ts`.

## Content Security Policy

`public/manifest.json` sets an explicit, non-default CSP for extension
pages: no remote script sources, no `eval`/`unsafe-eval` (GramJS's `vm`
polyfill is deliberately excluded in `vite.config.ts` for exactly this
reason — its browser shim uses `eval`, and it isn't actually needed), and
`connect-src` scoped to Telegram's own hosts only.

## What this can't protect against — read this before publishing

**The session string is a bearer credential: whoever has it has full
access to the account**, the same way Telegram Desktop's own local session
file works. No extension-level hardening changes that fact. The real
security boundary is the device itself — if the device is compromised
(malware with local file/extension-storage access), the session is
compromised, full stop. This isn't a gap in this code; it's inherent to
how Telegram sessions work everywhere, including Telegram's own official
apps.

**`VITE_TELEGRAM_API_ID` / `VITE_TELEGRAM_API_HASH` are compiled into the
public JS bundle.** Anyone can extract them from the built extension —
this is normal for a client-side-only Telegram tool (these two values
aren't designed to be kept secret the way a server API key is), but it
does mean:

- Never put real values in `.env.example` (a template meant to be
  committed/shared) — only in `.env.local` (gitignored). If real
  credentials were ever committed or shared anywhere, treat them as
  burned and generate a fresh pair at
  [my.telegram.org/apps](https://my.telegram.org/apps).
- **If you publish this extension publicly, every single installer
  authenticates through the same api_id/api_hash pair** *unless they've
  set their own — see below.* Telegram can and does rate-limit or ban an
  api_id that shows patterns consistent with many unrelated accounts/IPs
  using it through an unofficial MTProto client (which is exactly what
  GramJS is). This is a real, non-technical risk to the whole project's
  viability that no amount of code-level security hardening changes on
  its own — it's a property of the architecture, not a bug. Read
  Telegram's API Terms of Service (https://core.telegram.org/api/terms)
  before distributing this widely.

## Self-service API credentials (Settings → API connection)

To reduce the shared-api_id risk above, anyone using this extension can
supply their own api_id/api_hash (free, ~2 minutes at
[my.telegram.org/apps](https://my.telegram.org/apps)) instead of the
build's default — see `telegram/credentials-storage.ts` and
`telegram/config.ts#getEffectiveApiCredentials`. A custom pair takes
priority over the build default whenever one is set; it's stored in
`chrome.storage.local` (same backend as everything else, not synced
anywhere). This is available from both Settings (once logged in) and a
collapsed "API connection" link on the login screen itself, since someone
might want their own credentials from their very first login.

Two things worth knowing:

- **Changing credentials always logs you out.** MTProto sessions are
  established per api_id/api_hash pair, so there's no safe way to swap
  credentials on a live session — `resetClientForNewCredentials()` in
  `telegram/client.ts` tears down the old session (best-effort real
  `auth.LogOut`, not just a local wipe) before the new pair takes effect.
- **This only shifts the risk, it doesn't eliminate the underlying
  concern for anyone who sticks with the shared default** — someone has
  to actually go set their own credentials for it to help them
  individually. Consider steering people toward it prominently (not
  just leaving it as an easy-to-miss settings toggle) if this is going out
  to more than a handful of people you trust.

## Store listing requirements this repo doesn't (and can't) provide for you

Most extension stores require a **privacy policy URL** and a **single
purpose description** as part of listing an extension that handles user
credentials. Those have to reflect your actual hosting/distribution
decisions (support contact, hosting entity, etc.) — this document is the
raw material for writing one, not a substitute for it.
