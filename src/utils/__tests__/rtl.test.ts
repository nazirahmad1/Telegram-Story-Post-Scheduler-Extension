import { describe, expect, it } from "vitest";

describe("bidi-safe name lists", () => {
  it("Intl.ListFormat uses the language's own separator", () => {
    const fa = new Intl.ListFormat("fa", { style: "narrow", type: "conjunction" }).format(["a", "b", "c"]);
    const en = new Intl.ListFormat("en", { style: "narrow", type: "conjunction" }).format(["a", "b", "c"]);
    expect(fa).toContain("،");
    expect(en).not.toContain("،");
  });
});
