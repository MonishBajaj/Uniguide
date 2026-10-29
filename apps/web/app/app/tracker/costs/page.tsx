import type { Metadata } from "next";
import Link from "next/link";
import { approximateTotal, COST_KINDS, totalsByCurrency, type CostKind } from "@/lib/application-costs";
import { loadFx } from "@/lib/catalog";
import { money, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { removeCost } from "../actions";
import { CostForm } from "../cost-form";

export const metadata: Metadata = { title: "Application costs" };

export default async function CostsPage() {
  const { supabase, user } = await getUser();
  const [{ data: costs }, { data: apps }, { data: profile }, fx] = await Promise.all([
    supabase
      .from("application_costs")
      .select("id, kind, amount, currency, paid_on, note, application_id")
      .order("paid_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("applications").select("id, program_cycles(programs(title, institutions(name)))"),
    supabase.from("profiles").select("budget_currency").eq("user_id", user!.id).single(),
    loadFx(supabase),
  ]);
  const titles = new Map(
    (apps ?? []).map((a) => [a.id, `${a.program_cycles?.programs?.title ?? "Course"}, ${a.program_cycles?.programs?.institutions?.name ?? ""}`]),
  );
  const rows = (costs ?? []).map((c) => ({ ...c, amount: Number(c.amount) }));
  const totals = totalsByCurrency(rows);
  const budgetCurrency = profile?.budget_currency ?? null;
  const overall = budgetCurrency && totals.some((t) => t.currency !== budgetCurrency) ? approximateTotal(totals, budgetCurrency, fx) : null;

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/tracker" className="text-sm text-muted underline underline-offset-2">Tracker</Link>
        <h1 className="mt-2 text-4xl font-semibold">Application costs</h1>
        <p className="mt-2 max-w-2xl text-muted">What you have paid while applying: application fees, sending scores, exams and deposits. Only you can see this.</p>
      </header>

      <section aria-labelledby="totals" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="totals" className="text-lg font-semibold">Spent so far</h2>
        {totals.length === 0 ? (
          <p className="text-muted">Nothing recorded yet.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-6">
              {totals.map((t) => (
                <li key={t.currency}><span className="text-2xl font-semibold">{money(t.amount, t.currency)}</span></li>
              ))}
            </ul>
            {overall ? (
              <p className="text-sm text-muted">
                About {money(overall.amount, overall.currency)} in all, at the latest stored exchange rates
                {overall.missing.length ? `, not counting ${overall.missing.join(", ")} (no rate yet)` : ""}.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="add" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="add" className="text-lg font-semibold">Add a cost</h2>
        <CostForm applications={[...titles].map(([id, title]) => ({ id, title }))} defaultCurrency={budgetCurrency ?? "USD"} />
      </section>

      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Every cost you recorded</caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Paid</th>
                <th scope="col" className="p-3">What</th>
                <th scope="col" className="p-3">For</th>
                <th scope="col" className="p-3 text-right">Amount</th>
                <th scope="col" className="p-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3">{c.paid_on ? shortDate(c.paid_on) : "Not dated"}</td>
                  <td className="p-3">{COST_KINDS[c.kind as CostKind] ?? c.kind}{c.note ? <span className="block text-muted">{c.note}</span> : null}</td>
                  <td className="p-3">{c.application_id ? titles.get(c.application_id) : <span className="text-muted">Not one application</span>}</td>
                  <td className="p-3 text-right font-semibold">{money(c.amount, c.currency)}</td>
                  <td className="p-3">
                    <form action={removeCost.bind(null, c.id)}><button className="btn btn-secondary btn-sm">Remove</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
