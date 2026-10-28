import type { Metadata } from "next";
import Link from "next/link";
import { checkedAgo } from "@/lib/application-events";
import { daysUntil, deadlineText } from "@/lib/format";
import { scoreNeeds, sentProgress } from "@/lib/score-sending";
import { getUser } from "@/lib/supabase/server";
import { setStatus } from "./actions";

export const metadata: Metadata = { title: "Tracker" };

const COLUMNS = [
  { status: "shortlisted", label: "Shortlisted" },
  { status: "preparing", label: "Preparing" },
  { status: "submitted", label: "Submitted" },
  { status: "decided", label: "Decided" },
  { status: "withdrawn", label: "Withdrawn" },
] as const;

export default async function TrackerPage({ searchParams }: PageProps<"/app/tracker">) {
  const view = (await searchParams).view === "table" ? "table" : "board";
  const { supabase } = await getUser();
  const { data } = await supabase
    .from("applications")
    .select(
      "id, status, due_at, decision, portal_checked_at, program_cycles(label, requirements(kind, exam, test_policy), programs(slug, title, institutions(name, country))), checklist_items(done, deadlines(due_at, timezone, precision)), score_reports(test_scores(exam))",
    )
    .order("due_at", { ascending: true, nullsFirst: false });
  const apps = (data ?? []).map((a) => ({
    ...a,
    program: a.program_cycles?.programs,
    // Show the next deadline in the institution's own time zone.
    next: a.checklist_items
      .flatMap((i) => (i.deadlines && !i.done && new Date(i.deadlines.due_at) >= new Date() ? [i.deadlines] : []))
      .sort((x, y) => x.due_at.localeCompare(y.due_at))[0],
    done: a.checklist_items.filter((i) => i.done).length,
    total: a.checklist_items.length,
    scores: sentProgress(
      scoreNeeds(a.program_cycles?.requirements ?? []),
      a.score_reports.flatMap((r) => (r.test_scores ? [r.test_scores.exam] : [])),
    ),
  }));

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Tracker</h1>
          <p className="mt-2 text-muted">One card per course you shortlist, with its checklist and deadlines.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/tracker?view=board" aria-current={view === "board" ? "page" : undefined} className="btn btn-secondary btn-sm aria-[current=page]:bg-border">Board</Link>
          <Link href="/app/tracker?view=table" aria-current={view === "table" ? "page" : undefined} className="btn btn-secondary btn-sm aria-[current=page]:bg-border">Table</Link>
          <a href="/app/tracker/calendar.ics" className="btn btn-secondary btn-sm">Add all deadlines to my calendar</a>
        </div>
      </header>

      {apps.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">No applications yet</h2>
          <p className="mt-2 text-muted">Shortlist a course and its card appears here with a checklist built from its requirements.</p>
          <Link href="/app/match" className="btn btn-primary mt-6">See my matches</Link>
        </div>
      ) : view === "board" ? (
        <div className="grid auto-cols-[minmax(232px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => {
            const items = apps.filter((a) => a.status === col.status);
            return (
              <section key={col.status} aria-labelledby={`col-${col.status}`} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-3">
                <h2 id={`col-${col.status}`} className="px-1 text-sm font-semibold">{col.label} ({items.length})</h2>
                {items.map((a) => (
                  <article key={a.id} className="grid gap-2 rounded-xl bg-background p-3 text-sm">
                    <Link href={`/app/tracker/${a.id}`} className="font-semibold underline-offset-2 hover:underline">{a.program?.title}</Link>
                    <p className="text-muted">{a.program?.institutions?.name}</p>
                    <p>{a.next ? `Due ${deadlineText(a.next.due_at, a.next.timezone, a.next.precision)} (${daysUntil(a.next.due_at)} days)` : "No deadline known"}</p>
                    <p className="text-muted">{a.done} of {a.total} steps done</p>
                    {a.scores.needed ? <p className="text-muted">Scores sent: {a.scores.sent} of {a.scores.needed}</p> : null}
                    <form action={setStatus.bind(null, a.id)} className="grid grid-cols-[1fr_auto] gap-2">
                      <label className="sr-only" htmlFor={`s-${a.id}`}>Move to</label>
                      <select id={`s-${a.id}`} name="status" defaultValue={a.status} className="field py-1 text-sm">
                        {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-sm">Move</button>
                    </form>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="p-3">Course</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">Next deadline</th>
                <th scope="col" className="p-3">Checklist</th>
                <th scope="col" className="p-3">Decision</th>
                <th scope="col" className="p-3">Portal checked</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3">
                    <Link href={`/app/tracker/${a.id}`} className="font-semibold underline-offset-2 hover:underline">{a.program?.title}</Link>
                    <div className="text-muted">{a.program?.institutions?.name}</div>
                  </td>
                  <td className="p-3">{COLUMNS.find((c) => c.status === a.status)?.label}</td>
                  <td className="p-3">{a.next ? deadlineText(a.next.due_at, a.next.timezone, a.next.precision) : "Not known"}</td>
                  <td className="p-3">{a.done} / {a.total}</td>
                  <td className="p-3">{a.decision ?? ""}</td>
                  <td className="p-3">{checkedAgo(a.portal_checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
