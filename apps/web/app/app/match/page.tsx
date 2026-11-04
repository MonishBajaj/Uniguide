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
import { Sparkles, SlidersHorizontal, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "My matches" };

const RESULT_STYLE = {
  meets: "text-verified font-bold",
  does_not_meet: "text-conflicting font-bold",
  needs_clarification: "text-unverified font-bold",
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
  const inputs = await loadMatchInputs(supabase, user!.id, track, { completeOnly: true });
  const { lite } = await readDisplay();
  if (!inputs) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow max-w-xl mx-auto text-center py-12">
        <h1 className="text-2xl font-serif font-bold text-primary">{all.journey.empty.profileTitle}</h1>
        <p className="mt-2 text-muted text-sm leading-relaxed">{all.journey.empty.profileBody}</p>
        <Link href="/app/onboarding?screen=3" className="btn btn-coral-bright mt-6 shadow-sm">{all.journey.empty.profileAction}</Link>
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

      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">
              Your Course Matches{track ? `: ${track.name}` : ""}
            </h1>
            <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
              {feasible.length} {feasible.length === 1 ? "course fits" : "courses fit"} your limits, ordered deterministically by suitability to your preferences. Suitability is not your chance of admission.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app/match/what-if"
              className="btn btn-secondary btn-sm gap-1.5 whitespace-nowrap hover:border-primary/40 hover:text-primary"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Simulate What-If</span>
            </Link>
          </div>
        </div>

        {tracks?.length ? (
          <div className="mt-6 pt-4 border-t border-border/60">
            <TrackSwitcher
              href={(v) => (v === "main" ? "/app/match" : `/app/match?track=${v}`)}
              options={[{ value: "main", label: "Main Profile" }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]}
              current={track?.id ?? "main"}
            />
          </div>
        ) : null}
      </header>

      <section id="score-goals" aria-labelledby="score-goals-title" className="grid gap-3 scroll-mt-24">
        <h2 id="score-goals-title" className="font-serif text-xl font-bold text-primary">{all.journey.panels.scoreGoalsTitle}</h2>
        <p className="text-sm text-muted">{all.journey.panels.scoreGoalsIntro}</p>
        <ScoreGoals rows={goals} />
      </section>

      {feasible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-12">
          <h2 className="text-xl font-serif font-bold text-primary">{all.journey.empty.matchTitle}</h2>
          <p className="mt-2 max-w-md mx-auto text-muted text-sm leading-relaxed">{all.journey.empty.matchBody}</p>
          {excluded.length ? <p className="mt-2 text-xs text-muted">{all.journey.empty.whyAside}</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <FindUniversitiesButton label={all.journey.empty.findUniversities} />
            <Link href="/app/match/what-if" className="btn btn-secondary">{all.journey.empty.tryWhatIf}</Link>
            <Link href="/courses" className="btn btn-secondary">{all.journey.empty.browse}</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {feasible.slice(0, listSize(40, lite)).map((r) => {
            const card = byId.get(r.programId)!;
            const cost = r.cost;
            const base = cost.converted ?? (cost.currency ? { amount: cost.base, currency: cost.currency } : null);
            return (
              <ProgramCard key={r.programId} card={card} signedIn>
                <div className="rounded-lg bg-surface-2/60 border border-border/60 p-3.5 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted block text-[11px] uppercase tracking-wider font-semibold">Suitability Score</span>
                    <span className="font-serif text-lg font-bold text-primary block mt-0.5">
                      {r.fit.score == null ? "No preferences" : `${r.fit.score} / 100`}
                    </span>
                    <span className="text-[10px] text-muted">Based on verified facts</span>
                  </div>

                  <div>
                    <span className="text-muted block text-[11px] uppercase tracking-wider font-semibold">Estimated Base Cost</span>
                    <span className="font-serif text-lg font-bold text-primary block mt-0.5">
                      {base && cost.lines.length ? `${cost.converted ? "about " : ""}${money(base.amount, base.currency)}` : "Not published"}
                    </span>
                    {!cost.complete && cost.lines.length ? (
                      <span className="text-[10px] text-unverified block">Incomplete facts</span>
                    ) : null}
                  </div>

                  {showBands ? (
                    <div className="col-span-2 pt-2 border-t border-border/40">
                      <span className="text-muted block text-[11px]">Admissions Band:</span>
                      <span className="font-semibold text-primary">
                        {(() => {
                          const band = admissionBand(statsBy.get(r.programId), r.eligibility.overall, student.classPercentile);
                          return band ? band[0]!.toUpperCase() + band.slice(1) : "Not enough verified data";
                        })()}
                      </span>
                    </div>
                  ) : null}

                  <div className="col-span-2 pt-2 border-t border-border/40 flex items-center justify-between">
                    <span className={`text-xs ${RESULT_STYLE[r.eligibility.overall]}`}>
                      Eligibility: {RESULT_TEXT[r.eligibility.overall]}
                    </span>
                    <ExplainButton programId={r.programId} />
                  </div>
                </div>
              </ProgramCard>
            );
          })}
        </div>
      )}

      {excluded.length > 0 ? (
        <section aria-labelledby="excluded-heading" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow mt-4">
          <h2 id="excluded-heading" className="text-xl font-serif font-bold text-primary mb-2">
            Courses set aside ({excluded.length})
          </h2>
          <p className="text-xs text-muted mb-6">
            These courses were excluded by your stated constraints (budget, destination, test minimums, or delivery mode).
          </p>

          <div className="space-y-6">
            {[...groups.entries()].map(([rule, list]) => (
              <div key={rule} className="rounded-lg border border-border/60 bg-surface-2/40 p-4">
                <h3 className="font-semibold text-sm text-primary mb-2">
                  {RULES[rule]} ({list.length})
                </h3>
                <ul className="grid gap-2 text-xs">
                  {list.slice(0, 5).map((ex) => {
                    const c = byId.get(ex.programId);
                    if (!c) return null;
                    return (
                      <li key={ex.programId} className="flex items-center justify-between gap-2">
                        <Link href={`/courses/${c.slug}`} className="text-primary hover:underline font-medium truncate">
                          {c.institution_name}: {c.title}
                        </Link>
                        <span className="text-muted shrink-0 text-[11px]">{ex.exclusions[0]?.reason}</span>
                      </li>
                    );
                  })}
                  {list.length > 5 ? (
                    <li className="text-muted text-[11px] pt-1">...and {list.length - 5} more</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
