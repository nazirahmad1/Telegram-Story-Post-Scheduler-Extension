import { useEffect, useMemo, useState } from "react";
import { Globe2, Users, Star, UserCheck, Eye, EyeOff, Search, Check, UserMinus } from "lucide-react";
import { useI18n, useTranslation, type TranslationKey } from "../../i18n";
import { getContacts, type ContactOption } from "../../telegram/client";
import { describeTelegramError, type ErrorDescription } from "../../telegram/errors";
import type { StoryAudience, StoryAudienceConfig } from "../../telegram/privacy";
import { ErrorPanel } from "../ErrorPanel";

export const AUDIENCE_OPTIONS: { value: StoryAudience; key: TranslationKey; icon: typeof Globe2 }[] = [
  { value: "everyone", key: "story.privacyEveryone", icon: Globe2 },
  { value: "contacts", key: "story.privacyContacts", icon: Users },
  { value: "closeFriends", key: "story.privacyCloseFriends", icon: Star },
  { value: "selected", key: "story.privacySelected", icon: UserCheck },
];

const NAME_PREVIEW = 3;

const FSI = "\u2068"; // first-strong isolate: each name keeps its own direction
const PDI = "\u2069";

function nameList(
  ids: string[],
  names: Record<string, string>,
  t: ReturnType<typeof useTranslation>["t"],
  language: string,
): string {
  const shown = ids.slice(0, NAME_PREVIEW).map((id) => `${FSI}${names[id] ?? id}${PDI}`);
  const rest = ids.length - shown.length;
  // Intl.ListFormat picks the right separator per language ("، " in Persian/Arabic, ", " elsewhere).
  const joined = new Intl.ListFormat(language, { style: "narrow", type: "conjunction" }).format(shown);
  return rest > 0 ? `${joined} ${t("audience.andMore", { n: rest })}` : joined;
}

/**
 * Plain-language "who can see / who can't see this story" — the same
 * information Telegram mobile shows when you open a story's privacy.
 */
