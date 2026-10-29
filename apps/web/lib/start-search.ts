import "server-only";
import { matchPrograms } from "@uniguide/matching";
import { pickCourses, readyForFirstSearch } from "@/lib/enrichment";
import { loadMatchInputs } from "@/lib/match-data";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const COURSES = 10;

/** Picks the best-fitting courses already in the catalog and queues a job so the worker reads their official pages. */
export async function startSearch(supabase: Supabase, userId: string): Promise<{ ok: boolean; message: string }> {
  const inputs = await loadMatchInputs(supabase, userId);
  if (!inputs) return { ok: false, message: "Choose at least the level you want on your profile first." };

  const { results } = matchPrograms(inputs.programs, inputs.student, { now: new Date(), fx: inputs.fx }, inputs.weights);
  const institutionOf = new Map(inputs.candidates.map((c) => [c.id!, c.institution_id!]));
  const ranked = results
    .filter((r) => !r.excluded)
    .map((r) => ({ programId: r.programId, institutionId: institutionOf.get(r.programId) ?? r.programId }));
  const programIds = pickCourses(ranked, COURSES);

  if (programIds.length === 0) {
    const { data: consent } = await supabase.from("consents").select("id").eq("kind", "ai_processing").is("withdrawn_at", null).limit(1).maybeSingle();
    if (!consent) {
      return { ok: false, message: "We have no matching courses in the catalog yet. Turn on AI features on your profile page and we can look further." };
    }
  }

  // The database reads the targets from the stored profile, so nothing the browser sends can change them.
  const { error } = await supabase.rpc("start_enrichment", { p_program_ids: programIds });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("rate_limited")
        ? "You've started enough searches today. Try again tomorrow."
        : "Could not start the search. Try again in a moment.",
    };
  }
  return { ok: true, message: "Search started." };
}

/**
 * Starts the very first search once the profile can drive one. Later saves never start another:
 * the button on the profile page does that. Returns true when a search was queued.
 */
export async function startFirstSearch(supabase: Supabase, userId: string): Promise<boolean> {
  const [{ data: profile }, { data: earlier }] = await Promise.all([
    supabase.from("profiles").select("target_levels, target_countries, target_fields").eq("user_id", userId).maybeSingle(),
    supabase.from("enrichment_jobs").select("id").limit(1).maybeSingle(),
  ]);
  if (!profile || earlier || !readyForFirstSearch(profile)) return false;
  return (await startSearch(supabase, userId)).ok;
}
