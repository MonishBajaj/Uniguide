import type { Metadata } from "next";
import { countryName, label } from "@/lib/format";
import { profileChecklist } from "@/lib/profile-completeness";
import { getUser } from "@/lib/supabase/server";
import Link from "next/link";
import { FindUniversitiesButton } from "../matching/find-button";
import { getLocale } from "@/lib/i18n/server";
import { EXAMS } from "@/lib/fields";
import { deleteTestPlan, deleteTestScore, removeTrack, saveTestPlan, setAiConsent } from "./actions";
import { CvReader, ProfileForm, TestScoreForm, TrackForm } from "./forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: PageProps<"/app/profile">) {
  const { supabase, user } = await getUser();
  const planInvalid = (await searchParams).plan === "invalid";
  const { t: all } = await getLocale();
  const tp = all.journey.plans;
  const [{ data: profile }, { data: scores }, { data: consent }, { data: tracks }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).single(),
    supabase.from("test_scores").select("*").order("taken_on", { ascending: false }),
    supabase.from("consents").select("id").eq("kind", "ai_processing").is("withdrawn_at", null).limit(1).maybeSingle(),
    supabase.from("tracks").select("*").order("created_at"),
    supabase.from("test_plans").select("id, exam, status, booked_for").eq("user_id", user!.id).order("created_at"),
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

      <section aria-labelledby="find" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 text-sm">
        <h2 id="find" className="text-lg font-semibold">Find universities for me</h2>
        <p className="text-muted">We choose courses that fit this profile and read their official pages for deadlines, requirements and fees. Save your profile first.</p>
        <FindUniversitiesButton />
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

        <div id="test-plans" className="grid scroll-mt-24 gap-3 border-t border-border pt-4">
          <h3 className="font-semibold">{tp.title}</h3>
          <p className="text-sm text-muted">{tp.intro}</p>
          {planInvalid ? <p role="alert" className="text-sm font-semibold text-conflicting">{tp.invalid}</p> : null}
          {(plans ?? []).length === 0 ? (
            <p className="text-sm text-muted">{tp.none}</p>
          ) : (
            <ul className="grid gap-2">
              {plans!.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-background p-3">
                  <span>
                    <span className="font-semibold">{label(p.exam)}</span>: {p.status === "booked" && p.booked_for ? tp.bookedRow(p.booked_for) : tp.notTakenRow}
                  </span>
                  <form action={deleteTestPlan.bind(null, p.id)}>
                    <button className="btn btn-secondary btn-sm">
                      {tp.remove}<span className="sr-only">: {label(p.exam)}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={saveTestPlan} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-semibold">
              {tp.exam}
              <select name="exam" required className="field font-normal">
                {EXAMS.map((e) => <option key={e} value={e}>{label(e)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {tp.status}
              <select name="status" className="field font-normal">
                <option value="not_taken">{tp.notTaken}</option>
                <option value="booked">{tp.booked}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              {tp.bookedFor}
              <input type="date" name="booked_for" className="field font-normal" />
            </label>
            <button className="btn btn-secondary">{tp.save}</button>
          </form>
        </div>
      </section>

      <section id="tracks" aria-labelledby="tracks-title" className="grid scroll-mt-24 gap-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <h2 id="tracks-title" className="text-lg font-semibold">Application tracks</h2>
          <p className="text-sm text-muted">
            Applying for two different things, such as an MS and an MBA? Give each its own levels, countries, subjects and
            budget. The targets above are your Main track. Matches and the tracker can then be viewed one track at a time.
          </p>
        </div>
        {(tracks ?? []).length ? (
          <ul className="grid gap-2">
            {tracks!.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 text-sm">
                <span>
                  <Link href={`/app/match?track=${t.id}`} className="font-semibold underline-offset-2 hover:underline">{t.name}</Link>
                  <span className="text-muted">
                    {" · "}{t.target_levels.map(label).join(", ")}
                    {" · "}{t.target_countries.length ? t.target_countries.map(countryName).join(", ") : "any country"}
                    {t.budget_amount && t.budget_currency ? ` · budget ${Number(t.budget_amount).toLocaleString("en")} ${t.budget_currency}` : ""}
                  </span>
                </span>
                <form action={removeTrack.bind(null, t.id)}>
                  <button className="btn btn-secondary btn-sm" aria-label={`Remove the ${t.name} track`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-semibold">Add a track</summary>
          <div className="mt-4"><TrackForm /></div>
        </details>
      </section>

      <section aria-labelledby="sharing" className="grid gap-2 rounded-2xl border border-border bg-surface p-6 text-sm">
        <h2 id="sharing" className="text-lg font-semibold">Working with a consultancy?</h2>
        <p className="text-muted">You decide whether a counselor can see your plans, and you can stop at any time.</p>
        <Link href="/app/sharing" className="justify-self-start underline underline-offset-2">Manage sharing</Link>
      </section>
    </div>
  );
}
