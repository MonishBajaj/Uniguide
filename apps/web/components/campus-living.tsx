import { InstitutionFactList } from "@/components/institution-fact-list";
import { type InstitutionFact, groupByKind } from "@/lib/institution-facts";

const ORDER = ["housing_on_campus", "housing_off_campus", "transit_pass", "parking", "health_insurance"];

/** Housing, transit, parking and insurance as the university publishes them. Hidden when empty. */
export function CampusLiving({ facts }: { facts: InstitutionFact[] }) {
  const groups = groupByKind(facts, ORDER);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="living" className="mt-12 grid gap-4">
      <h2 id="living" className="text-2xl font-semibold">Living there</h2>
      {groups.map((g) => <InstitutionFactList key={g.kind} kind={g.kind} facts={g.facts} />)}
    </section>
  );
}
