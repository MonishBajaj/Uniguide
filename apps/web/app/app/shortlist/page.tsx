import type { Metadata } from "next";
import type { Tables } from "@uniguide/db-types";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { ProfileComparison } from "@/components/profile-comparison";
import { ProgramCard } from "@/components/program-card";
import { ShortlistAdvice } from "@/components/shortlist-advice";
import { cardDeadline } from "@/lib/card-deadline";
import { loadCurrentCycles, loadFx, toStudentProfile } from "@/lib/catalog";
import { money, shortDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { intakeName, openIntakes } from "@/lib/intakes";
import { shortlistPanels } from "@/lib/shortlist-panels";
import { getUser } from "@/lib/supabase/server";
import { startApplyingTo } from "../tracker/actions";
import { chooseIntake, removeFromShortlist } from "./actions";
import { MergeLocalShortlist } from "./merge-local";

export const metadata: Metadata = { title: "Shortlist" };

export default async function ShortlistPage() {
  const { supabase, user } = await getUser();
  const { t: all } = await getLocale();
  const t = all.journey.panels;
  const { data: rows } = await supabase.from("shortlists").select("program_id, cycle_id").order("created_at");
  const ids = (rows ?? []).map((r) => r.program_id);
  const { data: cards } = ids.length
    ? await supabase.from("program_cards").select("*").in("id", ids)
    : { data: [] };
  const cycles = await loadCurrentCycles(supabase, ids);
  // Each course's application, if it's tracked, for the "I'm applying" button (J3.2).
  const { data: apps } = ids.length
    ? await supabase
        .from("applications")
        .select("id, status, cycle_id, checklist_items(done, kind), program_cycles!inner(program_id, intake_year, intake_term)")
        .in("program_cycles.program_id", ids)
        .neq("status", "withdrawn")
    : { data: [] };
  const appFor = new Map((apps ?? []).map((a) => [a.program_cycles.program_id, a]));
  // Every intake of each course, for the intake choice (J5.7).
  const { data: allCycles } = ids.length
    ? await supabase.from("program_cycles").select("id, program_id, label, intake_year, intake_term, deadlines(kind, due_at, status, published)").in("program_id", ids)
    : { data: [] };
  const now = new Date();
  const intakesFor = (programId: string) => openIntakes((allCycles ?? []).filter((c) => c.program_id === programId), now);
  const chosenFor = new Map((rows ?? []).map((r) => [r.program_id, r.cycle_id]));
  const ti = all.journey.intakeChoice;

  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-4xl font-semibold">Shortlist</h1>
        <p className="mt-2 text-muted">Courses you shortlist move up our checking queue, so their facts get verified first.</p>
      </header>
      <MergeLocalShortlist />
      {(cards ?? []).length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">{all.journey.empty.shortlistTitle}</h2>
          <p className="mt-2 text-muted">{all.journey.empty.shortlistBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/app/match" className="btn btn-primary">{all.journey.empty.seeMatches}</Link>
            <Link href="/courses" className="btn btn-secondary">{all.journey.empty.search}</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {cards!.map((card) => {
              return (
                <div key={card.id} className="grid gap-2">
                  <ProgramCard card={card} signedIn showShortlist={false} deadline={cardDeadline(cycles.get(card.id!)?.deadlines)} />
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const app = appFor.get(card.id!);
                      if (app && app.status !== "shortlisted") {
                        return (
                          <Link href={`/app/tracker/${app.id}#checklist`} className="btn btn-secondary btn-sm">
                            {all.journey.applying.already} · {all.journey.applying.openChecklist}
                          </Link>
                        );
                      }
                      return (
                        <form action={startApplyingTo.bind(null, card.id!)}>
                          <button className="btn btn-primary btn-sm">
                            {all.journey.applying.button}
                            <span className="sr-only">: {card.title}</span>
                          </button>
                        </form>
                      );
                    })()}
                    <form action={removeFromShortlist.bind(null, card.id!)}>
                      <button className="btn btn-secondary btn-sm">
                        Remove<span className="sr-only">: {card.title}</span>
                      </button>
                    </form>
                  </div>
                  {(() => {
                    const app = appFor.get(card.id!);
                    const open = intakesFor(card.id!);
                    const chosen = chosenFor.get(card.id!) ?? null;
                    if (open.length < 2 || (app && app.status !== "shortlisted")) return null;
                    const current = chosen ?? app?.cycle_id ?? null;
                    const ticked = app ? app.checklist_items.filter((i) => i.done && i.kind !== "custom").length : 0;
                    return (
                      <form action={chooseIntake.bind(null, card.id!)} className="grid gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
                        <fieldset className="grid gap-2">
                          <legend className="font-semibold">{ti.title}<span className="sr-only">: {card.title}</span></legend>
                          <p className="text-muted">{chosen && app ? ti.chosen(intakeName(app.program_cycles)) : ti.intro}</p>
                          {open.map((o) => (
                            <label key={o.id} className="flex flex-wrap items-center gap-2">
                              <input type="radio" name="cycle_id" value={o.id} required defaultChecked={o.id === current} className="size-4" />
                              <span>{o.name} · {ti.applyBy(shortDate(o.applyBy))}</span>
                              <FactBadge status={o.status as Parameters<typeof FactBadge>[0]["status"]} />
                            </label>
                          ))}
                        </fieldset>
                        {ticked > 0 ? (
                          <label className="flex items-start gap-2">
                            <input type="checkbox" name="confirm" required className="mt-0.5 size-4" />
                            <span>{ti.confirm(ticked)}</span>
                          </label>
                        ) : null}
                        <button className="btn btn-secondary btn-sm justify-self-start">
                          {ti.choose}<span className="sr-only">: {card.title}</span>
                        </button>
                      </form>
                    );
                  })()}
                </div>
              );
            })}
          </div>
          <Panels supabase={supabase} userId={user!.id} cards={cards!} cycles={cycles} t={t} offers={all.offers} />
        </>
      )}
    </div>
  );
}

