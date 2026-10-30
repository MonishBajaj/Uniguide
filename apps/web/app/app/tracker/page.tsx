import type { Metadata } from "next";
import { WelcomePrompt } from "@/components/journey/welcome-prompt";
import { welcomeOf } from "@/lib/onboarding";
import Link from "next/link";
import { checkedAgo } from "@/lib/application-events";
import { daysUntil, deadlineText } from "@/lib/format";
import { letterProgress, lettersNeeded } from "@/lib/recommendations";
import { scoreNeeds, sentProgress } from "@/lib/score-sending";
import { getLocale } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { inTrack } from "@/lib/tracks";
import { TrackSwitcher } from "@/components/track-switcher";
import { OwnBadge } from "@/components/own-badge";
import { courseOf, ownDate } from "@/lib/own-application";
import { setStatus } from "./actions";
import { AddOwnCourse } from "./add-own";

export const metadata: Metadata = { title: "Tracker" };

const COLUMNS = ["shortlisted", "preparing", "submitted", "decided", "withdrawn"] as const;

export default async function TrackerPage({ searchParams }: PageProps<"/app/tracker">) {
  const params = await searchParams;
  const view = params.view === "table" ? "table" : "board";
  const trackFilter = typeof params.track === "string" ? params.track : "all";
  const { supabase } = await getUser();
  const { t: all } = await getLocale();
  const t = all.tracker;
  const { data: tracks } = await supabase.from("tracks").select("id, name").order("created_at");
  const { data } = await supabase
    .from("applications")
    .select(
      "id, status, due_at, decision, portal_checked_at, track_id, own_title, own_institution, own_country, own_due_at, program_cycles(label, requirements(kind, exam, test_policy, count_required), programs(slug, title, institutions(name, country))), checklist_items(done, deadlines(due_at, timezone, precision)), score_reports(test_scores(exam)), recommendation_requests(status)",
    )
    .order("due_at", { ascending: true, nullsFirst: false });
  const apps = (data ?? []).filter((a) => inTrack(a.track_id, trackFilter)).map((a) => ({
    ...a,
    course: courseOf(a),
    // An own application's date is the student's, shown as theirs and never as a fact (J3.3).
    ownDue: a.own_due_at && new Date(a.own_due_at) >= new Date() ? a.own_due_at : null,
    // Show the next deadline in the institution's own time zone.
    next: a.checklist_items
      .flatMap((i) => (i.deadlines && !i.done && new Date(i.deadlines.due_at) >= new Date() ? [i.deadlines] : []))
      .sort((x, y) => x.due_at.localeCompare(y.due_at))[0],
    done: a.checklist_items.filter((i) => i.done).length,
    total: a.checklist_items.length,
    letters: letterProgress(a.recommendation_requests, lettersNeeded(a.program_cycles?.requirements ?? [])),
    scores: sentProgress(
      scoreNeeds(a.program_cycles?.requirements ?? []),
      a.score_reports.flatMap((r) => (r.test_scores ? [r.test_scores.exam] : [])),
    ),
  }));

  return (
    <div className="grid gap-8">
      <WelcomePrompt welcome={welcomeOf(params.welcome)} t={all.journey.onboarding} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-muted">{t.intro}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/tracker?view=board${trackFilter !== "all" ? `&track=${trackFilter}` : ""}`} aria-current={view === "board" ? "page" : undefined} className="btn btn-secondary btn-sm aria-[current=page]:bg-border">{t.board}</Link>
          <Link href={`/app/tracker?view=table${trackFilter !== "all" ? `&track=${trackFilter}` : ""}`} aria-current={view === "table" ? "page" : undefined} className="btn btn-secondary btn-sm aria-[current=page]:bg-border">{t.table}</Link>
          <Link href="/app/recommenders" className="btn btn-secondary btn-sm">{t.recommenders}</Link>
          <Link href="/app/tracker/costs" className="btn btn-secondary btn-sm">{t.costs}</Link>
          <a href="/app/tracker/calendar.ics" className="btn btn-secondary btn-sm">{t.calendar}</a>
        </div>
      </header>

      {tracks?.length ? (
        <TrackSwitcher
          href={(v) => `/app/tracker?view=${view}${v === "all" ? "" : `&track=${v}`}`}
          options={[{ value: "all", label: t.all }, { value: "main", label: t.main }, ...tracks.map((t) => ({ value: t.id, label: t.name }))]}
          current={trackFilter}
        />
      ) : null}

      {apps.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">{t.emptyTitle}</h2>
          <p className="mt-2 text-muted">{t.emptyBody}</p>
          <Link href="/app/match" className="btn btn-primary mt-6">{t.seeMatches}</Link>
        </div>
      ) : view === "board" ? (
        <div className="grid auto-cols-[minmax(232px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((status) => {
            const items = apps.filter((a) => a.status === status);
            return (
              <section key={status} aria-labelledby={`col-${status}`} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-3">
                <h2 id={`col-${status}`} className="px-1 text-sm font-semibold">{t.status[status]} ({items.length})</h2>
                {items.map((a) => (
                  <article key={a.id} className="grid gap-2 rounded-xl bg-background p-3 text-sm">
                    <Link href={`/app/tracker/${a.id}`} className="font-semibold underline-offset-2 hover:underline">{a.course.title}</Link>
                    <p className="text-muted">{a.course.institution}</p>
                    {a.course.own ? <p><OwnBadge text={all.journey.own.badge} /></p> : null}
                    <p>
                      {a.next
                        ? t.due(deadlineText(a.next.due_at, a.next.timezone, a.next.precision), daysUntil(a.next.due_at))
                        : a.ownDue
                          ? `${all.journey.own.yourDate}: ${ownDate(a.ownDue)}`
                          : t.noDeadline}
                    </p>
                    <p className="text-muted">{t.steps(a.done, a.total)}</p>
                    {a.scores.needed ? <p className="text-muted">{t.scoresSent(a.scores.sent, a.scores.needed)}</p> : null}
                    {a.letters.needed ? <p className="text-muted">{t.letters(a.letters.submitted, a.letters.needed)}</p> : null}
                    <form action={setStatus.bind(null, a.id)} className="grid grid-cols-[1fr_auto] gap-2">
                      <label className="sr-only" htmlFor={`s-${a.id}`}>{t.moveTo}</label>
                      <select id={`s-${a.id}`} name="status" defaultValue={a.status} className="field py-1 text-sm">
                        {COLUMNS.map((c) => <option key={c} value={c}>{t.status[c]}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-sm">{t.move}</button>
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
                <th scope="col" className="p-3">{t.colCourse}</th>
                <th scope="col" className="p-3">{t.colStatus}</th>
                <th scope="col" className="p-3">{t.colDeadline}</th>
                <th scope="col" className="p-3">{t.colChecklist}</th>
                <th scope="col" className="p-3">{t.colDecision}</th>
                <th scope="col" className="p-3">{t.colPortal}</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="p-3">
                    <Link href={`/app/tracker/${a.id}`} className="font-semibold underline-offset-2 hover:underline">{a.course.title}</Link>
                    <div className="text-muted">{a.course.institution}</div>
                    {a.course.own ? <OwnBadge text={all.journey.own.badge} /> : null}
                  </td>
                  <td className="p-3">{t.status[a.status]}</td>
                  <td className="p-3">
                    {a.next ? deadlineText(a.next.due_at, a.next.timezone, a.next.precision) : a.ownDue ? `${all.journey.own.yourDate}: ${ownDate(a.ownDue)}` : t.notKnown}
                  </td>
                  <td className="p-3">{a.done} / {a.total}</td>
                  <td className="p-3">{a.decision ?? ""}</td>
                  <td className="p-3">{checkedAgo(a.portal_checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddOwnCourse t={all.journey.own} invalid={params.own === "invalid"} />
    </div>
  );
}
