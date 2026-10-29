import { toCsv } from "@/lib/csv";
import { daysUntil, deadlineText, isFuture, label } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";

/** The same rows the dashboard shows (students who shared, their applications and checklist), as CSV. No writing. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const { data: memberships } = await supabase.from("org_members").select("role").eq("user_id", user.id);
  if (!(memberships ?? []).some((m) => m.role === "owner" || m.role === "counselor")) return new Response("Not allowed.", { status: 403 });

  const { data: shares } = await supabase.from("agency_shares").select("student_id, display_name").is("revoked_at", null).order("display_name");
  const students = [...new Map((shares ?? []).map((s) => [s.student_id, s])).values()];
  const { data: apps } = students.length
    ? await supabase
        .from("applications")
        .select("user_id, status, decision, program_cycles(programs(title)), checklist_items(done, deadlines(due_at, timezone, precision))")
        .in("user_id", students.map((s) => s.student_id))
    : { data: [] };

  const rows = students.map((s) => {
    const mine = (apps ?? []).filter((a) => a.user_id === s.student_id);
    const items = mine.flatMap((a) => a.checklist_items);
    const next = mine
      .flatMap((a) => a.checklist_items.filter((i) => !i.done && i.deadlines && isFuture(i.deadlines.due_at)).map((i) => ({ d: i.deadlines!, title: a.program_cycles?.programs?.title })))
      .sort((x, y) => x.d.due_at.localeCompare(y.d.due_at))[0];
    return {
      student: s.display_name,
      applications: mine.length,
      statuses: [...new Set(mine.map((a) => label(a.decision ?? a.status)))].join("; "),
      checklist_done: items.filter((i) => i.done).length,
      checklist_total: items.length,
      next_deadline: next ? deadlineText(next.d.due_at, next.d.timezone, next.d.precision) : "",
      next_deadline_course: next?.title ?? "",
      days_left: next ? daysUntil(next.d.due_at) : "",
    };
  });
  const csv = toCsv(rows, ["student", "applications", "statuses", "checklist_done", "checklist_total", "next_deadline", "next_deadline_course", "days_left"]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="students.csv"' } });
}
