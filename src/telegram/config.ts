/**
 * Telegram requires an api_id/api_hash pair issued per-application from
 * https://my.telegram.org/apps. These are NOT full secrets the way a server
 * API key is — any client-side Telegram app ships them inside its bundle,
 * GramJS itself documents this — but they still must never be hardcoded in
 * source or committed to a public repo.
 *
 * Two sources, in priority order:
 *   1. A credential pair the PERSON has entered themselves in Settings
 *      (see credentials-storage.ts) — takes priority when present.
 *   2. The build's own default, from Vite env vars (`.env.local`, gitignored,
 *      copy from `.env.example`).
 *
 * Why both: shipping one shared default is the easiest path to try the
 * extension, but if this gets distributed publicly, every installer
 * authenticating through the same api_id is a real risk — Telegram can
 * rate-limit or ban a single api_id that shows patterns consistent with
 * many unrelated accounts/IPs using it (see SECURITY.md). Letting anyone
 * swap in their own free api_id/api_hash (2 minutes at the link above)
 * moves that risk onto their own credentials instead of a shared one.
 */
import { getCustomApiCredentials, type ApiCredentials } from "./credentials-storage";

function readEnvDefault(): ApiCredentials | null {
  const apiId = Number(import.meta.env.VITE_TELEGRAM_API_ID);
  const apiHash = import.meta.env.VITE_TELEGRAM_API_HASH;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

export class MissingApiCredentialsError extends Error {
  constructor() {
    super(
      "No Telegram API credentials configured. Add your own in Settings, " +
        "or (for local builds) copy .env.example to .env.local and fill in " +
        "your api_id/api_hash from https://my.telegram.org/apps.",
    );
    this.name = "MissingApiCredentialsError";
  }
}

/** The credentials actually in effect right now — the person's own if they've set one, otherwise this build's default. */
export async function getEffectiveApiCredentials(): Promise<ApiCredentials> {
  const custom = await getCustomApiCredentials();
  if (custom) return custom;

  const envDefault = readEnvDefault();
  if (envDefault) return envDefault;

  throw new MissingApiCredentialsError();
}

export async function hasBuildDefaultCredentials(): Promise<boolean> {
  return readEnvDefault() !== null;
}
