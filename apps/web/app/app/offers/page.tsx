import type { Metadata } from "next";
import Link from "next/link";
import { costScenarios } from "@uniguide/matching";
import { FactBadge } from "@/components/facts";
import { loadCycleById, loadFx, toProgramInput } from "@/lib/catalog";
import { label, money, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { firstReply, daysToReply, replyText, REACTIONS, tallyGutChecks, type GutCheck as Check, type Reaction } from "@/lib/decision-day";
import { Term } from "@/components/term";
import { GutCheck } from "./gut-check";
import { DecisionMatrix } from "./matrix";

export const metadata: Metadata = { title: "Compare offers" };

const DEFAULT_CRITERIA = [
  { id: "content", label: "Course content", weight: 4 },
  { id: "career", label: "Career prospects", weight: 4 },
  { id: "place", label: "City and living", weight: 3 },
  { id: "funding", label: "Funding certainty", weight: 3 },
];

export default async function OffersPage() {
  const { supabase, user } = await getUser();
  const [{ data: apps }, { data: profile }, { data: matrix }, fx] = await Promise.all([
    supabase
      .from("applications")
      .select("id, cycle_id, decision, awarded_aid, awarded_aid_currency, deposit_due_at, program_cycles(label, program_id)")
      .in("decision", ["admitted", "waitlisted"])
      .order("created_at"),
    supabase.from("profiles").select("budget_amount, budget_currency").eq("user_id", user!.id).single(),
    supabase.from("decision_matrices").select("criteria, scores, gut_checks").maybeSingle(),
    loadFx(supabase),
  ]);
  const offers = apps ?? [];
  const programIds = offers.map((a) => a.program_cycles!.program_id);
  const { data: cards } = programIds.length
    ? await supabase.from("program_cards").select("*").in("id", programIds)
    : { data: [] };
  const cycles = await Promise.all(offers.map((a) => loadCycleById(supabase, a.cycle_id)));

  const rows = offers.map((app, i) => {
    const card = cards?.find((c) => c.id === app.program_cycles!.program_id);
    const program = card ? toProgramInput(card, cycles[i] ?? undefined) : null;
    const cost = program
      ? costScenarios(program, { fx }, {
          budgetCurrency: profile?.budget_currency,
          awardedAid: app.awarded_aid && app.awarded_aid_currency ? [{ amount: Number(app.awarded_aid), currency: app.awarded_aid_currency }] : [],
        })
      : null;
    return { app, card, cost };
  });
  const admitted = rows.filter((r) => r.app.decision === "admitted");
  const titleOf = (r: (typeof rows)[number]) => r.card?.title ?? "Course";
  const first = firstReply(admitted.map((r) => ({ title: titleOf(r), due: r.app.deposit_due_at })));
  const tally = tallyGutChecks((matrix?.gut_checks as Check[] | undefined) ?? []);
  const budget = profile?.budget_amount && profile.budget_currency ? { amount: Number(profile.budget_amount), currency: profile.budget_currency } : null;

  return (
    <div className="grid gap-10">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Compare your offers</h1>
        <p className="max-w-2xl text-muted">
          The full cost of finishing each course, from the published fees and living costs, minus only the funding written
          in your offer. A <Term id="conditional_offer">conditional offer</Term> counts here too; check its conditions. Record decisions and funding on each application in the <Link href="/app/tracker" className="underline underline-offset-2">tracker</Link>.
        </p>
      </header>

      {first ? (
        <section aria-labelledby="decision-day" className="grid gap-1 rounded-2xl border border-accent/40 bg-surface p-6">
          <h2 id="decision-day" className="text-sm font-semibold tracking-wide text-muted uppercase">Decision day</h2>
          <p className="text-2xl font-semibold">
            {first.days === 0 ? "Your first reply is due today" : `Your first reply is due in ${first.days} day${first.days === 1 ? "" : "s"}`}
          </p>
          <p className="text-muted">{first.title}, by {shortDate(first.due)}. Check the date in your offer letter.</p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-muted">
          No offers yet. When you hear back, open the application in your tracker and record the result; admitted and
          waitlisted courses appear here.
        </p>
      ) : (
        <section aria-labelledby="cost" className="grid gap-4">
          <h2 id="cost" className="text-2xl font-semibold">True cost to finish</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ app, card, cost }) => (
              <article key={app.id} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-6">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label(app.decision)}</p>
                  <h3 className="text-lg font-semibold">
                    <Link href={`/app/tracker/${app.id}`} className="underline-offset-2 hover:underline">{card?.title ?? "Course"}</Link>
                  </h3>
                  <p className="text-sm text-muted">{card?.institution_name}</p>
                </div>
                {cost?.currency ? (
                  <dl className="grid content-start gap-2 text-sm">
                    <div>
                      <dt className="text-muted">Expected total (low to high)</dt>
                      <dd className="text-2xl font-semibold">{money(cost.base, cost.currency)}</dd>
                      <dd className="text-muted">{money(cost.low, cost.currency)} to {money(cost.high, cost.currency)}</dd>
                    </div>
                    {cost.converted ? (
                      <div>
                        <dt className="text-muted">About, in {cost.converted.currency}</dt>
                        <dd className="font-semibold">
                          {money(cost.converted.amount, cost.converted.currency)}
                          {budget && budget.currency === cost.converted.currency && cost.converted.amount > budget.amount ? (
                            <span className="ml-2 text-conflicting">over your budget</span>
                          ) : null}
                        </dd>
                        <dd className="text-xs text-muted">Rate from {cost.converted.rate.source}, {shortDate(cost.converted.rate.asOf)}. Approximate.</dd>
                      </div>
                    ) : null}
                    {cost.aidApplied > 0 ? (
                      <div>
                        <dt className="text-muted">Funding in your offer, subtracted</dt>
                        <dd>{money(cost.aidApplied, cost.currency)}</dd>
                      </div>
                    ) : null}
                    {app.deposit_due_at ? (
                      <div>
                        <dt className="text-muted">Reply or <Term id="deposit">deposit</Term> due</dt>
                        <dd className="font-semibold">{shortDate(app.deposit_due_at)}</dd>
                        <dd className="text-muted">{replyText(daysToReply(app.deposit_due_at))}</dd>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(cost.lines.map((l) => l.status))].map((s) => <FactBadge key={s} status={s} />)}
                    </div>
                    {!cost.complete ? (
                      <p className="text-xs text-unverified">Lower bound: missing {cost.missing.join(", ")}.</p>
                    ) : null}
                    {cost.assumptions.map((a) => <p key={a} className="text-xs text-muted">{a}</p>)}
                  </dl>
                ) : (
                  <p className="text-sm text-muted">No published fees for this intake yet, so we cannot total it. Check the official page.</p>
                )}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted">
            Funding you have only applied for, or assistantships not yet offered, are never subtracted.
          </p>
        </section>
      )}

      {admitted.length > 0 ? (
        <p className="text-sm">
          Made your choice? <Link href="/app/departure" className="font-semibold underline underline-offset-2">Plan what to arrange before you leave</Link>.
        </p>
      ) : null}

      {admitted.length > 0 || rows.length > 1 ? (
        <section aria-labelledby="matrix" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
          <div>
            <h2 id="matrix" className="text-2xl font-semibold">Decision matrix</h2>
            <p className="max-w-2xl text-sm text-muted">
              Your own weights and scores, private to you. Cost is shown above from published facts; use these rows for
              the things only you can judge.
            </p>
          </div>
          <div className="grid gap-3 border-b border-border pb-6">
            <h3 className="text-lg font-semibold">Gut check</h3>
            <p className="max-w-2xl text-sm text-muted">
              Flip a coin between your offers and notice your first reaction. Relief or disappointment tells you what you
              already want; it is a feeling to weigh, not a way to decide.
            </p>
            {admitted.length > 1 ? (
              <GutCheck offers={admitted.map((r) => ({ id: r.app.id, title: titleOf(r) }))} />
            ) : (
              <p className="text-sm">You need at least two offers to compare.</p>
            )}
            {tally.size ? (
              <ul className="grid gap-1 text-sm">
                {admitted.filter((r) => tally.has(r.app.id)).map((r) => (
                  <li key={r.app.id}>
                    <span className="font-semibold">{titleOf(r)}</span>:{" "}
                    {(Object.keys(REACTIONS) as Reaction[]).filter((k) => tally.get(r.app.id)![k]).map((k) => `${REACTIONS[k].toLowerCase()} ${tally.get(r.app.id)![k]}×`).join(", ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <DecisionMatrix
            offers={rows.map(({ app, card }) => ({ id: app.id, title: card?.title ?? "Course" }))}
            initialCriteria={(matrix?.criteria as typeof DEFAULT_CRITERIA | undefined)?.length ? (matrix!.criteria as typeof DEFAULT_CRITERIA) : DEFAULT_CRITERIA}
            initialScores={(matrix?.scores as Record<string, Record<string, number>>) ?? {}}
          />
        </section>
      ) : null}
    </div>
  );
}
