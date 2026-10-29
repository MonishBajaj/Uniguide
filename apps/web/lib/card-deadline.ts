import { nextDeadline, type DeadlineFact } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";
import { toDeadlineFact } from "@/lib/deadline-fact";
import { daysUntil } from "@/lib/format";

/** The next open application deadline of a course's current intake, for its card. */
export function cardDeadline(deadlines: Tables<"deadlines">[] | undefined, now = new Date()): DeadlineFact | null {
  return nextDeadline((deadlines ?? []).map(toDeadlineFact), now);
}

/** "Closes today", "Closes tomorrow" or "Closes in N days", counted to the published date. */
export function closesInText(deadline: Pick<DeadlineFact, "dueAt">, now = new Date()): string {
  const days = daysUntil(deadline.dueAt, now);
  return days <= 0 ? "Closes today" : days === 1 ? "Closes tomorrow" : `Closes in ${days} days`;
}
