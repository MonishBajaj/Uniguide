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
import { BookmarkCheck, Sparkles, TrendingUp, DollarSign } from "lucide-react";

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
    <div className="grid gap-8 max-w-6xl mx-auto">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookmarkCheck className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Verified Shortlist</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Shortlist</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Courses you shortlist move up our checking queue, so their facts get verified first.
        </p>
      </header>
      <MergeLocalShortlist />
      {(cards ?? []).length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 sm:p-12 text-center ambient-shadow max-w-xl mx-auto">
          <BookmarkCheck className="h-10 w-10 text-muted mx-auto mb-4 opacity-50" />
          <h2 className="font-serif text-2xl font-bold text-primary">{all.journey.empty.shortlistTitle}</h2>
          <p className="mt-2 text-sm text-muted leading-relaxed">{all.journey.empty.shortlistBody}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/app/match" className="btn btn-primary">{all.journey.empty.seeMatches}</Link>
            <Link href="/courses" className="btn btn-secondary">{all.journey.empty.search}</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {cards!.map((card) => {
              return (
                <div key={card.id} className="grid content-between gap-3 p-4 rounded-xl border border-border bg-surface ambient-shadow">
                  <ProgramCard card={card} signedIn showShortlist={false} deadline={cardDeadline(cycles.get(card.id!)?.deadlines)} />
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
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
                      <button className="btn btn-secondary btn-sm text-muted hover:text-foreground">
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
      <section id="advice" aria-labelledby="advice-title" className="grid gap-4 scroll-mt-24 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-secondary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Strategic Balance</span>
          </div>
          <h2 id="advice-title" className="font-serif text-2xl font-bold text-primary">{t.adviceTitle}</h2>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">{t.adviceIntro}</p>
        </div>
        <ShortlistAdvice advice={advice} />
      </section>

      <section id="comparison" aria-labelledby="comparison-title" className="grid gap-4 scroll-mt-24 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-secondary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Requirements Matrix</span>
          </div>
          <h2 id="comparison-title" className="font-serif text-2xl font-bold text-primary">{t.comparisonTitle}</h2>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">{t.comparisonIntro}</p>
        </div>
        <ProfileComparison rows={comparison} scrollLabel={t.comparisonTable} />
      </section>

      <section id="costs" aria-labelledby="costs-title" className="grid gap-4 scroll-mt-24 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-secondary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Financial Comparison</span>
          </div>
          <h2 id="costs-title" className="font-serif text-2xl font-bold text-primary">{t.costsTitle}</h2>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">{t.costsIntro}</p>
          {budget ? null : (
            <p className="mt-2 text-xs text-muted">
              {t.costsNoBudget} <Link href="/app/profile#budget" className="font-semibold underline underline-offset-2 hover:text-primary">{t.addBudget}</Link>
            </p>
          )}
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          {costs.map(({ programId, title, cost, inBudgetCurrency }) => (
            <li key={programId} className="grid content-between gap-3 rounded-xl border border-border/70 bg-surface-2/40 p-5 text-sm">
              <div>
                <p className="font-serif font-bold text-base text-primary mb-2">{title}</p>
                {cost.currency && cost.lines.length ? (
                  <div className="space-y-3">
                    <dl className="grid gap-1">
                      <div>
                        <dt className="text-xs text-muted">{offers.expected}</dt>
                        <dd className="font-serif text-2xl font-bold text-primary">{money(cost.base, cost.currency)}</dd>
                        <dd className="text-xs text-muted">{offers.range(money(cost.low, cost.currency), money(cost.high, cost.currency))}</dd>
                      </div>
                      {cost.converted ? (
                        <div className="pt-2 border-t border-border/60">
                          <dt className="text-xs text-muted">{offers.about(cost.converted.currency)}</dt>
                          <dd className="font-serif text-lg font-bold text-primary">{money(cost.converted.amount, cost.converted.currency)}</dd>
                          <dd className="text-[11px] text-muted">{offers.rate(cost.converted.rate.source, shortDate(cost.converted.rate.asOf))}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {budget && inBudgetCurrency !== null && inBudgetCurrency > budget.amount ? (
                      <p className="text-xs font-bold text-conflicting bg-conflicting/10 px-2.5 py-1 rounded-md">{offers.overBudget}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {[...new Set(cost.lines.map((l) => l.status))].map((s) => <FactBadge key={s} status={s} />)}
                    </div>
                    {!cost.complete ? <p className="text-xs text-unverified">{offers.lowerBound(cost.missing.join(", "))}</p> : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t.noCosts}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
