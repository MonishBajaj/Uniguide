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
    case "incomplete": return { text: "Read, but a deadline, cost or requirement is missing", tone: "warn" };
    case "waiting": return { text: "Waiting for another search to finish", tone: "pending" };
    default: return { text: "In the queue", tone: "pending" };
  }
}

/** How many universities a search queues (the worker tries them in order), and how many complete courses it wants. */
export const QUEUE = 30;
export const TARGET_COMPLETE = 10;

/** The universities of a ranked pool, each once and in the order first seen, at most `limit`. */
export function pickInstitutions(ranked: { programId: string; institutionId: string }[], limit: number): string[] {
  return Array.from(new Set(ranked.map((r) => r.institutionId))).slice(0, limit);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One line for the progress page: what was checked, what was kept, and an honest note when a finished search fell short. */
export function progressSummary(p: { tried: number; kept: number; status: string }): string {
  if (p.status === "done" && p.kept === 0) return "We could not find a university with complete information yet.";
  if (p.status === "done" && p.kept < TARGET_COMPLETE) {
    return `We found ${plural(p.kept, "complete course", "complete courses")} after checking ${plural(p.tried, "university", "universities")}.`;
  }
  return `Checked ${plural(p.tried, "university", "universities")}, kept ${plural(p.kept, "course", "courses")}.`;
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

/** How a course is named on the progress page. A course still waiting for approval is hidden from the student by row security. */
export function describeItem(program: { title: string; institutions: { name: string } | null } | null): { title: string; subtitle: string } {
  if (!program) return { title: "Suggested course", subtitle: "Our team is checking it before it appears in your matches." };
  return { title: program.title, subtitle: program.institutions?.name ?? "" };
}
