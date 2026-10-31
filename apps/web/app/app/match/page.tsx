import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { admissionBand, admissionEstimate, matchPrograms, scoreGoals, type AdmissionModelParams, type Exclusion } from "@uniguide/matching";
import { ExplainButton } from "@/components/explain-button";
import { ProgramCard } from "@/components/program-card";
import { ScoreGoals } from "@/components/score-goals";
import { FindUniversitiesButton } from "../matching/find-button";
import { daysUntil, deadlineText, money } from "@/lib/format";
import { asJson } from "@/lib/json";
import { loadMatchInputs } from "@/lib/match-data";
import { listSize } from "@/lib/display";
import { readDisplay } from "@/lib/display-server";
import { getUser } from "@/lib/supabase/server";
import { selectedTrack } from "@/lib/tracks";
import { TrackSwitcher } from "@/components/track-switcher";
import { WelcomePrompt } from "@/components/journey/welcome-prompt";
import { welcomeOf } from "@/lib/onboarding";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "My matches" };

const RESULT_STYLE = {
  meets: "text-verified",
  does_not_meet: "text-conflicting",
  needs_clarification: "text-unverified",
} as const;
const RESULT_TEXT = { meets: "Meets", does_not_meet: "Does not meet", needs_clarification: "Needs checking" } as const;
const RULES: Record<Exclusion["rule"], string> = {
  level: "Different level",
  country: "Country not on your list",
  field: "Different subject",
  delivery: "Format you did not choose",
  deadline_passed: "Deadline has passed",
  budget: "Over your budget",
  ineligible: "A published requirement you do not meet",
};

