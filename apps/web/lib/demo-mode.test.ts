import { describe, expect, it } from "vitest";
import { demoSwitcherEnabled, isLocalUrl, isMode, modeOf, modePrompt, promptUrl } from "./demo-mode";

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

describe("mode prompt", () => {
  it("names the page and the mode that opens it", () => {
    expect(modePrompt("/app/tracker/abc")).toEqual({ from: "/app/tracker/abc", mode: "user", name: "your tracker" });
    expect(modePrompt("/app/notifications")).toMatchObject({ mode: "user", name: "your account" });
    expect(modePrompt("/parent")).toMatchObject({ mode: "parent", name: "the parent view" });
  });

  it("has no demo mode for staff pages", () => {
    expect(modePrompt("/admin/review")).toMatchObject({ mode: null });
  });

  it("ignores unknown and unsafe paths", () => {
    expect(modePrompt("/courses")).toBeNull();
    expect(modePrompt("//evil.com/app")).toBeNull();
    expect(modePrompt("https://evil.com/app")).toBeNull();
    expect(modePrompt("/apple")).toBeNull();
    expect(modePrompt(undefined)).toBeNull();
  });

  it("builds the redirect", () => {
    expect(promptUrl("/app/tracker")).toBe("/?from=%2Fapp%2Ftracker");
  });
});
