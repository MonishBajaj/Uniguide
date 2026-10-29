import type { ScoreGoal } from "@uniguide/matching";
import { label } from "@/lib/format";

type Row = ScoreGoal & { title: string };

/** The gap between the student's best score and each course's published minimum. Presentational; the page supplies the rows. */
export function ScoreGoals({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-muted">Add a test score to see how it compares with each course&apos;s published minimum.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={`${r.programId}-${r.exam}`} className="rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">{r.title} · {label(r.exam)}</p>
          <p className="text-muted">
            {r.met
              ? "Your best score reaches the published minimum."
              : [r.gapTotal > 0 ? `${r.gapTotal} below the overall minimum` : null, ...Object.entries(r.gapSections).map(([s, g]) => `${g} below in ${s}`)].filter(Boolean).join("; ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
