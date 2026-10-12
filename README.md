# Telegram Story Post Scheduler Extension

A Chrome extension for creating, publishing, scheduling, and managing Telegram Stories from a convenient browser interface.

Built with **Manifest V3, Vite, React 19, and TypeScript**, the extension includes a multilingual interface, RTL support, story history, multi-target publishing, and scheduled-story workflows.

> **Important: Read [`SECURITY.md`](./SECURITY.md) before using or publishing this project.** It documents permissions, local storage, scheduled-story limitations, and the risks of sharing Telegram API credentials. The Telegram login and publishing flow has not yet been fully tested end-to-end against Telegram's live servers, so test carefully before relying on it.

## Features

- **Create and publish Stories** with media uploads, captions, and privacy options.
- **Schedule Stories** for later publication using a background service worker and `chrome.alarms`.
- **Publish to multiple targets** where the connected account has the required story-posting rights.
- **Manage Stories** with history, media-type and date filters, and deletion controls.
- **Support for Telegram Premium story durations**, where available to the account.
- **Multilingual interface** with eight languages: English, Persian, Arabic, Turkish, Russian, Spanish, French, and Italian.
- **RTL support** for Persian and Arabic, with language switching available before login.
- **Telegram sign-in flow** with phone number, login code, and optional two-step verification.
- **Custom Telegram API credentials** so users can configure their own `api_id` and `api_hash`.
- **Chrome popup and Side Panel** interfaces.
- **Accessible, responsive UI** with translated validation and error messages.

Feature availability can depend on Telegram account permissions, Premium status, Telegram API behavior, and the current state of the extension. See [`SECURITY.md`](./SECURITY.md) for important limitations.

## Tech Stack

- React 19
- TypeScript
- Vite
- Chrome Extensions Manifest V3
- GramJS / Telegram MTProto
- i18next and react-i18next
- Chrome Storage and Alarms APIs

## Getting Started

### Requirements

- Node.js and npm
- Google Chrome
- Your own Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps)

### 1. Clone the repository

```bash
git clone https://github.com/nazirahmad1/Telegram-Story-Post-Scheduler-Extension.git
cd Telegram-Story-Post-Scheduler-Extension
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Telegram API credentials

Create a local environment file from the example:

```bash
cp .env.example .env.local
```

Add your credentials to `.env.local`:

```env
VITE_TELEGRAM_API_ID=your_api_id
VITE_TELEGRAM_API_HASH=your_api_hash
```

Get these values from [Telegram's API development tools](https://my.telegram.org/apps). Do not commit `.env.local` or share your API credentials publicly.

### 4. Build the extension

```bash
npm run build
```

The production extension is generated in the `dist/` directory.

### 5. Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the project's `dist/` directory.
5. Open the extension and follow the connection flow.

For local development, run:

```bash
npm run dev
```

## Development Checks

Run the available checks before submitting changes:

```bash
npm run i18n:check
npm test
npm run build
```

- `npm run i18n:check` checks locale files for missing or inconsistent translation keys and plural forms.
- `npm test` runs the project's runtime smoke tests.
- `npm run build` creates the production extension.

## Languages

The interface currently includes:

- English
- Persian (RTL)
- Arabic (RTL)
- Turkish
- Russian
- Spanish
- French
- Italian

Language preferences are stored locally in Chrome. Persian and Arabic use right-to-left layout; the other supported languages use left-to-right layout.

## Security and Privacy

This extension handles sensitive Telegram account information. Before using it:

- Read [`SECURITY.md`](./SECURITY.md) carefully.
- Use your own Telegram `api_id` and `api_hash`.
- Never publish your Telegram login code, two-step verification password, session data, or API credentials.
- Review requested browser permissions and understand where session and preference data are stored.
- Do not rely on scheduled Stories for time-critical publishing until you have tested the behavior in your own environment.

The extension's Telegram connection and story-publishing flow is **not yet verified end-to-end against Telegram's live servers**. Build and browser checks do not prove that live authentication, publishing, deletion, or scheduling will work in every account or network environment.

## Current Status

The project is under active development. Some UI and browser behaviors have been tested with a real Chromium browser, but live Telegram account operations still require end-to-end testing.

Before using it for important posts, verify:
- Telegram sign-in, including two-step verification if enabled
- Story publishing and deletion
- Publishing to channels or groups with story-posting rights
- Scheduled publishing after the browser or extension has been idle
- Re-authentication and error recovery

## Contributing

Bug reports, suggestions, and pull requests are welcome.

When reporting an issue, include:
- What you expected to happen
- What actually happened
- Steps to reproduce the issue
- Relevant browser console errors, with private information removed

Never include phone numbers, login codes, passwords, session strings, or API credentials in an issue.

## License

Check the repository for license information before redistributing or reusing this project.
