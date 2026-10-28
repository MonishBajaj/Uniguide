import type { DeadlineFact } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last instant the deadline is still open. Date-only deadlines run to the end of that day. */
export function closesAt(deadline: DeadlineFact): Date {
  const due = new Date(deadline.dueAt);
  if (deadline.precision === "date") return new Date(due.getTime() + DAY_MS - 1);
  if (deadline.precision === "month") {
    return new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() + 1, 1) - 1);
  }
  return due;
}

/**
 * The instant to count down to. For date-only deadlines this is the start of the day, which is
 * the conservative choice when the hour is not published.
 */
export function countdownTo(deadline: DeadlineFact): Date {
  return new Date(deadline.dueAt);
}

export function applicationDeadlines(deadlines: DeadlineFact[]): DeadlineFact[] {
  return deadlines.filter((d) => d.kind === "application" || d.kind === "priority");
}

export function nextDeadline(deadlines: DeadlineFact[], now: Date): DeadlineFact | null {
  const open = applicationDeadlines(deadlines)
    .filter((d) => closesAt(d) >= now)
    .sort((a, b) => countdownTo(a).getTime() - countdownTo(b).getTime());
  return open[0] ?? null;
}
