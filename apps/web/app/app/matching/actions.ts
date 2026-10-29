"use server";

import { redirect } from "next/navigation";
import { describeItem } from "@/lib/enrichment";
import { startSearch } from "@/lib/start-search";
import { getUser } from "@/lib/supabase/server";

export type FindState = { ok: boolean; message: string } | null;
export type Progress = {
  stage: string;
  status: string;
  error: string | null;
  createdAt: string;
  heartbeatAt: string | null;
  items: { programId: string; title: string; institution: string; status: string; detail: string | null }[];
};

/** The button on the profile page: queue a search now. */
export async function findUniversities(): Promise<FindState> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const result = await startSearch(supabase, user.id);
  if (!result.ok) return result;
  redirect("/app/matching");
}

/** The latest state of one of the signed-in student's jobs (row security hides anyone else's). */
export async function jobProgress(jobId: string): Promise<Progress | null> {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: job } = await supabase.from("enrichment_jobs").select("id, status, stage, error, created_at, heartbeat_at").eq("id", jobId).maybeSingle();
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
    createdAt: job.created_at,
    heartbeatAt: job.heartbeat_at,
    items: (items ?? []).map((i) => {
      const named = describeItem(i.programs);
      return { programId: i.program_id, title: named.title, institution: named.subtitle, status: i.status, detail: i.detail };
    }),
  };
}
