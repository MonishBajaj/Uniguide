import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GRADE_SCALES } from "@/lib/fields";
import { countryName, daysUntil, deadlineText, label, money } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student" };

export default async function AgencyStudent({ params }: PageProps<"/agency/[student]">) {
  const { student } = await params;
  const { supabase } = await getUser();
  // Every query is limited by RLS to students with an active share for this counselor.
  const [{ data: share }, { data: profile }, { data: scores }, { data: shortlist }, { data: apps }] = await Promise.all([
    supabase.from("agency_shares").select("display_name, granted_at").eq("student_id", student).is("revoked_at", null).limit(1).maybeSingle(),
    supabase.from("profiles").select("residence_country, home_qualification, grade_value, grade_text, grade_scale, budget_amount, budget_currency, target_levels, target_countries").eq("user_id", student).maybeSingle(),
    supabase.from("test_scores").select("exam, exam_version, total, taken_on").eq("user_id", student),
    supabase.from("shortlists").select("programs(slug, title, institutions(name))").eq("user_id", student),
    supabase
      .from("applications")
      .select("id, status, decision, program_cycles(label, programs(slug, title, institutions(name))), checklist_items(id, title, done, sort, deadlines(due_at, timezone, precision, status))")
      .eq("user_id", student),
  ]);
  if (!share || !profile) notFound();

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12">
      <header>
        <Link href="/agency" className="text-sm text-muted underline underline-offset-2">Your students</Link>
        <h1 className="mt-2 text-4xl font-semibold">{share.display_name}</h1>
        <p className="mt-1 text-sm text-muted">Shared with you. Read only.</p>
      </header>

      <section aria-labelledby="profile" className="grid gap-3 rounded-2xl border border-border bg-surface p-6 text-sm sm:grid-cols-2">
        <h2 id="profile" className="text-lg font-semibold sm:col-span-2">Profile</h2>
        <p><span className="text-muted">Lives in</span> {countryName(profile.residence_country)}</p>
        <p><span className="text-muted">Grade</span> {profile.grade_value ?? profile.grade_text ?? "Not given"} {profile.grade_scale ? `(${GRADE_SCALES[profile.grade_scale] ?? profile.grade_scale})` : ""}</p>
        <p>
          <span className="text-muted">Looking at</span>{" "}
          {profile.target_levels.length ? `${profile.target_levels.map(label).join(", ")} in ${profile.target_countries.map(countryName).join(", ") || "any country"}` : "Not set yet"}
        </p>
        <p><span className="text-muted">Budget</span> {profile.budget_amount && profile.budget_currency ? money(Number(profile.budget_amount), profile.budget_currency) : "Not set"}</p>
        <p className="sm:col-span-2">
          <span className="text-muted">Tests</span>{" "}
          {(scores ?? []).map((s) => `${s.exam.toUpperCase()}${s.exam_version ? ` ${s.exam_version}` : ""} ${s.total ?? ""}`).join(", ") || "None recorded"}
        </p>
      </section>

      <section aria-labelledby="apps" className="grid gap-3">
        <h2 id="apps" className="text-2xl font-semibold">Applications</h2>
        {(apps ?? []).length === 0 ? <p className="text-muted">No applications tracked yet.</p> : null}
        {(apps ?? []).map((a) => {
          const program = a.program_cycles?.programs;
          const items = [...a.checklist_items].sort((x, y) => x.sort - y.sort);
          return (
            <article key={a.id} className="grid gap-2 rounded-2xl border border-border bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{program?.title}</h3>
                <span className="text-sm text-muted">{label(a.decision ?? a.status)}</span>
              </div>
              <p className="text-sm text-muted">{program?.institutions?.name} · {a.program_cycles?.label}</p>
              <ul className="grid gap-1 text-sm">
                {items.map((i) => (
                  <li key={i.id} className={i.done ? "text-muted line-through" : ""}>
                    {i.title}
                    {i.deadlines ? ` · ${deadlineText(i.deadlines.due_at, i.deadlines.timezone, i.deadlines.precision)} (${daysUntil(i.deadlines.due_at)} days)` : ""}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="shortlist" className="grid gap-2">
        <h2 id="shortlist" className="text-2xl font-semibold">Shortlist</h2>
        {(shortlist ?? []).length === 0 ? <p className="text-muted">Nothing shortlisted yet.</p> : null}
        <ul className="grid gap-1 text-sm">
          {(shortlist ?? []).map((s) => s.programs ? (
            <li key={s.programs.slug}>
              <Link href={`/courses/${s.programs.slug}`} className="underline underline-offset-2">{s.programs.title}</Link>
              <span className="text-muted"> · {s.programs.institutions?.name}</span>
            </li>
          ) : null)}
        </ul>
      </section>
    </div>
  );
}
