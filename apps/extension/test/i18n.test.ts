import { describe, expect, it } from "vitest";
import { DICTS, pickLocale } from "../src/panel/i18n";

describe("panel words", () => {
  it("has every English entry in Hindi, none empty, of the same kind", () => {
    for (const [k, v] of Object.entries(DICTS.en)) {
      const h = (DICTS.hi as Record<string, unknown>)[k];
      expect(typeof h, k).toBe(typeof v);
      if (typeof h === "string") expect(h.trim(), k).not.toBe("");
    }
    expect(Object.keys(DICTS.hi).sort()).toEqual(Object.keys(DICTS.en).sort());
  });

  it("uses Hindi only when the browser prefers it to English", () => {
    expect(pickLocale(["hi-IN", "en"])).toBe("hi");
    expect(pickLocale(["en-GB", "hi"])).toBe("en");
    expect(pickLocale(["fr"])).toBe("en");
  });
});

describe("role names", () => {
  it("names every role in both languages", async () => {
    const { ROLES } = await import("@uniguide/portal-adapters");
    for (const role of Object.keys(ROLES)) {
      expect(DICTS.en.roleNames[role as keyof typeof ROLES], role).toBeTruthy();
      expect(DICTS.hi.roleNames[role as keyof typeof ROLES], role).toBeTruthy();
    }
  });
});
