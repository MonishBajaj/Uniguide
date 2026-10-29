import { InstitutionFactList } from "@/components/institution-fact-list";
import { type InstitutionFact, groupByKind } from "@/lib/institution-facts";

const ORDER = ["international_office", "student_societies", "faith_and_culture_facilities"];

/** What the university publishes about student life and support for international students. Hidden when empty. */
export function StudentLife({ facts }: { facts: InstitutionFact[] }) {
  const groups = groupByKind(facts, ORDER);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="student-life" className="mt-12 grid gap-4">
      <h2 id="student-life" className="text-2xl font-semibold">Student life and support</h2>
      {groups.map((g) => <InstitutionFactList key={g.kind} kind={g.kind} facts={g.facts} />)}
    </section>
  );
}
