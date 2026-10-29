import type { Metadata } from "next";
import Link from "next/link";
import { costScenarios } from "@uniguide/matching";
import { FactBadge } from "@/components/facts";
import { loadCycleById, loadFx, toProgramInput } from "@/lib/catalog";
import { label, money, shortDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { withTerm } from "@/lib/i18n/with-term";
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
  const { t: all } = await getLocale();
  const t = all.offers;
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
        <h1 className="text-4xl font-semibold">{t.title}</h1>
        <p className="max-w-2xl text-muted">
          {t.intro} <Link href="/app/tracker" className="underline underline-offset-2">{t.introLink}</Link>.{" "}
          {withTerm(t.conditional, <Term id="conditional_offer">{t.conditionalTerm}</Term>)}
        </p>
      </header>

      {first ? (
        <section aria-labelledby="decision-day" className="grid gap-1 rounded-2xl border border-accent/40 bg-surface p-6">
          <h2 id="decision-day" className="text-sm font-semibold tracking-wide text-muted uppercase">{t.decisionDay}</h2>
          <p className="text-2xl font-semibold">
            {first.days === 0 ? t.dueToday : t.dueIn(first.days)}
          </p>
          <p className="text-muted">{t.checkLetter(first.title, shortDate(first.due))}</p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-muted">
          {t.none}
        </p>
      ) : (
        <section aria-labelledby="cost" className="grid gap-4">
          <h2 id="cost" className="text-2xl font-semibold">{t.trueCost}</h2>
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
                  <div className="grid content-start gap-2 text-sm">
                    <dl className="grid content-start gap-2">
                      <div>
                        <dt className="text-muted">{t.expected}</dt>
                        <dd className="text-2xl font-semibold">{money(cost.base, cost.currency)}</dd>
                        <dd className="text-muted">{t.range(money(cost.low, cost.currency), money(cost.high, cost.currency))}</dd>
                      </div>
                      {cost.converted ? (
                        <div>
                          <dt className="text-muted">{t.about(cost.converted.currency)}</dt>
                          <dd className="font-semibold">
                            {money(cost.converted.amount, cost.converted.currency)}
                            {budget && budget.currency === cost.converted.currency && cost.converted.amount > budget.amount ? (
                              <span className="ml-2 text-conflicting">{t.overBudget}</span>
                            ) : null}
                          </dd>
                          <dd className="text-xs text-muted">{t.rate(cost.converted.rate.source, shortDate(cost.converted.rate.asOf))}</dd>
                        </div>
                      ) : null}
                      {cost.aidApplied > 0 ? (
                        <div>
                          <dt className="text-muted">{t.aid}</dt>
                          <dd>{money(cost.aidApplied, cost.currency)}</dd>
                        </div>
                      ) : null}
                      {app.deposit_due_at ? (
                        <div>
                          <dt className="text-muted">{withTerm(t.replyDue, <Term id="deposit">{t.replyTerm}</Term>)}</dt>
                          <dd className="font-semibold">{shortDate(app.deposit_due_at)}</dd>
                          <dd className="text-muted">{replyText(daysToReply(app.deposit_due_at))}</dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="flex flex-wrap gap-1">
                      {[...new Set(cost.lines.map((l) => l.status))].map((s) => <FactBadge key={s} status={s} />)}
                    </div>
                    {!cost.complete ? (
                      <p className="text-xs text-unverified">{t.lowerBound(cost.missing.join(", "))}</p>
                    ) : null}
                    {cost.assumptions.map((a) => <p key={a} className="text-xs text-muted">{a}</p>)}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t.noFees}</p>
                )}
              </article>
            ))}
          </div>
          <p className="text-xs text-muted">
            {t.neverSubtracted}
          </p>
        </section>
      )}

      {admitted.length > 0 ? (
        <p className="text-sm">
          {t.madeChoice} <Link href="/app/departure" className="font-semibold underline underline-offset-2">{t.planLeave}</Link>.
        </p>
      ) : null}

      {admitted.length > 0 || rows.length > 1 ? (
        <section aria-labelledby="matrix" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
          <div>
            <h2 id="matrix" className="text-2xl font-semibold">{t.matrix}</h2>
            <p className="max-w-2xl text-sm text-muted">
              {t.matrixIntro}
            </p>
          </div>
          <div className="grid gap-3 border-b border-border pb-6">
            <h3 className="text-lg font-semibold">{t.gutCheck}</h3>
            <p className="max-w-2xl text-sm text-muted">
              {t.gutIntro}
            </p>
            {admitted.length > 1 ? (
              <GutCheck offers={admitted.map((r) => ({ id: r.app.id, title: titleOf(r) }))} />
            ) : (
              <p className="text-sm">{t.needTwo}</p>
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
