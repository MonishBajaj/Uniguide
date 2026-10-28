import type { Metadata } from "next";
import { label } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { deleteTestScore } from "./actions";
import { CvReader, ProfileForm, TestScoreForm } from "./forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { supabase, user } = await getUser();
  const [{ data: profile }, { data: scores }, { data: consent }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("test_scores").select("*").order("taken_on", { ascending: false }),
    supabase.from("consents").select("id").eq("kind", "ai_processing").is("withdrawn_at", null).limit(1).maybeSingle(),
  ]);
  if (!profile) return <p>Profile not found.</p>;

  return (
    <div className="grid gap-12">
      <header>
        <h1 className="text-4xl font-semibold">Your profile</h1>
        <p className="mt-2 text-muted">Used to check requirements and rank courses. Nothing here is shared with universities.</p>
      </header>

      <section aria-labelledby="cv" className="grid gap-4 rounded-2xl bg-surface p-6">
        <h2 id="cv" className="text-lg font-semibold">Fill in faster from your CV</h2>
        <CvReader hasConsent={Boolean(consent)} />
      </section>

      <ProfileForm profile={profile} />

      <section aria-labelledby="scores" className="grid gap-4 rounded-2xl bg-surface p-6">
        <h2 id="scores" className="text-lg font-semibold">Test scores</h2>
        {(scores ?? []).length === 0 ? (
          <p className="text-sm text-muted">No scores yet. Add language tests and admissions tests with their date and version.</p>
        ) : (
          <ul className="grid gap-2">
            {scores!.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-background p-3">
                <span>
                  <span className="font-semibold">{label(s.exam)}</span> {s.total}
                  {s.exam_version ? ` (${s.exam_version})` : ""}
                  <span className="text-sm text-muted">
                    {Object.entries((s.sections as Record<string, number>) ?? {}).map(([k, v]) => ` · ${k} ${v}`)}
                    {s.taken_on ? ` · taken ${s.taken_on}` : ""}
                  </span>
                </span>
                <form action={deleteTestScore.bind(null, s.id)}>
                  <button className="btn btn-secondary btn-sm">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <TestScoreForm />
      </section>
    </div>
  );
}
