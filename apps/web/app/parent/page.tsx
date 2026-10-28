import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil, deadlineText, isFuture, label } from "@/lib/format";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My child", robots: { index: false } };

/** Read-only view for a parent. RLS limits every query to students linked to this parent; writing and grades are never shared. */
export default async function ParentPage() {
  const { supabase, user } = await getUser();
  if (!user) notFound();
  const { parentOf } = await getRoles(supabase, user.id);
  if (parentOf.length === 0) notFound();

  const studentIds = parentOf.map((l) => l.student_id);
  const [{ data: shortlist }, { data: apps }] = await Promise.all([
    supabase.from("shortlists").select("user_id, programs(slug, title, institutions(name))").in("user_id", studentIds),
    supabase
      .from("applications")
      .select("id, user_id, status, decision, program_cycles(label, programs(slug, title, institutions(name))), checklist_items(id, title, done, sort, deadlines(due_at, timezone, precision))")
      .in("user_id", studentIds),
  ]);

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">My child</h1>
        <p className="max-w-2xl text-muted">
          Progress your child chose to share. Read only. You cannot see their statements, drafts or grades.
        </p>
      </header>

      {parentOf.map((link) => {
        const mine = (apps ?? []).filter((a) => a.user_id === link.student_id);
        const listed = (shortlist ?? []).filter((s) => s.user_id === link.student_id && s.programs);
        const items = mine.flatMap((a) => a.checklist_items);
        const next = mine
          .flatMap((a) => a.checklist_items.filter((i) => !i.done && i.deadlines && isFuture(i.deadlines.due_at)).map((i) => ({ d: i.deadlines!, title: a.program_cycles?.programs?.title })))
          .sort((x, y) => x.d.due_at.localeCompare(y.d.due_at))[0];

        return (
          <section key={link.student_id} aria-labelledby={`s-${link.student_id}`} className="grid gap-6">
            <h2 id={`s-${link.student_id}`} className="text-2xl font-semibold">{link.student_name}</h2>

            <dl className="grid gap-3 rounded-2xl bg-surface p-6 text-sm sm:grid-cols-3">
              <div><dt className="text-muted">Shortlisted courses</dt><dd className="text-lg font-semibold">{listed.length}</dd></div>
              <div><dt className="text-muted">Checklist</dt><dd className="text-lg font-semibold">{items.length ? `${items.filter((i) => i.done).length} of ${items.length} done` : "Nothing yet"}</dd></div>
              <div>
                <dt className="text-muted">Next deadline</dt>
                <dd className="text-lg font-semibold">
                  {next ? deadlineText(next.d.due_at, next.d.timezone, next.d.precision) : "None open"}
                  {next ? <span className="block text-sm font-normal text-muted">{next.title} · {daysUntil(next.d.due_at)} days</span> : null}
                </dd>
              </div>
            </dl>

            <div className="grid gap-3">
              <h3 className="text-lg font-semibold">Applications</h3>
              {mine.length === 0 ? <p className="text-muted">No applications tracked yet.</p> : null}
              {mine.map((a) => {
                const program = a.program_cycles?.programs;
                const sorted = [...a.checklist_items].sort((x, y) => x.sort - y.sort);
                return (
                  <article key={a.id} className="grid gap-2 rounded-2xl bg-surface p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="font-semibold">{program?.title}</h4>
                      <span className="text-sm text-muted">{label(a.decision ?? a.status)}</span>
                    </div>
                    <p className="text-sm text-muted">{program?.institutions?.name} · {a.program_cycles?.label}</p>
                    <ul className="grid gap-1 text-sm">
                      {sorted.map((i) => (
                        <li key={i.id} className={i.done ? "text-muted line-through" : ""}>
                          {i.title}
                          {i.deadlines ? ` · ${deadlineText(i.deadlines.due_at, i.deadlines.timezone, i.deadlines.precision)} (${daysUntil(i.deadlines.due_at)} days)` : ""}
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>

            <div className="grid gap-2">
              <h3 className="text-lg font-semibold">Shortlist</h3>
              {listed.length === 0 ? <p className="text-muted">Nothing shortlisted yet.</p> : null}
              <ul className="grid gap-1 text-sm">
                {listed.map((s) => (
                  <li key={s.programs!.slug}>
                    <Link href={`/courses/${s.programs!.slug}`} className="underline underline-offset-2">{s.programs!.title}</Link>
                    <span className="text-muted"> · {s.programs!.institutions?.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
