import type { ShortlistAdvice as Advice } from "@uniguide/matching";

/** Observations about the shortlist. Presentational: the page supplies the advice from shortlistAdvice(). */
export function ShortlistAdvice({ advice }: { advice: Advice[] }) {
  if (advice.length === 0) return <p className="text-muted">Nothing to flag. Your shortlist looks balanced.</p>;
  return (
    <ul className="grid gap-3">
      {advice.map((a) => (
        <li key={a.kind} className="rounded-2xl border border-border bg-surface p-4 text-sm">{a.message}</li>
      ))}
    </ul>
  );
}
