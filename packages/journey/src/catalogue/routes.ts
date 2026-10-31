/**
 * Every place a step may link to, with the anchors on that page. A test checks each available
 * step's href against this list, and another checks the list against the web app's page files,
 * so a renamed route or anchor fails the build instead of sending a student to a dead link.
 */
export const ROUTES: Record<string, string[]> = {
  "/app/onboarding": [],
  "/consent": [],
  "/app/profile": ["qualification", "budget", "targets", "intake", "scores-section", "test-plans", "cv", "tracks", "research"],
  "/app/sharing": ["family", "shares"],
  "/app/match": ["score-goals"],
  "/app/match/what-if": [],
  "/app/matching": [],
  "/courses": [],
  "/courses/[slug]": [],
  "/compare/countries": [],
  "/english-tests": [],
  "/deadlines": [],
  "/app/shortlist": ["advice", "comparison", "costs"],
  "/app/tracker": [],
  "/app/tracker/[id]": ["applying", "checklist", "scores", "letters", "supplemental", "costs", "notes", "decision", "portal"],
  "/app/tracker/costs": [],
  "/app/writing": [],
  "/app/writing/new": [],
  "/app/writing/[id]": [],
  "/app/recommenders": [],
  "/app/recommenders/[id]/brag-sheet": [],
  "/app/cv": [],
  "/app/portfolio": [],
  "/app/offers": ["decision-day", "cost", "matrix", "after-accept", "others"],
  "/app/departure": [],
  "/visas": [],
  "/visas/funds": [],
  "/courses/[slug]/arrival": [],
  "/app/notifications": [],
  "/accessibility": [],
};

/** The ROUTES pattern an href lands on, or null. Query strings are ignored; an anchor must be listed. */
export function resolveHref(href: string): string | null {
  const [beforeHash = "", anchor] = href.split("#");
  const path = beforeHash.split("?")[0]!;
  const parts = path.split("/");
  for (const [pattern, anchors] of Object.entries(ROUTES)) {
    const want = pattern.split("/");
    if (want.length !== parts.length) continue;
    const same = want.every((w, i) => (w.startsWith("[") ? Boolean(parts[i]) : w === parts[i]));
    if (same && (anchor === undefined || anchors.includes(anchor))) return pattern;
  }
  return null;
}