async function Panels({
  supabase,
  userId,
  cards,
  cycles,
  t,
  offers,
}: {
  supabase: Awaited<ReturnType<typeof getUser>>["supabase"];
  userId: string;
  cards: Tables<"program_cards">[];
  cycles: Awaited<ReturnType<typeof loadCurrentCycles>>;
  t: Awaited<ReturnType<typeof getLocale>>["t"]["journey"]["panels"];
  offers: Awaited<ReturnType<typeof getLocale>>["t"]["offers"];
}) {
  const ids = cards.map((c) => c.id!);
  const institutions = [...new Set(cards.map((c) => c.institution_id!))];
  const [{ data: profile }, { data: scores }, fx, { data: stats }, { data: assistantships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("test_scores").select("*"),
    loadFx(supabase),
    supabase.from("program_stats").select("program_id, admit_rate, status, cycle_label").in("program_id", ids).order("cycle_label", { ascending: false }),
    supabase.from("institution_facts").select("institution_id, program_id").eq("kind", "assistantship").eq("published", true).in("institution_id", institutions),
  ]);
  if (!profile) return null;
  const admitRates = new Map<string, { rate: number; status: string }>();
  for (const s of stats ?? []) if (!admitRates.has(s.program_id)) admitRates.set(s.program_id, { rate: Number(s.admit_rate), status: s.status });
  const funding = new Map<string, number>();
  for (const card of cards) {
    const n = (assistantships ?? []).filter((f) => f.institution_id === card.institution_id && (f.program_id === null || f.program_id === card.id)).length;
    funding.set(card.id!, n);
  }
  const budget = profile.budget_amount != null && profile.budget_currency ? { amount: Number(profile.budget_amount), currency: profile.budget_currency } : null;
  const { advice, comparison, costs } = shortlistPanels({
    cards,
    cycles,
    student: toStudentProfile(profile, scores ?? []),
    budget,
    fx,
    admitRates,
    funding,
    now: new Date(),
  });

  return (
    <>
      <section id="advice" aria-labelledby="advice-title" className="grid gap-3 scroll-mt-24">
        <h2 id="advice-title" className="text-2xl font-semibold">{t.adviceTitle}</h2>
        <p className="max-w-[680px] text-muted">{t.adviceIntro}</p>
        <ShortlistAdvice advice={advice} />
      </section>

      <section id="comparison" aria-labelledby="comparison-title" className="grid gap-3 scroll-mt-24">
        <h2 id="comparison-title" className="text-2xl font-semibold">{t.comparisonTitle}</h2>
        <p className="max-w-[680px] text-muted">{t.comparisonIntro}</p>
        <ProfileComparison rows={comparison} scrollLabel={t.comparisonTable} />
      </section>

      <section id="costs" aria-labelledby="costs-title" className="grid gap-3 scroll-mt-24">
        <h2 id="costs-title" className="text-2xl font-semibold">{t.costsTitle}</h2>
        <p className="max-w-[680px] text-muted">{t.costsIntro}</p>
        {budget ? null : (
          <p className="text-sm">
            {t.costsNoBudget} <Link href="/app/profile#budget" className="underline underline-offset-2">{t.addBudget}</Link>
          </p>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {costs.map(({ programId, title, cost, inBudgetCurrency }) => (
            <li key={programId} className="grid content-start gap-2 rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="font-semibold">{title}</p>
              {cost.currency && cost.lines.length ? (
                <>
                  <dl className="grid gap-1">
                    <div>
                      <dt className="text-muted">{offers.expected}</dt>
                      <dd className="text-xl font-semibold">{money(cost.base, cost.currency)}</dd>
                      <dd className="text-muted">{offers.range(money(cost.low, cost.currency), money(cost.high, cost.currency))}</dd>
                    </div>
                    {cost.converted ? (
                      <div>
                        <dt className="text-muted">{offers.about(cost.converted.currency)}</dt>
                        <dd className="font-semibold">{money(cost.converted.amount, cost.converted.currency)}</dd>
                        <dd className="text-xs text-muted">{offers.rate(cost.converted.rate.source, shortDate(cost.converted.rate.asOf))}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {budget && inBudgetCurrency !== null && inBudgetCurrency > budget.amount ? (
                    <p className="font-semibold text-conflicting">{offers.overBudget}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(cost.lines.map((l) => l.status))].map((s) => <FactBadge key={s} status={s} />)}
                  </div>
                  {!cost.complete ? <p className="text-xs text-unverified">{offers.lowerBound(cost.missing.join(", "))}</p> : null}
                </>
              ) : (
                <p className="text-muted">{t.noCosts}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
