import type { JourneyInput } from "@uniguide/journey";

/** A due date that is a published deadline reads in that deadline's own time zone; anything else in UTC. */
export function dueTimezone(dueAt: string | null, input: JourneyInput): string {
  if (!dueAt) return "UTC";
  for (const app of input.applications) for (const d of app.deadlines) if (d.dueAt === dueAt) return d.timezone;
  return "UTC";
}
