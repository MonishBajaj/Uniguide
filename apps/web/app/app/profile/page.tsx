import type { Metadata } from "next";
import { label } from "@/lib/format";
import { profileChecklist } from "@/lib/profile-completeness";
import { getUser } from "@/lib/supabase/server";
import Link from "next/link";
import { deleteTestScore, setAiConsent } from "./actions";
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
  const checklist = profileChecklist(profile, (scores ?? []).length);
  const done = checklist.filter((i) => i.done).length;

  return (
    <div className="grid gap-12">
      <header>
        <h1 className="text-4xl font-semibold">Your profile</h1>
        <p className="mt-2 text-muted">Used to check requirements and rank courses. Nothing here is shared with universities, or with anyone else unless you choose to.</p>
      </header>

      <section aria-labelledby="complete" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="complete" className="text-lg font-semibold">What matching needs from you</h2>
          <p className="font-semibold">{done} of {checklist.length} done</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((done / checklist.length) * 100)}%` }} />
        </div>
        {done === checklist.length ? (
          <p className="text-muted">Everything matching uses is filled in. Keep it current as your plans change.</p>
        ) : (
          <ul className="grid gap-1">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-baseline gap-2">
                <span aria-hidden="true" className={item.done ? "text-verified" : "text-muted"}>{item.done ? "✓" : "○"}</span>
                {item.done ? (
                  <span className="text-muted">{item.label}<span className="sr-only"> (done)</span></span>
                ) : (
                  <span>
                    <a href={item.href} className="underline underline-offset-2">{item.label}</a>
                    <span className="text-muted"> · {item.why}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ai" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 text-sm">
        <h2 id="ai" className="text-lg font-semibold">AI features</h2>
        <p className="text-muted">
          The CV reader, setup chat, course questions and result explanations send the text involved to Anthropic&apos;s
          Claude, which may keep it for up to 30 days. Facts about courses never come from the AI.
        </p>
        <form action={setAiConsent.bind(null, !consent)} className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{consent ? "On" : "Off"}</span>
          <button className="btn btn-secondary btn-sm">{consent ? "Turn off" : "Turn on"}</button>
          {consent ? <Link href="/app/onboarding" className="underline underline-offset-2">Set up your profile by chatting</Link> : null}
        </form>
      </section>

      <section aria-labelledby="cv" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 id="cv" className="text-lg font-semibold">Fill in faster from your CV</h2>
        <CvReader hasConsent={Boolean(consent)} />
      </section>

      <ProfileForm profile={profile} />

      <section id="scores-section" aria-labelledby="scores" className="grid scroll-mt-24 gap-4 rounded-2xl border border-border bg-surface p-6">
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

      <section aria-labelledby="sharing" className="grid gap-2 rounded-2xl border border-border bg-surface p-6 text-sm">
        <h2 id="sharing" className="text-lg font-semibold">Working with a consultancy?</h2>
        <p className="text-muted">You decide whether a counselor can see your plans, and you can stop at any time.</p>
        <Link href="/app/sharing" className="justify-self-start underline underline-offset-2">Manage sharing</Link>
      </section>
    </div>
  );
}
