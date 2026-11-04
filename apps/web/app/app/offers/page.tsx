import type { Metadata } from "next";
import { WelcomePrompt } from "@/components/journey/welcome-prompt";
import { welcomeOf } from "@/lib/onboarding";
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
import { OwnBadge } from "@/components/own-badge";
import { courseOf } from "@/lib/own-application";
import { AfterAccept } from "./after-accept";
import { setDeclined } from "./actions";
import { Award, DollarSign, Calendar, Sparkles } from "lucide-react";

export const metadata: Metadata = { title: "Compare offers" };

const DEFAULT_CRITERIA = [
  { id: "content", label: "Course content", weight: 4 },
  { id: "career", label: "Career prospects", weight: 4 },
  { id: "place", label: "City and living", weight: 3 },
  { id: "funding", label: "Funding certainty", weight: 3 },
];

export default async function OffersPage({ searchParams }: PageProps<"/app/offers">) {
  const welcome = welcomeOf((await searchParams).welcome);
  const { supabase, user } = await getUser();
  const { t: all } = await getLocale();
  const t = all.offers;
  const [{ data: apps }, { data: profile }, { data: matrix }, fx] = await Promise.all([
    supabase
      .from("applications")
      .select("id, cycle_id, decision, awarded_aid, awarded_aid_currency, deposit_due_at, offer_accepted_at, deposit_paid_at, admission_document_received_at, declined_at, own_title, own_institution, program_cycles(label, program_id)")
      .in("decision", ["admitted", "waitlisted"])
      .order("created_at"),
    supabase.from("profiles").select("budget_amount, budget_currency").eq("user_id", user!.id).single(),
    supabase.from("decision_matrices").select("criteria, scores, gut_checks").maybeSingle(),
    loadFx(supabase),
  ]);
  const offers = apps ?? [];
  const programIds = offers.flatMap((a) => (a.program_cycles ? [a.program_cycles.program_id] : []));
  const { data: cards } = programIds.length
    ? await supabase.from("program_cards").select("*").in("id", programIds)
    : { data: [] };
  const cycles = await Promise.all(offers.map((a) => (a.cycle_id ? loadCycleById(supabase, a.cycle_id) : null)));

  const rows = offers.map((app, i) => {
    const card = cards?.find((c) => c.id === app.program_cycles?.program_id);
    const program = card ? toProgramInput(card, cycles[i] ?? undefined) : null;
    const cost = program
      ? costScenarios(program, { fx }, {
          budgetCurrency: profile?.budget_currency,
          awardedAid: app.awarded_aid && app.awarded_aid_currency ? [{ amount: Number(app.awarded_aid), currency: app.awarded_aid_currency }] : [],
        })
      : null;
    const course = card ? { title: card.title!, institution: card.institution_name!, own: false } : courseOf({ own_title: app.own_title, own_institution: app.own_institution });
    return { app, card, cost, course };
  });

  const admitted = rows.filter((r) => r.app.decision === "admitted" && !r.app.declined_at);
  const titleOf = (r: (typeof rows)[number]) => r.course.title;
  const first = firstReply(admitted.map((r) => ({ title: titleOf(r), due: r.app.deposit_due_at })));
  const tally = tallyGutChecks((matrix?.gut_checks as Check[] | undefined) ?? []);
  const budget = profile?.budget_amount && profile.budget_currency ? { amount: Number(profile.budget_amount), currency: profile.budget_currency } : null;

  // After you accept (J5.1): the accepted offer's conditions, deposit and admission document.
  const acceptedRow = rows.find((r) => r.app.offer_accepted_at);
  const others = rows.filter((r) => r !== acceptedRow);
  const { data: conditions } = acceptedRow
    ? await supabase.from("offer_conditions").select("conditions, met_at").eq("application_id", acceptedRow.app.id).maybeSingle()
    : { data: null };

  return (
    <div className="grid gap-10 max-w-5xl mx-auto">
      <WelcomePrompt welcome={welcome} t={all.journey.onboarding} />

      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Award className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Decision Intelligence Hub</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">{t.title}</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">{t.intro}</p>
      </header>

      {acceptedRow ? (
        <AfterAccept
          t={all.journey.enroll}
          app={{
            id: acceptedRow.app.id,
            title: titleOf(acceptedRow),
            depositDueAt: acceptedRow.app.deposit_due_at,
            depositPaidAt: acceptedRow.app.deposit_paid_at,
            documentAt: acceptedRow.app.admission_document_received_at,
            conditions: conditions ? { text: conditions.conditions, metAt: conditions.met_at } : null,
          }}
        />
      ) : null}

      {acceptedRow && others.length ? (
        <section id="others" aria-labelledby="others-title" className="grid scroll-mt-24 gap-4 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
          <h2 id="others-title" className="font-serif text-xl font-bold text-primary mb-2">{all.journey.decline.title}</h2>
          <p className="text-xs text-muted mb-4">{all.journey.decline.intro}</p>
          <ul className="grid gap-3">
            {others.map((r) => (
              <li key={r.app.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-surface-2/50 border border-border/60">
                <span className="font-serif font-bold text-sm text-primary">{titleOf(r)}</span>
                {r.app.declined_at ? (
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted">{all.journey.decline.declinedOn(shortDate(r.app.declined_at))}</span>
                    <form action={setDeclined.bind(null, r.app.id, false)}>
                      <button className="btn btn-secondary btn-sm">{all.journey.decline.undo}<span className="sr-only">: {titleOf(r)}</span></button>
                    </form>
                  </span>
                ) : (
                  <form action={setDeclined.bind(null, r.app.id, true)}>
                    <button className="btn btn-primary btn-sm">{all.journey.decline.declined}<span className="sr-only">: {titleOf(r)}</span></button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {first ? (
        <section aria-labelledby="decision-day" className="rounded-xl bg-primary text-white p-6 sm:p-8 ambient-shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-secondary" />
            <h2 id="decision-day" className="text-xs font-bold tracking-wider uppercase text-white/80">{t.decisionDay}</h2>
          </div>
          <p className="font-serif text-3xl sm:text-4xl font-bold text-white mb-2">
            {first.days === 0 ? t.dueToday : t.dueIn(first.days)}
          </p>
          <p className="text-xs text-white/80">{t.checkLetter(first.title, shortDate(first.due))}</p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-12">
          <h2 className="text-xl font-serif font-bold text-primary">{t.none}</h2>
          <p className="text-xs text-muted mt-2">When you receive decisions or admission letters, record them in your tracker to compare costs and run the decision matrix.</p>
          <Link href="/app/tracker" className="btn btn-secondary btn-sm mt-4">Go to Tracker</Link>
        </div>
      ) : (
        <section aria-labelledby="cost" className="grid gap-6">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-verified" />
            <h2 id="cost" className="font-serif text-2xl font-bold text-primary">{t.trueCost}</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ app, cost, course }) => (
              <article key={app.id} className="rounded-xl border border-border bg-surface p-6 ambient-shadow hover:border-primary/40 transition-all grid content-between gap-4">
                <div>
                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary border border-border/60 inline-block mb-2">
                    {label(app.decision)}
                  </span>
                  <h3 className="font-serif text-lg font-bold text-primary">
                    <Link href={`/app/tracker/${app.id}`} className="hover:text-secondary hover:underline">
                      {course.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-muted mt-0.5">{course.institution}</p>
                  {course.own ? <p className="mt-1"><OwnBadge text={all.journey.own.badge} /></p> : null}
                </div>

                {cost?.currency ? (
                  <div className="rounded-lg bg-surface-2/50 border border-border/60 p-4 grid content-start gap-3 text-xs">
                    <div>
                      <span className="text-muted block text-[11px] uppercase tracking-wider font-semibold">{t.expected}</span>
                      <span className="font-serif text-2xl font-bold text-primary block mt-0.5">{money(cost.base, cost.currency)}</span>
                      <span className="text-muted text-[11px]">{t.range(money(cost.low, cost.currency), money(cost.high, cost.currency))}</span>
                    </div>

                    {cost.converted ? (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-muted block text-[11px]">{t.about(cost.converted.currency)}</span>
                        <span className="font-bold text-primary">
                          {money(cost.converted.amount, cost.converted.currency)}
                          {budget && budget.currency === cost.converted.currency && cost.converted.amount > budget.amount ? (
                            <span className="ml-1.5 text-conflicting font-bold">({t.overBudget})</span>
                          ) : null}
                        </span>
                      </div>
                    ) : null}

                    {cost.aidApplied > 0 ? (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-muted block text-[11px]">{t.aid}</span>
                        <span className="font-semibold text-verified">{money(cost.aidApplied, cost.currency)}</span>
                      </div>
                    ) : null}

                    {app.deposit_due_at ? (
                      <div className="pt-2 border-t border-border/40">
                        <span className="text-muted block text-[11px]">{withTerm(t.replyDue, <Term id="deposit">{t.replyTerm}</Term>)}</span>
                        <span className="font-semibold text-primary">{shortDate(app.deposit_due_at)}</span>
                        <span className="text-muted block text-[11px]">{replyText(daysToReply(app.deposit_due_at))}</span>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-1 pt-2">
                      {[...new Set(cost.lines.map((l) => l.status))].map((s) => <FactBadge key={s} status={s} />)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t.noFees}</p>
                )}
              </article>
            ))}
          </div>

          {/* Gut check & Decision matrix */}
          <div className="mt-8 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow space-y-6">
            <div className="border-b border-border/60 pb-6">
              <h3 className="font-serif text-xl font-bold text-primary">{t.gutCheck}</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">{t.gutIntro}</p>
              <div className="mt-4">
                {admitted.length > 1 ? (
                  <GutCheck offers={admitted.map((r) => ({ id: r.app.id, title: titleOf(r) }))} />
                ) : (
                  <p className="text-xs text-muted">{t.needTwo}</p>
                )}
              </div>
              {tally.size ? (
                <ul className="grid gap-1.5 text-xs pt-3">
                  {admitted.filter((r) => tally.has(r.app.id)).map((r) => (
                    <li key={r.app.id}>
                      <span className="font-semibold text-primary">{titleOf(r)}</span>:{" "}
                      {(Object.keys(REACTIONS) as Reaction[]).filter((k) => tally.get(r.app.id)![k]).map((k) => `${REACTIONS[k].toLowerCase()} ${tally.get(r.app.id)![k]}×`).join(", ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <h2 id="matrix" className="font-serif text-xl font-bold text-primary scroll-mt-24">{t.matrix}</h2>
            <DecisionMatrix
              offers={rows.map(({ app, course }) => ({ id: app.id, title: course.title }))}
              initialCriteria={(matrix?.criteria as typeof DEFAULT_CRITERIA | undefined)?.length ? (matrix!.criteria as typeof DEFAULT_CRITERIA) : DEFAULT_CRITERIA}
              initialScores={(matrix?.scores as Record<string, Record<string, number>>) ?? {}}
            />
          </div>
        </section>
      )}
    </div>
  );
}
