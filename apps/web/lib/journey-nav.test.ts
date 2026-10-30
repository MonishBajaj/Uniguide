import { describe, expect, it, vi } from "vitest";
import { headerJourney, navSection, reachedSections } from "./journey-nav";

describe("navSection (spec 6.1)", () => {
  it("maps every route in the spec's table to its section", () => {
    const table: [string, string][] = [
      ["/app", "home"],
      ["/app/match", "explore"],
      ["/app/match/what-if", "explore"],
      ["/app/matching", "explore"],
      ["/courses", "explore"],
      ["/compare/countries", "explore"],
      ["/english-tests", "explore"],
      ["/deadlines", "explore"],
      ["/app/shortlist", "shortlist"],
      ["/app/tracker", "applications"],
      ["/app/tracker/costs", "applications"],
      ["/app/writing/new", "applications"],
      ["/app/recommenders/r1/brag-sheet", "applications"],
      ["/app/cv", "applications"],
      ["/app/portfolio", "applications"],
      ["/app/offers", "offers"],
      ["/app/departure", "departure"],
      ["/visas", "departure"],
      ["/visas/funds", "departure"],
      ["/app/profile", "account"],
      ["/app/sharing", "account"],
      ["/app/notifications", "account"],
      ["/accessibility", "account"],
    ];
    for (const [path, section] of table) expect(navSection(path), path).toBe(section);
  });

  it("follows the page's section on sub-pages", () => {
    expect(navSection("/app/tracker/abc")).toBe("applications");
    expect(navSection("/app/writing/x")).toBe("applications");
    expect(navSection("/courses/foo")).toBe("explore");
  });

  it("gives null for pages outside the journey", () => {
    expect(navSection("/blog")).toBeNull();
    expect(navSection("/app/onboarding")).toBeNull();
    expect(navSection("/applications")).toBeNull();
  });
});

describe("reachedSections", () => {
  it("opens sections as the student moves through the stages", () => {
    expect(reachedSections(1)).toEqual(["home", "account"]);
    expect(reachedSections(4)).toEqual(["home", "account", "explore", "shortlist", "applications"]);
    expect(reachedSections(7)).toHaveLength(7);
  });
});

describe("headerJourney", () => {
  const journey = { result: { stage: 4 as const, urgentCount: 2, urgentLabel: "2 steps due this fortnight" } };

  it("reads the journey on /app pages and shows the badge as a sentence", async () => {
    const get = vi.fn(async () => journey);
    expect(await headerJourney("/app/tracker", true, get)).toEqual({ stage: 4, badge: { count: 2, label: "2 steps due this fortnight" } });
    expect(get).toHaveBeenCalledOnce();
  });

  it("never reads the journey on public pages", async () => {
    const get = vi.fn(async () => journey);
    expect(await headerJourney("/courses/x", true, get)).toEqual({ stage: null, badge: null });
    expect(await headerJourney(null, true, get)).toEqual({ stage: null, badge: null });
    expect(get).not.toHaveBeenCalled();
  });

  it("never reads it for someone who isn't a student", async () => {
    const get = vi.fn(async () => journey);
    await headerJourney("/app", false, get);
    expect(get).not.toHaveBeenCalled();
  });

  it("shows no badge, and doesn't throw, when the read fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = async () => {
      throw new Error("boom");
    };
    await expect(headerJourney("/app/tracker", true, failing)).resolves.toEqual({ stage: null, badge: null });
    log.mockRestore();
  });

  it("shows no badge when nothing is urgent", async () => {
    const calm = async () => ({ result: { stage: 2 as const, urgentCount: 0, urgentLabel: null } });
    expect(await headerJourney("/app", true, calm)).toEqual({ stage: 2, badge: null });
  });
});
