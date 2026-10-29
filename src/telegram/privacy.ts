import { Api } from "telegram";

/**
 * "Who can see this story" — the same four choices as Telegram on mobile:
 *  - everyone      (optionally hidden from specific people)
 *  - contacts      (optionally hidden from specific contacts)
 *  - closeFriends
 *  - selected      (only the chosen contacts)
 */
export type StoryAudience = "everyone" | "contacts" | "closeFriends" | "selected";

export interface StoryAudienceConfig {
  audience: StoryAudience;
  /** Only used when audience === "selected". User ids as decimal strings. */
  allowUserIds: string[];
  /** Used by "everyone" and "contacts": people the story is hidden from. */
  blockUserIds: string[];
}

export const DEFAULT_AUDIENCE: StoryAudienceConfig = { audience: "everyone", allowUserIds: [], blockUserIds: [] };

export class AudienceUnresolvedError extends Error {
  readonly missingUserIds: string[];
  constructor(missingUserIds: string[]) {
    super(`Could not resolve ${missingUserIds.length} selected user(s).`);
    this.name = "AudienceUnresolvedError";
    this.missingUserIds = missingUserIds;
  }
}

/** Telegram refuses "selected" with nobody selected — catch it before the round trip. */
export function validateAudience(cfg: StoryAudienceConfig): "ok" | "selectedEmpty" {
  return cfg.audience === "selected" && cfg.allowUserIds.length === 0 ? "selectedEmpty" : "ok";
}

export function buildPrivacyRules(
  cfg: StoryAudienceConfig,
  resolveUsers: (ids: string[]) => Api.TypeInputUser[],
): Api.TypeInputPrivacyRule[] {
  const rules: Api.TypeInputPrivacyRule[] = [];
  switch (cfg.audience) {
    case "contacts":
      rules.push(new Api.InputPrivacyValueAllowContacts());
      break;
    case "closeFriends":
      rules.push(new Api.InputPrivacyValueAllowCloseFriends());
      break;
    case "selected":
      rules.push(new Api.InputPrivacyValueAllowUsers({ users: resolveUsers(cfg.allowUserIds) }));
      break;
    case "everyone":
    default:
      rules.push(new Api.InputPrivacyValueAllowAll());
  }
  if ((cfg.audience === "everyone" || cfg.audience === "contacts") && cfg.blockUserIds.length > 0) {
    rules.push(new Api.InputPrivacyValueDisallowUsers({ users: resolveUsers(cfg.blockUserIds) }));
  }
  return rules;
}

function idsOf(users: unknown[] | undefined): string[] {
  return (users ?? []).map((u) => String(u));
}

/** Reads the privacy rules Telegram stored on an existing story back into the editor's model. */
export function parsePrivacyRules(rules: Api.TypePrivacyRule[] | undefined): StoryAudienceConfig {
  const cfg: StoryAudienceConfig = { audience: "everyone", allowUserIds: [], blockUserIds: [] };
  for (const rule of rules ?? []) {
    if (rule instanceof Api.PrivacyValueAllowCloseFriends) cfg.audience = "closeFriends";
    else if (rule instanceof Api.PrivacyValueAllowContacts) cfg.audience = "contacts";
    else if (rule instanceof Api.PrivacyValueAllowUsers) {
      cfg.audience = "selected";
      cfg.allowUserIds = idsOf(rule.users);
    } else if (rule instanceof Api.PrivacyValueDisallowUsers) cfg.blockUserIds = idsOf(rule.users);
  }
  if (cfg.audience === "closeFriends" || cfg.audience === "selected") cfg.blockUserIds = [];
  return cfg;
}

/** Stories seen by someone other than the owner only carry flags, not rules. */
export function audienceFromFlags(item: {
  closeFriends?: boolean;
  contacts?: boolean;
  selectedContacts?: boolean;
}): StoryAudience | null {
  if (item.closeFriends) return "closeFriends";
  if (item.selectedContacts) return "selected";
  if (item.contacts) return "contacts";
  return null;
}

/** Channel/group stories have no audience choice — Telegram shows them to everyone who can open the channel's stories. */
export function effectiveConfigForTarget(cfg: StoryAudienceConfig, target: string): StoryAudienceConfig {
  return target === "me" ? cfg : DEFAULT_AUDIENCE;
}
