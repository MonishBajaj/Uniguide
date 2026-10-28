import { describe, expect, it } from "vitest";
import { demoSwitcherEnabled, isLocalUrl, isMode, modeOf } from "./demo-mode";

describe("demo mode", () => {
  it("only runs against a local database", () => {
    expect(isLocalUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalUrl("http://localhost:54321")).toBe(true);
    expect(isLocalUrl("https://abcd.supabase.co")).toBe(false);
    expect(isLocalUrl("https://localhost.evil.com")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });

  it("needs the flag and a local database", () => {
    expect(demoSwitcherEnabled(true, "http://127.0.0.1:54321")).toBe(true);
    expect(demoSwitcherEnabled(false, "http://127.0.0.1:54321")).toBe(false);
    expect(demoSwitcherEnabled(true, "https://abcd.supabase.co")).toBe(false);
  });

  it("derives the mode from the session", () => {
    expect(modeOf(false, false)).toBe("guest");
    expect(modeOf(true, false)).toBe("user");
    expect(modeOf(true, true)).toBe("parent");
  });

  it("accepts only known modes", () => {
    expect(isMode("parent")).toBe(true);
    expect(isMode("admin")).toBe(false);
    expect(isMode(undefined)).toBe(false);
  });
});
