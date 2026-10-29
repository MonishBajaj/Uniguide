import { describe, expect, it } from "vitest";
import { findContactDetails, ratingSummary } from "./community";

describe("findContactDetails", () => {
  it.each([
    ["Write to asha.rao@example.com", ["email"]],
    ["asha dot rao (at) gmail (dot) com", ["email"]],
    ["see example.org for my notes", ["link"]],
    ["Go to https://x.y", ["link"]],
    ["Call +91 98765 43210 after six", ["phone"]],
    ["ping me on WhatsApp", ["handle"]],
    ["find me @asha_r", ["handle"]],
  ])("finds %s", (text, kinds) => {
    expect(findContactDetails(text)).toEqual(kinds);
  });
  it("lets ordinary writing through, numbers and all", () => {
    expect(findContactDetails("I scored 7.5 in IELTS in 2025, applied to 6 courses and paid GBP 25,000 in fees.")).toEqual([]);
    expect(findContactDetails("The M.Sc. at TU Munich was my first choice.")).toEqual([]);
  });
  it("checks every field it is given", () => {
    expect(findContactDetails("A fine story", null, "asha@example.com")).toEqual(["email"]);
  });
});

describe("ratingSummary", () => {
  const r = (t: number, s: number, v: number) => ({ teaching: t, support: s, value: v });
  it("hides averages under five reviews", () => {
    expect(ratingSummary([r(5, 5, 5), r(1, 1, 1)])).toEqual({ count: 2, averages: null });
  });
  it("averages to one decimal from five reviews", () => {
    expect(ratingSummary([r(5, 4, 3), r(4, 4, 3), r(5, 3, 3), r(4, 4, 2), r(3, 5, 4)])).toEqual({
      count: 5,
      averages: { teaching: 4.2, support: 4, value: 3 },
    });
  });
});
