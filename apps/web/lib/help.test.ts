import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_ROUTES, helpFor, helpKey, helpRoute } from "./help";

const DIR = join(__dirname, "..", "content", "help");

describe("page help", () => {
  it("has a help file for every route in English and Hindi, and no file without a route", () => {
    const keys = HELP_ROUTES.map(helpKey).sort();
    for (const lang of ["en", "hi"]) {
      expect(readdirSync(join(DIR, lang)).map((f) => f.replace(/\.md$/, "")).sort(), lang).toEqual(keys);
    }
  });

  it("finds the route for a path, using the nearest route above deeper pages", () => {
    expect(helpRoute("/app")).toBe("/app");
    expect(helpRoute("/app/tracker/2f1c")).toBe("/app/tracker/[id]");
    expect(helpRoute("/app/tracker/costs")).toBe("/app/tracker/costs");
    expect(helpRoute("/app/match/what-if")).toBe("/app/match/what-if");
    expect(helpRoute("/app/writing/new")).toBe("/app/writing");
    expect(helpRoute("/app/recommenders/abc/brag-sheet")).toBe("/app/recommenders");
    expect(helpRoute("/courses/x")).toBeNull();
    expect(helpRoute(null)).toBeNull();
  });

  it("reads the student's language, and nothing outside /app", () => {
    expect(helpFor("/app/shortlist", "en")).toContain("<strong>I&#39;m applying to this</strong>");
    expect(helpFor("/app/shortlist", "hi")).toMatch(/[ऀ-ॿ]/);
    expect(helpFor("/visas", "en")).toBeNull();
  });
});
