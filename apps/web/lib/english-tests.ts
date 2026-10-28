export type LanguageRow = {
  id: string;
  programSlug: string;
  programTitle: string;
  institution: string;
  country: string;
  exam: string;
  examVersion: string | null;
  minTotal: number | null;
  minSections: Record<string, number> | null;
  status: string;
  testPolicy: string | null;
};

export type ExamGroup = { exam: string; examVersion: string | null; courses: LanguageRow[] };

/** Courses grouped by exam and version (versions use different scales, so they are never merged). */
export function byExam(rows: LanguageRow[]): ExamGroup[] {
  const groups = new Map<string, ExamGroup>();
  for (const row of rows) {
    const key = `${row.exam}|${row.examVersion ?? ""}`;
    const group = groups.get(key) ?? { exam: row.exam, examVersion: row.examVersion, courses: [] };
    group.courses.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      courses: g.courses.sort((a, b) => a.country.localeCompare(b.country) || a.programTitle.localeCompare(b.programTitle)),
    }))
    .sort((a, b) => b.courses.length - a.courses.length || a.exam.localeCompare(b.exam));
}
