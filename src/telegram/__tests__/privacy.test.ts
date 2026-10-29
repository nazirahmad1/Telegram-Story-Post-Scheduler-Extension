import { describe, expect, it } from "vitest";
import { Api } from "telegram";
import bigInt from "big-integer";
import {
  buildPrivacyRules,
  effectiveConfigForTarget,
  parsePrivacyRules,
  validateAudience,
  DEFAULT_AUDIENCE,
} from "../privacy";

const fakeUsers = (ids: string[]) => ids.map((id) => new Api.InputUser({ userId: bigInt(id), accessHash: bigInt(1) }));

describe("privacy rules", () => {
  it("everyone + hidden people -> AllowAll + DisallowUsers", () => {
    const rules = buildPrivacyRules({ audience: "everyone", allowUserIds: [], blockUserIds: ["5", "6"] }, fakeUsers);
    expect(rules[0]).toBeInstanceOf(Api.InputPrivacyValueAllowAll);
    expect(rules[1]).toBeInstanceOf(Api.InputPrivacyValueDisallowUsers);
    expect((rules[1] as Api.InputPrivacyValueDisallowUsers).users).toHaveLength(2);
  });

  it("selected contacts -> AllowUsers only, ignoring any block list", () => {
    const rules = buildPrivacyRules({ audience: "selected", allowUserIds: ["1"], blockUserIds: ["9"] }, fakeUsers);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toBeInstanceOf(Api.InputPrivacyValueAllowUsers);
  });

  it("close friends never carries exclusions", () => {
    const rules = buildPrivacyRules({ audience: "closeFriends", allowUserIds: [], blockUserIds: ["9"] }, fakeUsers);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toBeInstanceOf(Api.InputPrivacyValueAllowCloseFriends);
  });

  it("round-trips Telegram's stored rules back into the editor model", () => {
    const parsed = parsePrivacyRules([
      new Api.PrivacyValueAllowContacts(),
      new Api.PrivacyValueDisallowUsers({ users: [bigInt("42")] }),
    ]);
    expect(parsed).toEqual({ audience: "contacts", allowUserIds: [], blockUserIds: ["42"] });
    expect(parsePrivacyRules([new Api.PrivacyValueAllowUsers({ users: [bigInt("7"), bigInt("8")] })])).toEqual({
      audience: "selected",
      allowUserIds: ["7", "8"],
      blockUserIds: [],
    });
    expect(parsePrivacyRules(undefined).audience).toBe("everyone");
  });

  it("refuses 'selected' with nobody selected", () => {
    expect(validateAudience({ audience: "selected", allowUserIds: [], blockUserIds: [] })).toBe("selectedEmpty");
    expect(validateAudience({ audience: "selected", allowUserIds: ["1"], blockUserIds: [] })).toBe("ok");
  });

  it("channel stories ignore the personal audience", () => {
    const personal = { audience: "closeFriends" as const, allowUserIds: [], blockUserIds: [] };
    expect(effectiveConfigForTarget(personal, "me")).toBe(personal);
    expect(effectiveConfigForTarget(personal, "mychannel")).toEqual(DEFAULT_AUDIENCE);
  });
});
