"use server";

import { redirect } from "next/navigation";
import { matchPrograms } from "@uniguide/matching";
import { pickCourses } from "@/lib/enrichment";
import { loadMatchInputs } from "@/lib/match-data";
import { getUser } from "@/lib/supabase/server";

export type FindState = { ok: boolean; message: string } | null;
export type Progress = {
  stage: string;
  status: string;
  error: string | null;
  items: { programId: string; title: string; institution: string; status: string; detail: string | null }[];
};

const COURSES = 10;

/** Picks the best-fitting courses already in the catalog and queues a job so the worker reads their official pages. */
export async function findUniversities(): Promise<FindState> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const inputs = await loadMatchInputs(supabase, user.id);
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
  redirect("/app/matching");
}

/** The latest state of one of the signed-in student's jobs (row security hides anyone else's). */
export async function jobProgress(jobId: string): Promise<Progress | null> {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: job } = await supabase.from("enrichment_jobs").select("id, status, stage, error").eq("id", jobId).maybeSingle();
  if (!job) return null;
  const { data: items } = await supabase
    .from("enrichment_items")
    .select("program_id, status, detail, programs(title, institutions(name))")
    .eq("job_id", jobId)
    .order("program_id");
  return {
    stage: job.stage,
    status: job.status,
    error: job.error,
    items: (items ?? []).map((i) => ({
      programId: i.program_id,
      title: i.programs?.title ?? "Course",
      institution: i.programs?.institutions?.name ?? "",
      status: i.status,
      detail: i.detail,
    })),
  };
}
