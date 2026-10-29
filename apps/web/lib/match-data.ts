import "server-only";
import { DEFAULT_WEIGHTS, type Weights } from "@uniguide/matching";
import type { Enums } from "@uniguide/db-types";
import { loadCurrentCycles, loadFx, toProgramInput, toStudentProfile } from "@/lib/catalog";
import type { createClient } from "@/lib/supabase/server";
import { applyTrack, type TrackTargets } from "@/lib/tracks";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Everything the matcher needs for one student: profile, candidate courses with facts, FX, weights.
 * A track (1.4) swaps in its own targets and budget.
 */
export async function loadMatchInputs(supabase: Supabase, userId: string, track: TrackTargets | null = null) {
  const [{ data: stored }, { data: scores }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    supabase.from("test_scores").select("*"),
  ]);
  const profile = stored ? applyTrack(stored, track) : null;
  if (!profile || profile.target_levels.length === 0) return null;
  const { data: cards } = await supabase.rpc("search_programs", {
    p_levels: profile.target_levels as Enums<"program_level">[],
    p_countries: profile.target_countries.length ? profile.target_countries : undefined,
    p_limit: 200,
  });
  const candidates = cards ?? [];
  const cycles = await loadCurrentCycles(supabase, candidates.map((c) => c.id!));
  const weights: Weights = { ...DEFAULT_WEIGHTS, ...((profile.preferences as { weights?: Partial<Weights> })?.weights ?? {}) };
  return {
    profile,
    student: toStudentProfile(profile, scores ?? []),
    candidates,
    cycles,
    programs: candidates.map((card) => toProgramInput(card, cycles.get(card.id!))),
    fx: await loadFx(supabase),
    weights,
  };
}
