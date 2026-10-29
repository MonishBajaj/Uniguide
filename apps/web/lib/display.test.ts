import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, displayAttributes, parseDisplay, serializeDisplay } from "./display";

describe("display settings", () => {
  it("defaults when the cookie is missing or junk", () => {
    expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("text=huge&contrast=<script>&motion")).toEqual(DEFAULT_DISPLAY);
  });
  it("round-trips the chosen settings, storing only what differs", () => {
    const d = { text: "larger", contrast: "high", motion: "normal" } as const;
    expect(serializeDisplay(d)).toBe("text=larger&contrast=high");
    expect(parseDisplay(serializeDisplay(d))).toEqual(d);
    expect(serializeDisplay(DEFAULT_DISPLAY)).toBe("");
  });
  it("sets data attributes only for non-defaults", () => {
    expect(displayAttributes({ text: "large", contrast: "normal", motion: "reduce" })).toEqual({ "data-text": "large", "data-motion": "reduce" });
    expect(displayAttributes(DEFAULT_DISPLAY)).toEqual({});
  });
});
