import { describe, expect, it } from "vitest";
import { Api } from "telegram";
import { collectAllPages } from "../client";

const story = (id: number) =>
  new Api.StoryItem({
    id,
    date: 1_700_000_000 + id,
    expireDate: 1_700_086_400 + id,
    media: new Api.MessageMediaPhoto({}),
  });

/** Fake Telegram archive holding ids total..1, served 100 per page, newest first like the real endpoint. */
function fakeArchive(total: number) {
  const calls: number[] = [];
  const fetchPage = async (offsetId: number) => {
    calls.push(offsetId);
    const start = offsetId === 0 ? total : offsetId - 1;
    const ids: number[] = [];
    for (let id = start; id >= 1 && ids.length < 100; id--) ids.push(id);
    return { count: total, stories: ids.map(story), users: [] };
  };
  return { fetchPage, calls };
}

describe("collectAllPages (history used to stop after 100 stories)", () => {
  it("reads every page, not just the first", async () => {
    const { fetchPage, calls } = fakeArchive(250);
    const items = await collectAllPages(fetchPage, "me", "");
    expect(items).toHaveLength(250);
    expect(new Set(items.map((i) => i.id)).size).toBe(250);
    expect(calls).toEqual([0, 151, 51]); // three requests, ids strictly decreasing
  });

  it("an empty archive costs one request and returns nothing", async () => {
    const { fetchPage, calls } = fakeArchive(0);
    expect(await collectAllPages(fetchPage, "me", "")).toEqual([]);
    expect(calls).toEqual([0]);
  });

  it("never loops forever if the server keeps returning the same page", async () => {
    let n = 0;
    const stuck = async () => {
      n++;
      return { count: 9999, stories: Array.from({ length: 100 }, (_, i: number) => story(500 - i)), users: [] };
    };
    const items = await collectAllPages(stuck, "me", "");
    expect(n).toBeLessThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(300);
  });
});
