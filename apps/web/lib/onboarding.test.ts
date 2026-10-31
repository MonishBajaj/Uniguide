import { describe, expect, it } from "vitest";
import { isEntryPath, onboardingEnd, screenOf, welcomeOf } from "./onboarding";

describe("onboardingEnd", () => {
  it("sends explorers to their matches only when matching has what it needs", () => {
    expect(onboardingEnd("exploring", true)).toBe("/app/match");
    expect(onboardingEnd("exploring", false)).toBe("/app");
    expect(onboardingEnd("knows", true)).toBe("/app/match?welcome=knows");
    expect(onboardingEnd("knows", false)).toBe("/app");
  });

  it("sends students already applying to the tracker, and students with offers to the offers", () => {
    expect(onboardingEnd("applying", false)).toBe("/app/tracker?welcome=applying");
    expect(onboardingEnd("offers", true)).toBe("/app/offers?welcome=offers");
  });
});

describe("screens and parameters", () => {
  it("reads the screen, starting at 1 for anything unknown", () => {
    expect(screenOf("2")).toBe(2);
    expect(screenOf("3")).toBe(3);
    expect(screenOf("9")).toBe(1);
    expect(screenOf(undefined)).toBe(1);
    expect(screenOf(["3"])).toBe(1);
  });

  it("accepts only the four entry answers and the three welcomes", () => {
    expect(isEntryPath("knows")).toBe(true);
    expect(isEntryPath("wandering")).toBe(false);
    expect(welcomeOf("offers")).toBe("offers");
    expect(welcomeOf("exploring")).toBeNull();
  });
});
