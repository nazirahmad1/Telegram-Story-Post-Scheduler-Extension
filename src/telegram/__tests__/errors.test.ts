import { describe, expect, it, vi } from "vitest";
import { matchErrorCode, storyFloodPeriod } from "../error-catalog";
import { RPCError, FloodWaitError } from "../client";
import { describeTelegramError, translateTelegramError } from "../errors";
import en from "../../i18n/locales/en.json";

// Minimal t() over the real English catalog, with {{var}} interpolation.
function t(key: string, options: Record<string, unknown> = {}): string {
  const value = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
  const suffixed = options.count === 1 ? `${key}_one` : `${key}_other`;
  const source =
    typeof value === "string"
      ? value
      : (suffixed.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en) as string);
  return String(source ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) => String(options[k] ?? ""));
}

vi.spyOn(console, "error").mockImplementation(() => {});

describe("error catalog", () => {
  it("parses the story flood family", () => {
    expect(matchErrorCode("STORY_SEND_FLOOD_WEEKLY_5")).toMatchObject({ id: "storyFlood", n: 5 });
    expect(storyFloodPeriod("STORY_SEND_FLOOD_MONTHLY_30")).toBe("monthly");
    expect(matchErrorCode("SOMETHING_NEW")).toBeNull();
  });

  it("marks every dead-session code as sessionDead (the cause of false 'not logged in' screens)", () => {
    for (const code of ["AUTH_KEY_UNREGISTERED", "AUTH_KEY_DUPLICATED", "SESSION_REVOKED", "USER_DEACTIVATED_BAN"]) {
      expect(matchErrorCode(code)?.sessionDead).toBe(true);
    }
    expect(matchErrorCode("STORIES_TOO_MUCH")?.sessionDead).toBeFalsy();
  });
});

describe("describeTelegramError", () => {
  it("explains what happened, why and what to do for a known code", () => {
    const d = describeTelegramError(new RPCError("CHAT_ADMIN_REQUIRED", undefined as never, 400), t);
    expect(d.title).toBe("You can't post here");
    expect(d.reason).toContain("admin right");
    expect(d.fix).toBeTruthy();
    expect(d.code).toBe("CHAT_ADMIN_REQUIRED");
  });

  it("uses the monthly wording and the parsed limit for monthly flood", () => {
    const d = describeTelegramError(new RPCError("STORY_SEND_FLOOD_MONTHLY_30", undefined as never, 400), t);
    expect(d.reason).toContain("per month");
    expect(d.reason).toContain("30");
  });

  it("flood wait carries the seconds for a live countdown", () => {
    const err = new FloodWaitError({ capture: 42, request: undefined } as never);
    const d = describeTelegramError(err, t);
    expect(d.retryAfter).toBe(42);
    expect(d.retryable).toBe(true);
    expect(d.fix).toContain("42");
  });

  it("a dead session is flagged so the UI can return to login", () => {
    expect(describeTelegramError(new RPCError("AUTH_KEY_UNREGISTERED", undefined as never, 401), t).sessionDead).toBe(true);
  });

  it("network problems are NOT session problems and say you're still logged in", () => {
    const d = describeTelegramError(new Error("WebSocket connection failed"), t);
    expect(d.id).toBe("network");
    expect(d.sessionDead).toBe(false);
    expect(d.reason).toContain("still logged in");
  });

  it("unknown Telegram codes still show the exact code", () => {
    const d = describeTelegramError(new RPCError("BRAND_NEW_ERROR", undefined as never, 400), t);
    expect(d.code).toBe("BRAND_NEW_ERROR");
    expect(translateTelegramError(new RPCError("PHONE_CODE_INVALID", undefined as never, 400), t)).toBe("That code isn't correct.");
  });
});
