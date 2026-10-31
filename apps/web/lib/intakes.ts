import { label } from "@/lib/format";

/** An intake of a course with its deadlines, as the shortlist loads it. */
export interface IntakeCycle {
  id: string;
  label: string;
  intake_year: number;
  intake_term: string;
  deadlines: { kind: string; due_at: string | null; status: string; published?: boolean | null }[];
}

export interface OpenIntake {
  id: string;
  name: string;
  /** The earliest application deadline still ahead. */
  applyBy: string;
  status: string;
}

/** "Autumn 2027", from the intake's term and year. */
export const intakeName = (c: Pick<IntakeCycle, "intake_term" | "intake_year">) => `${label(c.intake_term)} ${c.intake_year}`;

/**
 * The intakes a student can still apply for (journey M5, J5.7): those with a published application deadline ahead
 * whose status is known, soonest first. Matches the snapshot's openCycles.
 */
export function openIntakes(cycles: IntakeCycle[], now: Date): OpenIntake[] {
  return cycles
    .flatMap((c) => {
      const ahead = c.deadlines
        .filter((d) => d.kind === "application" && d.published !== false && d.status !== "unknown" && d.due_at && Date.parse(d.due_at) > now.getTime())
        .sort((a, b) => a.due_at!.localeCompare(b.due_at!));
      return ahead.length ? [{ id: c.id, name: intakeName(c), applyBy: ahead[0]!.due_at!, status: ahead[0]!.status }] : [];
    })
    .sort((a, b) => a.applyBy.localeCompare(b.applyBy));
}
