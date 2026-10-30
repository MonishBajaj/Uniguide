import type { ProfileSnapshot, TrackSnapshot } from "./types";

export type ProfileFields = {
  home_qualification: string | null;
  grade_value: number | null;
  grade_text: string | null;
  grade_scale: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  target_levels: string[];
  target_countries: string[];
  target_fields: string[];
  research_interests: string | null;
};

export type ProfileChecklistItem = { key: string; label: string; done: boolean; href: string; why: string };

/**
 * What matching still needs from the student. A plain list of missing facts, never a "strength" score:
 * each item names what it unlocks. Research interests count only for doctorate applicants.
 * Moved here from apps/web/lib/profile-completeness.ts so the profile page and the journey share it.
 */
export function profileChecklist(p: ProfileFields, testScoreCount: number): ProfileChecklistItem[] {
  const items: ProfileChecklistItem[] = [
    {
      key: "qualification",
      label: "Your qualification and grade",
      done: Boolean(p.home_qualification && (p.grade_value != null || p.grade_text) && p.grade_scale),
      href: "#qualification",
      why: "checks entry requirements",
    },
    { key: "level", label: "The level you want to study", done: p.target_levels.length > 0, href: "#targets", why: "finds courses at that level" },
    { key: "countries", label: "Countries you would consider", done: p.target_countries.length > 0, href: "#targets", why: "narrows the search" },
    { key: "fields", label: "Subjects", done: p.target_fields.length > 0, href: "#targets", why: "ranks courses by subject" },
    {
      key: "budget",
      label: "Your budget and its currency",
      done: Boolean(p.budget_amount && p.budget_currency),
      href: "#budget",
      why: "compares costs with what you can spend",
    },
    { key: "tests", label: "At least one test score", done: testScoreCount > 0, href: "#scores-section", why: "checks language and test minimums" },
  ];
  if (p.target_levels.includes("doctorate")) {
    items.push({
      key: "research",
      label: "Your research interests",
      done: Boolean(p.research_interests?.trim()),
      href: "#research",
      why: "matches you with faculty",
    });
  }
  return items;
}

/** The profile in the checklist's own shape. Targets also count when only a track has them. */
export function checklistFields(profile: ProfileSnapshot, tracks: TrackSnapshot[] = []): ProfileFields {
  const union = <T,>(own: T[], pick: (t: TrackSnapshot) => T[]) => [...new Set([...own, ...tracks.flatMap(pick)])];
  return {
    home_qualification: profile.homeQualification,
    grade_value: profile.gradeValue,
    grade_text: profile.gradeText,
    grade_scale: profile.gradeScale,
    budget_amount: profile.budgetAmount,
    budget_currency: profile.budgetCurrency,
    target_levels: union(profile.targetLevels, (t) => t.targetLevels),
    target_countries: union(profile.targetCountries, (t) => t.targetCountries),
    target_fields: union(profile.targetFields, (t) => t.targetFields),
    research_interests: profile.researchInterests,
  };
}

/**
 * Stage 2 starts when matching has what it needs. The test-score item is left out on purpose
 * (owner decision, plan D4): students who have not taken a test yet still explore, and step S1.05
 * asks for a score only when a course needs one.
 */
export function matchingMinimumMet(profile: ProfileSnapshot, tracks: TrackSnapshot[] = []): boolean {
  return profileChecklist(checklistFields(profile, tracks), 0)
    .filter((i) => i.key !== "tests")
    .every((i) => i.done);
}
