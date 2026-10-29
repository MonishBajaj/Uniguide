import type { CompareVerdict, ProfileComparison as Row } from "@uniguide/matching";

const TEXT: Record<CompareVerdict, string> = { meets: "Meets the published minimum", below: "Below the published minimum", unknown: "Cannot compare yet" };

/** Grade and language against each course's published minimums. Presentational: the page supplies the rows. */
export function ProfileComparison({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="text-muted">Shortlist a course to compare your profile with its published requirements.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-surface-2">
          <tr><th scope="col" className="p-3">Course</th><th scope="col" className="p-3">Grade</th><th scope="col" className="p-3">English test</th><th scope="col" className="p-3">Published admit rate</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.programId} className="border-t border-border align-top">
              <th scope="row" className="p-3 font-semibold">{r.title}</th>
              <td className="p-3">{TEXT[r.grade]}</td>
              <td className="p-3">{TEXT[r.language]}</td>
              <td className="p-3">{r.admitRate === null ? "Not published" : `${Math.round(r.admitRate * 100)}% of applicants (a university figure, not your chance)`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
