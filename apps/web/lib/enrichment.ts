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

/** Enough to search with: a level, a country and a subject. Anything less would pick courses at random. */
export function readyForFirstSearch(p: { target_levels: string[]; target_countries: string[]; target_fields: string[] }): boolean {
  return p.target_levels.length > 0 && p.target_countries.length > 0 && p.target_fields.length > 0;
}

const QUEUED_NOTICE_AFTER_S = 60;
const STALLED_AFTER_S = 180;

/** A note for the progress page when nothing has moved for a while, so a stopped worker never looks like a hang. */
export function waitNotice(status: string, createdAt: string, heartbeatAt: string | null, now: Date): string | null {
  const age = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 1000;
  if (status === "queued" && age(createdAt) > QUEUED_NOTICE_AFTER_S) {
    return "Your search is saved, but our worker has not picked it up yet. It will start as soon as it is free. You can leave this page and come back.";
  }
  if (status === "running" && heartbeatAt && age(heartbeatAt) > STALLED_AFTER_S) {
    return "This is taking longer than usual. The search is still saved and will carry on.";
  }
  return null;
}
