import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { loadCurrentCycles } from "@/lib/catalog";
import { countryName, deadlineText, label, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Requirements and deadlines table",
  description: "Free table of entry requirements, fees and application deadlines, each linked to the official source.",
};

export default async function RequirementsTable() {
  const supabase = await createClient();
  const { data: cards } = await supabase
    .from("program_cards")
    .select("*")
    .in("coverage_tier", ["verified", "extracted"])
    .order("country")
    .order("institution_name")
    .limit(200);
  const cycles = await loadCurrentCycles(supabase, (cards ?? []).map((c) => c.id!));

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Requirements and deadlines</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Every course we have collected facts for. Each value shows whether a person has verified it. Follow the course
        link for sources and quotes.
      </p>
      {(cards ?? []).length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">The first courses are being verified</h2>
          <p className="mt-2 text-muted">The table fills in as courses are checked. <Link href="/courses" className="underline underline-offset-2">Browse listed courses</Link> meanwhile.</p>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Course</th>
                <th scope="col" className="p-3">Country</th>
                <th scope="col" className="p-3">Application deadline</th>
                <th scope="col" className="p-3">English</th>
                <th scope="col" className="p-3">Tuition</th>
              </tr>
            </thead>
            <tbody>
              {cards!.map((card) => {
                const cycle = cycles.get(card.id!);
                const deadline = cycle?.deadlines.filter((d) => d.kind === "application").sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
                const english = cycle?.requirements.find((r) => r.kind === "language_test");
                const tuition = cycle?.cost_items.find((c) => c.kind === "tuition");
                return (
                  <tr key={card.id} className="border-t border-border align-top">
                    <td className="p-3">
                      <Link href={`/courses/${card.slug}`} className="font-semibold underline-offset-2 hover:underline">{card.title}</Link>
                      <div className="text-muted">{card.institution_name}</div>
                    </td>
                    <td className="p-3">{countryName(card.country)}</td>
                    <td className="p-3">
                      {deadline ? (
                        <div className="grid gap-1">
                          {deadlineText(deadline.due_at, deadline.timezone, deadline.precision)}
                          <FactBadge status={deadline.status} />
                        </div>
                      ) : <FactBadge status="unknown" />}
                    </td>
                    <td className="p-3">
                      {english ? (
                        <div className="grid gap-1">
                          {label(english.exam)} {english.min_total}
                          <FactBadge status={english.status} />
                        </div>
                      ) : <FactBadge status="unknown" />}
                    </td>
                    <td className="p-3">
                      {tuition ? (
                        <div className="grid gap-1">
                          {money(Number(tuition.base), tuition.currency)} {label(tuition.basis)}
                          <FactBadge status={tuition.status} />
                        </div>
                      ) : <FactBadge status="unknown" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
