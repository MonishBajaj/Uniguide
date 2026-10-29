import type { Metadata } from "next";
import { getUser } from "@/lib/supabase/server";
import { jobProgress } from "./actions";
import { FindUniversitiesButton } from "./find-button";
import { ProgressView } from "./progress";

export const metadata: Metadata = { title: "Finding universities" };

export default async function MatchingPage() {
  const { supabase } = await getUser();
  const { data: job } = await supabase.from("enrichment_jobs").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const initial = job ? await jobProgress(job.id) : null;
  return (
    <div className="grid gap-8">
      <header>
        <h1 className="text-4xl font-semibold">Finding universities for you</h1>
        <p className="mt-2 max-w-[680px] text-muted">
          We pick courses that fit your profile and read their official pages for deadlines, requirements and fees. Anything we read is shown as unverified until a person checks it.
        </p>
      </header>
      {job && initial ? (
        <ProgressView jobId={job.id} initial={initial} />
      ) : (
        <div className="grid gap-3">
          <p>You have not started a search yet.</p>
          <FindUniversitiesButton />
        </div>
      )}
    </div>
  );
}