export function AudienceSummary({
  config,
  names,
  isChannelTarget = false,
  known = true,
}: {
  config: StoryAudienceConfig;
  names: Record<string, string>;
  isChannelTarget?: boolean;
  known?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useI18n();
  if (isChannelTarget) {
    return (
      <div className="audience-summary">
        <span className="row" style={{ gap: 6 }}>
          <Eye size={13} aria-hidden="true" /> {t("audience.channelAll")}
        </span>
      </div>
    );
  }
  if (!known) {
    return (
      <div className="audience-summary">
        <span className="helper-text">{t("audience.unknown")}</span>
      </div>
    );
  }

  const can =
    config.audience === "everyone"
      ? t("audience.canEveryone")
      : config.audience === "contacts"
        ? t("audience.canContacts")
        : config.audience === "closeFriends"
          ? t("audience.canCloseFriends")
          : config.allowUserIds.length === 0
            ? t("audience.canSelectedNone")
            : t("audience.canSelected", { n: config.allowUserIds.length, names: nameList(config.allowUserIds, names, t, language) });

  const cant: string[] = [];
  if (config.audience === "contacts") cant.push(t("audience.cantNonContacts"));
  if (config.audience === "closeFriends") cant.push(t("audience.cantNonCloseFriends"));
  if (config.audience === "selected") cant.push(t("audience.cantEveryoneElse"));
  if (config.blockUserIds.length > 0) {
    cant.push(t("audience.cantHidden", { n: config.blockUserIds.length, names: nameList(config.blockUserIds, names, t, language) }));
  }
  if (cant.length === 0) cant.push(t("audience.cantNobody"));

  return (
    <div className="audience-summary">
      <span className="row" style={{ gap: 6, alignItems: "flex-start" }}>
        <Eye size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          <strong>{t("audience.canTitle")}</strong> {can}
        </span>
      </span>
      {cant.map((line) => (
        <span key={line} className="row" style={{ gap: 6, alignItems: "flex-start" }}>
          <EyeOff size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            <strong>{t("audience.cantTitle")}</strong> {line}
          </span>
        </span>
      ))}
    </div>
  );
}

function ContactPicker({
  title,
  selected,
  onChange,
  onDone,
  onNames,
}: {
  title: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  onDone: () => void;
  onNames: (names: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<ContactOption[] | null>(null);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    getContacts()
      .then((list) => {
        if (cancelled) return;
        setContacts(list);
        onNames(Object.fromEntries(list.map((c) => [c.id, c.name])));
      })
      .catch((err) => !cancelled && setError(describeTelegramError(err, t)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!contacts) return [];
    return q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.username?.toLowerCase().includes(q)) : contacts;
  }, [contacts, query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (id: string) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="contact-picker" role="group" aria-label={title}>
      <div className="spread">
        <span className="eyebrow">{title}</span>
        <span className="helper-text">{t("audience.selectedCount", { n: selected.length })}</span>
      </div>
      <label className="row contact-search">
        <Search size={14} aria-hidden="true" />
        <input
          className="input"
          type="search"
          value={query}
          placeholder={t("audience.searchContacts")}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("audience.searchContacts")}
        />
      </label>
      {error ? (
        <ErrorPanel description={error} compact />
      ) : !contacts ? (
        <span className="helper-text">{t("common.loading")}</span>
      ) : filtered.length === 0 ? (
        <span className="helper-text">{contacts.length === 0 ? t("audience.noContacts") : t("history.noResults")}</span>
      ) : (
        <ul className="contact-list">
          {filtered.map((c) => {
            const on = selectedSet.has(c.id);
            return (
              <li key={c.id}>
                <button type="button" className="contact-row" aria-pressed={on} onClick={() => toggle(c.id)}>
                  <span className={`contact-check ${on ? "is-on" : ""}`} aria-hidden="true">{on && <Check size={12} />}</span>
                  <bdi className="contact-name" dir="auto">{c.name}</bdi>
                  {c.username && <bdi className="helper-text" dir="ltr">@{c.username}</bdi>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn btn-primary" onClick={onDone}>{t("common.done")}</button>
    </div>
  );
}

export function AudiencePicker({
  value,
  onChange,
  names,
  onNames,
  disabled,
  isChannelOnly = false,
}: {
  value: StoryAudienceConfig;
  onChange: (next: StoryAudienceConfig) => void;
  names: Record<string, string>;
  onNames: (names: Record<string, string>) => void;
  disabled?: boolean;
  /** Only channel targets are selected — they have no audience choice. */
  isChannelOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState<"allow" | "block" | null>(null);
  const canExclude = value.audience === "everyone" || value.audience === "contacts";
  const allowedPicker = value.audience === "selected";

  if (isChannelOnly) {
    return <AudienceSummary config={value} names={names} isChannelTarget />;
  }

  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <div className="chip-group" role="radiogroup" aria-label={t("story.privacy")}>
        {AUDIENCE_OPTIONS.map(({ value: option, key, icon: Icon }) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value.audience === option}
            aria-pressed={value.audience === option}
            className="chip"
            disabled={disabled}
            onClick={() => {
              setPicking(option === "selected" ? "allow" : null);
              onChange({ ...value, audience: option });
            }}
          >
            <Icon size={14} aria-hidden="true" />
            {t(key)}
          </button>
        ))}
      </div>

      {(canExclude || allowedPicker) && picking === null && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ alignSelf: "flex-start", padding: "4px 10px" }}
          disabled={disabled}
          onClick={() => setPicking(allowedPicker ? "allow" : "block")}
        >
          {allowedPicker ? <UserCheck size={14} aria-hidden="true" /> : <UserMinus size={14} aria-hidden="true" />}
          {allowedPicker ? t("audience.chooseContacts") : t("audience.hideFrom")}
        </button>
      )}

      {picking && (
        <ContactPicker
          title={picking === "allow" ? t("audience.chooseContacts") : t("audience.hideFrom")}
          selected={picking === "allow" ? value.allowUserIds : value.blockUserIds}
          onChange={(ids) => onChange(picking === "allow" ? { ...value, allowUserIds: ids } : { ...value, blockUserIds: ids })}
          onDone={() => setPicking(null)}
          onNames={(n) => onNames({ ...names, ...n })}
        />
      )}

      <AudienceSummary config={value} names={names} />
    </div>
  );
}
