/**
 * Journey M2 (J2.6): onboarding's screens and where each entry answer ends (spec 3.2, 6.4).
 * Pure, so the page, the actions and their tests share it.
 */
export const ENTRY_PATHS = ["exploring", "knows", "applying", "offers"] as const;
export type EntryPath = (typeof ENTRY_PATHS)[number];
export type Screen = 1 | 2 | 3;

export const isEntryPath = (v: unknown): v is EntryPath => (ENTRY_PATHS as readonly unknown[]).includes(v);

/** The screen from `?screen=`; anything else starts at the beginning. */
export function screenOf(param: unknown): Screen {
  return param === "2" ? 2 : param === "3" ? 3 : 1;
}

/** A short "what to do here" note on the page onboarding ends on, from `?welcome=`. */
export type Welcome = "knows" | "applying" | "offers";
export const welcomeOf = (param: unknown): Welcome | null =>
  param === "knows" || param === "applying" || param === "offers" ? param : null;

/**
 * Where onboarding ends. Exploring and knows go to the first matches only when matching has what it
 * needs; otherwise the home's stage 1 steps say what is missing. It never ends on an empty list.
 */
export function onboardingEnd(entryPath: EntryPath, matchingReady: boolean): string {
  switch (entryPath) {
    case "applying":
      return "/app/tracker?welcome=applying";
    case "offers":
      return "/app/offers?welcome=offers";
    case "knows":
      return matchingReady ? "/app/match?welcome=knows" : "/app";
    case "exploring":
      return matchingReady ? "/app/match" : "/app";
  }
}
