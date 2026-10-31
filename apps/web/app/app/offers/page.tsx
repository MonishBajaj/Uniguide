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
    // An own application (J3.3) has no catalogue card and no published costs: its name is the student's.
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
  // The other offers and waitlist places, to decline once one is accepted (J5.2).
  const others = rows.filter((r) => r !== acceptedRow);
  const { data: conditions } = acceptedRow
    ? await supabase.from("offer_conditions").select("conditions, met_at").eq("application_id", acceptedRow.app.id).maybeSingle()
    : { data: null };

  return (
    <div className="grid gap-10">
      <WelcomePrompt welcome={welcome} t={all.journey.onboarding} />
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">{t.title}</h1>
        <p className="max-w-2xl text-muted">
          {t.intro} <Link href="/app/tracker" className="underline underline-offset-2">{t.introLink}</Link>.{" "}
          {withTerm(t.conditional, <Term id="conditional_offer">{t.conditionalTerm}</Term>)}
        </p>
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
        <section id="others" aria-labelledby="others-title" className="grid scroll-mt-24 gap-3 rounded-2xl border border-border bg-surface p-6">
          <h2 id="others-title" className="text-2xl font-semibold">{all.journey.decline.title}</h2>
          <p className="max-w-2xl text-sm text-muted">{all.journey.decline.intro}</p>
          <ul className="grid gap-2">
            {others.map((r) => (
              <li key={r.app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3">
                <span className="font-semibold">{titleOf(r)}</span>
                {r.app.declined_at ? (
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-muted">{all.journey.decline.declinedOn(shortDate(r.app.declined_at))}</span>
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
            {rows.map(({ app, cost, course }) => (
              <article key={app.id} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-6">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label(app.decision)}</p>
                  <h3 className="text-lg font-semibold">
                    <Link href={`/app/tracker/${app.id}`} className="underline-offset-2 hover:underline">{course.title}</Link>
                  </h3>
                  <p className="text-sm text-muted">{course.institution}</p>
                  {course.own ? <p className="mt-1"><OwnBadge text={all.journey.own.badge} /></p> : null}
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
            offers={rows.map(({ app, course }) => ({ id: app.id, title: course.title }))}
            initialCriteria={(matrix?.criteria as typeof DEFAULT_CRITERIA | undefined)?.length ? (matrix!.criteria as typeof DEFAULT_CRITERIA) : DEFAULT_CRITERIA}
            initialScores={(matrix?.scores as Record<string, Record<string, number>>) ?? {}}
          />
        </section>
      ) : null}
    </div>
  );
}
