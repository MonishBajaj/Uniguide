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

export type ChecklistItem = { key: string; label: string; done: boolean; href: string; why: string };

/**
 * What matching still needs from the student. A plain list of missing facts, never a "strength" score:
 * each item names what it unlocks. Research interests count only for doctorate applicants.
 */
export function profileChecklist(p: ProfileFields, testScoreCount: number): ChecklistItem[] {
  const items: ChecklistItem[] = [
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
