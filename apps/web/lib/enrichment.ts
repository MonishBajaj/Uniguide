/** Stage and status wording for the "find my universities" progress page. The worker writes the keys. */
export const STAGES = [
  { key: "optimizing_profile", label: "Optimizing profile" },
  { key: "selecting_universities", label: "Selecting universities" },
  { key: "fetching_details", label: "Getting deadlines and requirements" },
  { key: "done", label: "Done" },
] as const;

export function stageIndex(stage: string): number {
  return STAGES.findIndex((s) => s.key === stage);
}

export type ItemTone = "pending" | "working" | "ok" | "warn";

export function itemLabel(status: string): { text: string; tone: ItemTone } {
  switch (status) {
    case "running": return { text: "Reading the official pages", tone: "working" };
    case "extracted": return { text: "Facts found, shown as unverified", tone: "ok" };
    case "skipped_fresh": return { text: "Already up to date", tone: "ok" };
    case "failed": return { text: "Couldn't read the official page", tone: "warn" };
    case "waiting": return { text: "Waiting for another search to finish", tone: "pending" };
    default: return { text: "In the queue", tone: "pending" };
  }
}

const PER_UNIVERSITY = 3;

/** The best-ranked courses, at most three per university so one institution cannot fill the list. */
export function pickCourses(ranked: { programId: string; institutionId: string }[], limit: number): string[] {
  const perInstitution = new Map<string, number>();
  const picked: string[] = [];
  for (const { programId, institutionId } of ranked) {
    if (picked.length >= limit) break;
    const n = perInstitution.get(institutionId) ?? 0;
    if (n >= PER_UNIVERSITY) continue;
    perInstitution.set(institutionId, n + 1);
    picked.push(programId);
  }
  return picked;
}
