import { FactBadge } from "@/components/facts";
import { InstitutionFactList } from "@/components/institution-fact-list";
import { type InstitutionFact, groupByKind } from "@/lib/institution-facts";

type WorkRule = { id: string; title: string; hoursPerWeek: number | null; status: string; evidenceQuote: string | null; link: string | null };

/** Assistantships and campus jobs for the course, plus the destination's part time work rule. Hidden when empty. */
export function FundingAndWork({ facts, workRules }: { facts: InstitutionFact[]; workRules: WorkRule[] }) {
  const groups = groupByKind(facts, ["assistantship", "on_campus_work"]);
  if (groups.length === 0 && workRules.length === 0) return null;
  return (
    <section aria-labelledby="funding" className="mt-12 grid gap-4">
      <h2 id="funding" className="text-2xl font-semibold">Funding and work while you study</h2>
      {groups.map((g) => <InstitutionFactList key={g.kind} kind={g.kind} facts={g.facts} />)}
      {workRules.map((r) => (
        <div key={r.id} className="grid gap-1 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{r.title}</p>
            <FactBadge status={r.status as "verified" | "unverified" | "conflicting" | "unknown"} />
          </div>
          {r.hoursPerWeek ? <p>Up to {r.hoursPerWeek} hours a week during study</p> : null}
          {r.evidenceQuote ? <q className="text-sm text-muted italic">{r.evidenceQuote}</q> : null}
          {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">Official page</a> : null}
        </div>
      ))}
    </section>
  );
}