export default async function MatchPage({ searchParams }: PageProps<"/app/match">) {
  const { supabase, user } = await getUser();
  const { data: tracks } = await supabase.from("tracks").select("*").order("created_at");
  const params = await searchParams;
  const track = selectedTrack(params.track, tracks ?? []);
  const { t: all } = await getLocale();
  const inputs = await loadMatchInputs(supabase, user!.id, track);
  const { lite } = await readDisplay();
  if (!inputs) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold">{all.journey.empty.profileTitle}</h1>
        <p className="mt-2 text-muted">{all.journey.empty.profileBody}</p>
        <Link href="/app/onboarding?screen=3" className="btn btn-primary mt-6">{all.journey.empty.profileAction}</Link>
      </div>
    );
  }
  const { candidates, cycles, student, weights, fx, programs } = inputs;
  const { results, algorithmVersion } = matchPrograms(programs, student, { now: new Date(), fx }, weights);
  const showBands = Boolean((inputs.profile.preferences as { showBands?: boolean }).showBands);
  const { data: stats } = showBands
    ? await supabase.from("program_stats").select("program_id, admit_rate, status, cycle_label").in("program_id", candidates.map((c) => c.id!)).order("cycle_label", { ascending: false })
    : { data: [] };
  const statsBy = new Map<string, { admitRate: number; status: "verified" | "unverified" | "conflicting" | "unknown" }>();
  for (const s of stats ?? []) if (!statsBy.has(s.program_id)) statsBy.set(s.program_id, { admitRate: Number(s.admit_rate), status: s.status });
  // Only a model that passed its holdout and calibration gate is readable (RLS), and only when opted in.
  const { data: model } = showBands
    ? await supabase.from("admission_models").select("params, min_program_n, n_train, holdout_year").maybeSingle()
    : { data: null };
  const countryOf = new Map(candidates.map((c) => [c.id!, c.country!]));
  const estimateFor = (programId: string) =>
    model
      ? admissionEstimate(model.params as unknown as AdmissionModelParams, model.min_program_n, { id: programId, country: countryOf.get(programId) ?? "" }, student)
      : null;

  // Record the run so results can be reproduced: inputs, catalog state and algorithm version.
  const factIds = [...cycles.values()]
    .flatMap((c) => [...c.requirements, ...c.deadlines, ...c.cost_items].map((f) => `${f.id}:${f.current_version_id}:${f.status}`))
    .sort();
  await supabase.from("match_runs").insert({
    user_id: user!.id,
    algorithm_version: algorithmVersion,
    weights: asJson(weights),
    profile_snapshot: asJson(student),
    catalog_hash: createHash("sha256").update(factIds.join("|")).digest("hex"),
    results: asJson(
      results.map((r) => ({
        program: r.programId,
        excluded: r.excluded,
        rules: r.exclusions.map((e) => e.rule),
        eligibility: r.eligibility.overall,
        score: r.fit.score,
      })),
    ),
  });

  const byId = new Map(candidates.map((c) => [c.id!, c]));
  const feasible = results.filter((r) => !r.excluded);
  const excluded = results.filter((r) => r.excluded);
  // Score goals (J3.1): verified test minimums of the courses that fit, or that were set aside only for a requirement,
  // unmet first. Unverified minimums are left out.
  const titleOf = new Map(candidates.map((c) => [c.id!, c.title!]));
  const inReach = new Set(results.filter((r) => !r.excluded || r.exclusions.every((e) => e.rule === "ineligible")).map((r) => r.programId));
  const goals = scoreGoals(
    student.testScores ?? [],
    programs
      .filter((p) => inReach.has(p.id))
      .flatMap((p) =>
        p.requirements
          .filter((q) => q.status === "verified" && q.exam && (q.kind === "language_test" || q.kind === "admissions_test") && (q.minTotal != null || q.minSections))
          .map((q) => ({ programId: p.id, title: titleOf.get(p.id) ?? "", exam: q.exam!, examVersion: q.examVersion ?? null, minTotal: q.minTotal ?? null, minSections: q.minSections ?? null })),
      ),
  )
    .map((g) => ({ ...g, title: titleOf.get(g.programId) ?? "" }))
    .sort((a, b) => Number(a.met) - Number(b.met))
    .slice(0, 12);
  const groups = new Map<Exclusion["rule"], typeof excluded>();
  for (const r of excluded) {
    const rule = r.exclusions[0]!.rule;
    groups.set(rule, [...(groups.get(rule) ?? []), r]);
  }

  return (
    <div className="grid gap-10">
      <WelcomePrompt welcome={welcomeOf(params.welcome)} t={all.journey.onboarding} />
      <header>
        <h1 className="text-4xl font-semibold">Your matches{track ? `: ${track.name}` : ""}</h1>
        {tracks?.length ? (
          <div className="mt-4">
            <TrackSwitcher
              href={(v) => (v === "main" ? "/app/match" : `/app/match?track=${v}`)}
              options={[{ value: "main", label: "Main (your profile)" }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]}
              current={track?.id ?? "main"}
            />
          </div>
        ) : null}
        <p className="mt-2 text-sm"><Link href="/app/match/what-if" className="underline underline-offset-2">Try what if: change your grades, budget or scores and see what moves</Link></p>
        <p className="mt-2 max-w-[680px] text-muted">
          {feasible.length} {feasible.length === 1 ? "course fits" : "courses fit"} your limits, ordered by suitability to your preferences. Suitability is not your
          chance of admission.{" "}
          {excluded.length ? `${excluded.length} ${excluded.length === 1 ? "course was" : "courses were"} set aside; the reasons are below.` : ""}
        </p>
      </header>

      {feasible.length === 0 ? (
        // J3.5: while the catalogue is small, an empty list says so and offers what to do next.
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">{all.journey.empty.matchTitle}</h2>
          <p className="mt-2 max-w-[680px] text-muted">{all.journey.empty.matchBody}</p>
          {excluded.length ? <p className="mt-2 text-muted">{all.journey.empty.whyAside}</p> : null}
          <div className="mt-6 flex flex-wrap items-start gap-3">
            <FindUniversitiesButton label={all.journey.empty.findUniversities} />
            <Link href="/app/match/what-if" className="btn btn-secondary">{all.journey.empty.tryWhatIf}</Link>
            <Link href="/courses" className="btn btn-secondary">{all.journey.empty.browse}</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {feasible.slice(0, listSize(40, lite)).map((r) => {
            const card = byId.get(r.programId)!;
            const cost = r.cost;
            const base = cost.converted ?? (cost.currency ? { amount: cost.base, currency: cost.currency } : null);
            return (
              <ProgramCard key={r.programId} card={card} signedIn>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Suitability</dt>
                    <dd className="font-semibold">
                      {r.fit.score == null ? "No preferences set" : `${r.fit.score} / 100`}
                      <span className="block text-xs font-normal text-muted">{Math.round(r.fit.dataCoverage * 100)}% of the data it needs is known</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Base cost</dt>
                    <dd className="font-semibold">
                      {base && cost.lines.length ? `${cost.converted ? "about " : ""}${money(base.amount, base.currency)}` : "Not yet known"}
                      {!cost.complete && cost.lines.length ? <span className="block text-xs font-normal text-unverified">Incomplete, the real total is higher</span> : null}
                    </dd>
                  </div>
                  {showBands ? (
                    <div className="col-span-2">
                      <dt className="text-muted">Band (low confidence)</dt>
                      <dd className="font-semibold">
                        {(() => {
                          const band = admissionBand(statsBy.get(r.programId), r.eligibility.overall, student.classPercentile);
                          return band ? band[0]!.toUpperCase() + band.slice(1) : "Not enough verified data";
                        })()}
                      </dd>
                      {(() => {
                        const est = estimateFor(r.programId);
                        return est ? (
                          <dd className="text-xs text-muted">
                            Model estimate: about {Math.max(1, Math.min(9, Math.round(est.probability * 10)))} in 10 applicants with a grade
                            like yours, learned from {est.n} shared outcomes for this course. Experimental.
                          </dd>
                        ) : null;
                      })()}
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <dt className="text-muted">Next deadline</dt>
                    <dd className="font-semibold">
                      {r.nextDeadline
                        ? `${deadlineText(r.nextDeadline.dueAt, r.nextDeadline.timezone ?? "UTC", r.nextDeadline.precision)} (${daysUntil(r.nextDeadline.dueAt)} days)`
                        : "Not yet known"}
                    </dd>
                  </div>
                </dl>
                <details className="text-sm">
                  <summary className={`cursor-pointer font-semibold ${RESULT_STYLE[r.eligibility.overall]}`}>
                    Requirements: {RESULT_TEXT[r.eligibility.overall].toLowerCase()}
                  </summary>
                  <ul className="mt-2 grid gap-1">
                    {r.eligibility.checks.map((c, i) => (
                      <li key={i}>
                        <span className={`font-semibold ${RESULT_STYLE[c.result]}`}>{RESULT_TEXT[c.result]}:</span> {c.reason}
                      </li>
                    ))}
                  </ul>
                </details>
                <ExplainButton programId={r.programId} />
              </ProgramCard>
            );
          })}
        </div>
      )}

      <section id="score-goals" aria-labelledby="score-goals-title" className="grid gap-3 scroll-mt-24">
        <h2 id="score-goals-title" className="text-2xl font-semibold">{all.journey.panels.scoreGoalsTitle}</h2>
        <p className="max-w-[680px] text-muted">{all.journey.panels.scoreGoalsIntro}</p>
        <ScoreGoals
          rows={goals}
          empty={
            student.testScores?.length ? (
              all.journey.panels.scoreGoalsNoMinimum
            ) : (
              <Link href="/app/profile#scores-section" className="underline underline-offset-2">{all.journey.panels.scoreGoalsNoScore}</Link>
            )
          }
        />
      </section>

      {lite && feasible.length > listSize(40, lite) ? (
        <p className="text-sm text-muted">
          Showing your top {listSize(40, lite)} because data saver is on. <Link href="/accessibility" className="underline underline-offset-2">Show more</Link>
        </p>
      ) : null}

      {excluded.length ? (
        <section aria-labelledby="excluded">
          <h2 id="excluded" className="text-2xl font-semibold">Set aside, and why</h2>
          <div className="mt-4 grid gap-3">
            {[...groups.entries()].map(([rule, items]) => (
              <details key={rule} className="rounded-2xl border border-border bg-surface p-4">
                <summary className="cursor-pointer font-semibold">{RULES[rule]} ({items.length})</summary>
                <ul className="mt-3 grid gap-2 text-sm">
                  {items.slice(0, 50).map((r) => {
                    const card = byId.get(r.programId)!;
                    return (
                      <li key={r.programId}>
                        <Link href={`/courses/${card.slug}`} className="underline underline-offset-2">{card.title}</Link>, {card.institution_name}
                        <span className="text-muted">: {r.exclusions.map((e) => e.reason).join(" ")}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        </section>
      ) : null}
      <p className="text-xs text-muted">Matching rules version {algorithmVersion}. Showing the first 200 courses for your levels and countries.</p>
    </div>
  );
}
