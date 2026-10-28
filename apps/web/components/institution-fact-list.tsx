import { FactBadge } from "@/components/facts";
import { label } from "@/lib/format";
import { describeAmount, type InstitutionFact } from "@/lib/institution-facts";

/** Facts of one kind: title, published amount, details, status badge, and the official page and quote. */
export function InstitutionFactList({ kind, facts }: { kind?: string; facts: InstitutionFact[] }) {
  return (
    <div className="grid gap-2">
      {kind ? <h3 className="text-sm font-semibold text-muted">{label(kind)}</h3> : null}
      <ul className="grid gap-3">
        {facts.map((f) => {
          const amount = describeAmount(f);
          return (
            <li key={f.id} className="grid gap-1 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{f.title}</p>
                <FactBadge status={f.status as "verified" | "unverified" | "conflicting" | "unknown"} />
              </div>
              {amount ? <p className="text-lg">{amount}</p> : null}
              {f.hoursPerWeek ? <p className="text-sm">Up to {f.hoursPerWeek} hours a week</p> : null}
              {f.details ? <p className="text-sm text-muted">{f.details}</p> : null}
              <q className="text-sm text-muted italic">{f.evidenceQuote}</q>
              {f.link ? <a href={f.link} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">Official page</a> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
