import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { daysUntil, deadlineText, isFuture, label } from "@/lib/format";
import { getRoles } from "@/lib/roles";
import { getUser } from "@/lib/supabase/server";
import { courseOf } from "@/lib/own-application";
import { Building2, Download, Users, ChevronRight, Calendar } from "lucide-react";

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
        .select("id, user_id, status, decision, own_title, own_institution, program_cycles(programs(title)), checklist_items(done, deadlines(due_at, timezone, precision))")
        .in("user_id", students.map((s) => s.student_id))
    : { data: [] };

  const summary = (studentId: string) => {
    const mine = (apps ?? []).filter((a) => a.user_id === studentId);
    const items = mine.flatMap((a) => a.checklist_items);
    const next = mine
      .flatMap((a) => a.checklist_items.filter((i) => !i.done && i.deadlines && isFuture(i.deadlines.due_at)).map((i) => ({ d: i.deadlines!, title: courseOf(a).title })))
      .sort((x, y) => x.d.due_at.localeCompare(y.d.due_at))[0];
    return { count: mine.length, done: items.filter((i) => i.done).length, total: items.length, next, statuses: mine.map((a) => a.decision ?? a.status) };
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Counselor Dashboard</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Student Roster</h1>
            <p className="mt-2 text-sm text-muted max-w-xl leading-relaxed">
              Students who chose to share progress with {roles.orgs.map((o) => o.name).join(" and ")}. Read-only access; students can revoke sharing at any time.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/agency/export" prefetch={false} className="btn btn-secondary btn-sm gap-1.5">
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </Link>
            <Link href="/agency/team" className="btn btn-secondary btn-sm gap-1.5">
              <Users className="h-4 w-4" />
              <span>Team Settings</span>
            </Link>
          </div>
        </div>
      </header>

      {students.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-12">
          <p className="text-sm text-muted">No students are currently sharing their journey. Share your organization invite code to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface ambient-shadow">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2/60 border-b border-border text-xs uppercase tracking-wider font-bold text-muted">
              <tr>
                <th scope="col" className="p-4">Student</th>
                <th scope="col" className="p-4">Applications</th>
                <th scope="col" className="p-4">Checklist Progress</th>
                <th scope="col" className="p-4">Next Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {students.map((s) => {
                const sm = summary(s.student_id);
                return (
                  <tr key={s.id} className="hover:bg-surface-2/20 transition-colors">
                    <td className="p-4 font-medium">
                      <Link href={`/agency/${s.student_id}`} className="font-serif font-bold text-base text-primary hover:text-secondary hover:underline">
                        {s.display_name}
                      </Link>
                    </td>
                    <td className="p-4 text-xs font-semibold">
                      {sm.count} {sm.count === 1 ? "Program" : "Programs"}
                    </td>
                    <td className="p-4 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">{sm.done} / {sm.total}</span>
                        {sm.total ? (
                          <div className="h-1.5 w-16 bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-verified rounded-full" style={{ width: `${Math.round((sm.done / sm.total) * 100)}%` }} />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-4 text-xs">
                      {sm.next ? (
                        <div className="flex items-center gap-1.5 text-secondary font-medium">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{deadlineText(sm.next.d.due_at, sm.next.d.timezone, sm.next.d.precision)}</span>
                        </div>
                      ) : (
                        <span className="text-muted">No upcoming deadlines</span>
                      )}
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
