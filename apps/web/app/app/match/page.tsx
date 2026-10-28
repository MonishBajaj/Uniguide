import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { DEFAULT_WEIGHTS, matchPrograms, type Exclusion, type Weights } from "@uniguide/matching";
import type { Enums } from "@uniguide/db-types";
import { ProgramCard } from "@/components/program-card";
import { loadCurrentCycles, loadFx, toProgramInput, toStudentProfile } from "@/lib/catalog";
import { daysUntil, deadlineText, money } from "@/lib/format";
import { asJson } from "@/lib/json";
import { getUser } from "@/lib/supabase/server";

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

export default async function MatchPage() {
  const { supabase, user } = await getUser();
  const [{ data: profile }, { data: scores }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("test_scores").select("*"),
  ]);
  if (!profile || profile.target_levels.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-8">
        <h1 className="text-2xl font-semibold">Tell us what you want to study first</h1>
        <p className="mt-2 text-muted">Choose at least the level you want, and ideally countries, subject and budget.</p>
        <Link href="/app/profile" className="btn btn-primary mt-6">Complete your profile</Link>
      </div>
    );
  }

  const { data: cards } = await supabase.rpc("search_programs", {
    p_levels: profile.target_levels as Enums<"program_level">[],
    p_countries: profile.target_countries.length ? profile.target_countries : undefined,
    p_limit: 200,
  });
  const candidates = cards ?? [];
  const cycles = await loadCurrentCycles(supabase, candidates.map((c) => c.id!));
  const fx = await loadFx(supabase);
  const student = toStudentProfile(profile, scores ?? []);
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...((profile.preferences as { weights?: Partial<Weights> })?.weights ?? {}) };
  const { results, algorithmVersion } = matchPrograms(
    candidates.map((card) => toProgramInput(card, cycles.get(card.id!))),
    student,
    { now: new Date(), fx },
    weights,
  );

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
  const groups = new Map<Exclusion["rule"], typeof excluded>();
  for (const r of excluded) {
    const rule = r.exclusions[0]!.rule;
    groups.set(rule, [...(groups.get(rule) ?? []), r]);
  }

  return (
    <div className="grid gap-10">
      <header>
        <h1 className="text-4xl font-semibold">Your matches</h1>
        <p className="mt-2 max-w-[680px] text-muted">
          {feasible.length} courses fit your limits, ordered by suitability to your preferences. Suitability is not your
          chance of admission. {excluded.length} courses were set aside; the reasons are below.
        </p>
      </header>

      {feasible.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8">
          <h2 className="text-xl font-semibold">Nothing fits all your limits yet</h2>
          <p className="mt-2 text-muted">Look at why courses were set aside below, or widen your countries or budget.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {feasible.slice(0, 40).map((r) => {
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
              </ProgramCard>
            );
          })}
        </div>
      )}

      {excluded.length ? (
        <section aria-labelledby="excluded">
          <h2 id="excluded" className="text-2xl font-semibold">Set aside, and why</h2>
          <div className="mt-4 grid gap-3">
            {[...groups.entries()].map(([rule, items]) => (
              <details key={rule} className="rounded-2xl bg-surface p-4">
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
