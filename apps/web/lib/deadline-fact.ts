import type { DeadlineFact } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";

/** A deadlines row as the matching engine's DeadlineFact. */
export const toDeadlineFact = (d: Tables<"deadlines">): DeadlineFact => ({
  id: d.id,
  status: d.status,
  applicantCategory: d.applicant_category,
  kind: d.kind,
  dueAt: d.due_at,
  precision: d.precision,
  timezone: d.timezone,
});
