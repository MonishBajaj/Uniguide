/**
 * Journey M2 (J2.2): which navigation section a page belongs to (spec 6.1), which sections a
 * student has reached, and what the header shows. Pure, so the header and its tests share it.
 */
import type { Stage } from "@uniguide/journey/stages";
import { isAppPath } from "./request-path";

export type NavSection = "home" | "explore" | "shortlist" | "applications" | "offers" | "departure" | "account";

/** Spec 6.1, most specific prefix first. */
const SECTIONS: [string, NavSection][] = [
  ["/app/match", "explore"],
  ["/app/matching", "explore"],
  ["/courses", "explore"],
  ["/compare/countries", "explore"],
  ["/english-tests", "explore"],
  ["/deadlines", "explore"],
  ["/app/shortlist", "shortlist"],
  ["/app/tracker", "applications"],
  ["/app/writing", "applications"],
  ["/app/recommenders", "applications"],
  ["/app/cv", "applications"],
  ["/app/portfolio", "applications"],
  ["/app/next-intake", "applications"],
  ["/app/offers", "offers"],
  ["/app/departure", "departure"],
  ["/visas", "departure"],
  ["/app/profile", "account"],
  ["/app/sharing", "account"],
  ["/app/notifications", "account"],
  ["/accessibility", "account"],
];

export function navSection(pathname: string): NavSection | null {
  if (pathname === "/app") return "home";
  const hit = SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

/** The stage at which each section starts to matter. Home and account always count as reached. */
const STARTS: Record<NavSection, Stage> = { home: 1, account: 1, explore: 2, shortlist: 3, applications: 4, offers: 6, departure: 7 };

export function reachedSections(stage: Stage): NavSection[] {
  return (Object.keys(STARTS) as NavSection[]).filter((s) => STARTS[s] <= stage);
}

export interface HeaderJourney {
  /** Null when unknown: public pages, or a journey that couldn't be read. */
  stage: Stage | null;
  badge: { count: number; label: string } | null;
}

/**
 * What the navigation shows. Only /app pages read the journey; anywhere else, and when the read
 * fails, the navigation has no stage and no badge and the page still renders.
 */
export async function headerJourney(
  path: string | null,
  isStudent: boolean,
  getJourney: () => Promise<{ result: { stage: Stage; urgentCount: number; urgentLabel: string | null } }>,
): Promise<HeaderJourney> {
  if (!isStudent || !isAppPath(path)) return { stage: null, badge: null };
  try {
    const { result } = await getJourney();
    return {
      stage: result.stage,
      badge: result.urgentCount && result.urgentLabel ? { count: result.urgentCount, label: result.urgentLabel } : null,
    };
  } catch (e) {
    console.error(`journey for the navigation failed: ${e instanceof Error ? e.message : e}`);
    return { stage: null, badge: null };
  }
}
