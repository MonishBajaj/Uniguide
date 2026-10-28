"use server";

import { DEFAULT_WEIGHTS, matchPrograms, type Weights } from "@uniguide/matching";
import { aiBlocked, logRun } from "@/lib/ai-usage";
import { explainMatch } from "@/lib/assistant";
import { loadCurrentCycles, loadFx, toProgramInput, toStudentProfile } from "@/lib/catalog";
import { getUser } from "@/lib/supabase/server";

export type Explanation = { ok: boolean; text: string };

/** Re-runs the deterministic scorer for one course and asks Haiku to put its output into words. */
export async function explain(programId: string): Promise<Explanation> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, text: "Sign in first." };
  const blocked = await aiBlocked(supabase);
  if (blocked) return { ok: false, text: blocked };
  const [{ data: profile }, { data: scores }, { data: card }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("test_scores").select("*"),
    supabase.from("program_cards").select("*").eq("id", programId).single(),
  ]);
  if (!profile || !card) return { ok: false, text: "Course not found." };
  const cycle = (await loadCurrentCycles(supabase, [programId])).get(programId);
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...((profile.preferences as { weights?: Partial<Weights> })?.weights ?? {}) };
  const [r] = matchPrograms([toProgramInput(card, cycle)], toStudentProfile(profile, scores ?? []), { now: new Date(), fx: await loadFx(supabase) }, weights).results;
  if (!r) return { ok: false, text: "Nothing to explain." };

  const facts = {
    course: card.title,
    institution: card.institution_name,
    set_aside: r.excluded,
    reasons_set_aside: r.exclusions.map((e) => e.reason),
    requirements: r.eligibility.checks.map((c) => ({ kind: c.kind, result: c.result, reason: c.reason })),
    suitability_out_of_100: r.fit.score,
    data_known_percent: Math.round(r.fit.dataCoverage * 100),
    suitability_parts: r.fit.components.map((c) => ({ criterion: c.criterion, weight: c.weight, value: c.value == null ? "unknown" : Math.round(c.value * 100) })),
    base_cost: r.cost.lines.length ? Math.round(r.cost.base) : "unknown",
    cost_currency: r.cost.currency,
    cost_complete: r.cost.complete,
  };
  let run;
  try {
    run = await explainMatch(facts);
  } catch {
    return { ok: false, text: "Explanations are unavailable right now." };
  }
  await logRun(supabase, user.id, "match_explanation", run);
  if (!run.text) {
    // Fall back to the scorer's own words if the model added anything it was not given.
    return { ok: true, text: [...r.exclusions.map((e) => e.reason), ...r.eligibility.checks.map((c) => c.reason)].join(" ") };
  }
  return { ok: true, text: run.text };
}
