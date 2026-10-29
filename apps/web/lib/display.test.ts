import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, displayAttributes, listSize, liteMode, parseDisplay, serializeDisplay } from "./display";

describe("display settings", () => {
  it("defaults when the cookie is missing or junk", () => {
    expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("text=huge&contrast=<script>&motion")).toEqual(DEFAULT_DISPLAY);
  });
  it("round-trips the chosen settings, storing only what differs", () => {
    const d = { text: "larger", contrast: "high", motion: "normal", data: "auto" } as const;
    expect(serializeDisplay(d)).toBe("text=larger&contrast=high");
    expect(parseDisplay(serializeDisplay(d))).toEqual(d);
    expect(serializeDisplay(DEFAULT_DISPLAY)).toBe("");
  });
  it("sets data attributes only for non-defaults", () => {
    expect(displayAttributes({ text: "large", contrast: "normal", motion: "reduce", data: "auto" })).toEqual({ "data-text": "large", "data-motion": "reduce" });
    expect(displayAttributes(DEFAULT_DISPLAY)).toEqual({});
  });
});

describe("low-bandwidth mode", () => {
  it("follows the browser's Save-Data header on auto", () => {
    expect(liteMode(DEFAULT_DISPLAY, "on")).toBe(true);
    expect(liteMode(DEFAULT_DISPLAY, " On ")).toBe(true);
    expect(liteMode(DEFAULT_DISPLAY, null)).toBe(false);
  });
  it("lets the student override it either way", () => {
    expect(liteMode({ ...DEFAULT_DISPLAY, data: "saver" }, null)).toBe(true);
    expect(liteMode({ ...DEFAULT_DISPLAY, data: "full" }, "on")).toBe(false);
    expect(parseDisplay("data=saver").data).toBe("saver");
  });
  it("shortens lists to ten", () => {
    expect([listSize(30, true), listSize(30, false), listSize(5, true)]).toEqual([10, 30, 5]);
  });
});
