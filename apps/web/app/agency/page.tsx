import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil, deadlineText, isFuture, label } from "@/lib/format";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your students" };

export default async function AgencyPage() {
  const { supabase, user } = await getUser();
  const roles = await getRoles(supabase, user!.id);
  if (roles.orgs.length === 0) notFound();

  // RLS returns only active shares for this counselor's organisations, and only those students' rows.
  const { data: shares } = await supabase
    .from("agency_shares")
    .select("id, student_id, display_name, granted_at, org_id")
    .is("revoked_at", null)
    .order("display_name");
  const students = [...new Map((shares ?? []).map((s) => [s.student_id, s])).values()];
  const { data: apps } = students.length
    ? await supabase
        .from("applications")
        .select("id, user_id, status, decision, program_cycles(programs(title)), checklist_items(done, deadlines(due_at, timezone, precision))")
        .in("user_id", students.map((s) => s.student_id))
    : { data: [] };

  const summary = (studentId: string) => {
    const mine = (apps ?? []).filter((a) => a.user_id === studentId);
    const items = mine.flatMap((a) => a.checklist_items);
    const next = mine
      .flatMap((a) => a.checklist_items.filter((i) => !i.done && i.deadlines && isFuture(i.deadlines.due_at)).map((i) => ({ d: i.deadlines!, title: a.program_cycles?.programs?.title })))
      .sort((x, y) => x.d.due_at.localeCompare(y.d.due_at))[0];
    return { count: mine.length, done: items.filter((i) => i.done).length, total: items.length, next, statuses: mine.map((a) => a.decision ?? a.status) };
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Your students</h1>
        <p className="max-w-2xl text-muted">
          Students who chose to share with {roles.orgs.map((o) => o.name).join(" and ")}. Read only; a student can stop
          sharing at any time. Give students your invite code so they can share from their account.
        </p>
      </header>
      {students.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-muted">No students are sharing yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Student</th>
                <th scope="col" className="p-3">Applications</th>
                <th scope="col" className="p-3">Checklist</th>
                <th scope="col" className="p-3">Next deadline</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const sum = summary(s.student_id);
                return (
                  <tr key={s.student_id} className="border-t border-border align-top">
                    <td className="p-3">
                      <Link href={`/agency/${s.student_id}`} className="font-semibold underline-offset-2 hover:underline">{s.display_name}</Link>
                    </td>
                    <td className="p-3">
                      {sum.count}
                      {sum.statuses.length ? <span className="block text-muted">{[...new Set(sum.statuses)].map(label).join(", ")}</span> : null}
                    </td>
                    <td className="p-3">{sum.total ? `${sum.done} of ${sum.total} done` : "Nothing yet"}</td>
                    <td className="p-3">
                      {sum.next ? (
                        <>
                          {deadlineText(sum.next.d.due_at, sum.next.d.timezone, sum.next.d.precision)}
                          <span className="block text-muted">{sum.next.title} · {daysUntil(sum.next.d.due_at)} days</span>
                        </>
                      ) : "None open"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
