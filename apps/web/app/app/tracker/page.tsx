import type { Metadata } from "next";
import { WelcomePrompt } from "@/components/journey/welcome-prompt";
import { welcomeOf } from "@/lib/onboarding";
import Link from "next/link";
import { checkedAgo } from "@/lib/application-events";
import { daysUntil, deadlineText } from "@/lib/format";
import { letterProgress, lettersNeeded } from "@/lib/recommendations";
import { scoreNeeds, sentProgress } from "@/lib/score-sending";
import { getLocale } from "@/lib/i18n/server";
import { intakeName } from "@/lib/intakes";
import { getUser } from "@/lib/supabase/server";
import { inTrack } from "@/lib/tracks";
import { TrackSwitcher } from "@/components/track-switcher";
import { OwnBadge } from "@/components/own-badge";
import { courseOf, ownDate } from "@/lib/own-application";
import { setStatus } from "./actions";
import { AddOwnCourse } from "./add-own";
import { InstitutionMonogram } from "@/components/ui/monogram";
import { Calendar, CheckCircle2, Clock, Plus, LayoutGrid, Table as TableIcon } from "lucide-react";

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
      "id, status, due_at, decision, declined_at, portal_checked_at, track_id, own_title, own_institution, own_country, own_due_at, program_cycles(label, intake_year, intake_term, requirements(kind, exam, test_policy, count_required), programs(slug, title, institutions(name, country))), checklist_items(done, deadlines(due_at, timezone, precision)), score_reports(test_scores(exam)), recommendation_requests(status)",
    )
    .order("due_at", { ascending: true, nullsFirst: false });
  const apps = (data ?? []).filter((a) => inTrack(a.track_id, trackFilter)).map((a) => ({
    ...a,
    course: courseOf(a),
    ownDue: a.own_due_at && new Date(a.own_due_at) >= new Date() ? a.own_due_at : null,
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

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-surface p-6 ambient-shadow">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">{t.title}</h1>
            <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wider">
              {apps.length} {apps.length === 1 ? "Program" : "Programs"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{t.intro}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/tracker?view=board${trackFilter !== "all" ? `&track=${trackFilter}` : ""}`}
            aria-current={view === "board" ? "page" : undefined}
            className={`btn btn-sm ${view === "board" ? "btn-coral-bright" : "btn-secondary"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{t.board}</span>
          </Link>
          <Link
            href={`/app/tracker?view=table${trackFilter !== "all" ? `&track=${trackFilter}` : ""}`}
            aria-current={view === "table" ? "page" : undefined}
            className={`btn btn-sm ${view === "table" ? "btn-coral-bright" : "btn-secondary"}`}
          >
            <TableIcon className="h-3.5 w-3.5" />
            <span>{t.table}</span>
          </Link>
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
        <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-14">
          <h2 className="text-2xl font-serif font-bold text-primary">{all.journey.empty.trackerTitle}</h2>
          <p className="mt-2 text-muted text-sm max-w-md mx-auto leading-relaxed">{all.journey.empty.trackerBody}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/courses" className="btn btn-coral-bright shadow-sm">{all.journey.empty.trackerFind}</Link>
            <Link href="#add-own" className="btn btn-secondary">{all.journey.empty.trackerAddOwn}</Link>
            <Link href="/app/match" className="btn btn-secondary">{t.seeMatches}</Link>
          </div>
        </div>
      ) : view === "board" ? (
        <div className="grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-5 overflow-x-auto pb-4">
          {COLUMNS.map((status) => {
            const items = apps.filter((a) => a.status === status);
            return (
              <section
                key={status}
                aria-labelledby={`col-${status}`}
                className="grid content-start gap-4 rounded-xl border border-border bg-surface-2/40 p-4 min-h-[500px]"
              >
                <div className="flex items-center justify-between px-1 pb-1 border-b border-border/60">
                  <h2 id={`col-${status}`} className="font-serif text-sm font-bold text-primary uppercase tracking-wider">
                    {t.status[status]}
                  </h2>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-xs font-bold text-muted border border-border">
                    {items.length}
                  </span>
                </div>

                <div className="grid gap-3">
                  {items.map((a) => {
                    const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
                    return (
                      <article
                        key={a.id}
                        className="rounded-xl border border-border bg-surface p-4 ambient-shadow hover:border-primary/40 transition-all grid gap-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <InstitutionMonogram name={a.course.institution} size="sm" />
                          <div className="min-w-0 flex-1">
                            <Link href={`/app/tracker/${a.id}`} className="font-serif font-bold text-sm text-primary hover:text-secondary hover:underline line-clamp-1">
                              {a.course.title}
                            </Link>
                            <p className="text-xs text-muted truncate">{a.course.institution}</p>
                          </div>
                        </div>

                        {a.program_cycles ? (
                          <span className="text-[11px] font-medium text-muted bg-surface-2 px-2 py-0.5 rounded-full inline-block w-fit">
                            {all.journey.intakeChoice.intake(intakeName(a.program_cycles))}
                          </span>
                        ) : null}

                        {a.course.own ? <p><OwnBadge text={all.journey.own.badge} /></p> : null}
                        {a.declined_at ? <p className="font-semibold text-xs text-muted">{all.journey.decline.label}</p> : null}

                        {/* Deadline badge */}
                        <div className="rounded-lg bg-surface-2/60 p-2 text-xs text-foreground flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-secondary shrink-0" />
                          <span className="truncate">
                            {a.next
                              ? t.due(deadlineText(a.next.due_at, a.next.timezone, a.next.precision), daysUntil(a.next.due_at))
                              : a.ownDue
                                ? `${all.journey.own.yourDate}: ${ownDate(a.ownDue)}`
                                : t.noDeadline}
                          </span>
                        </div>

                        {/* Progress Stepper Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted">
                            <span>Checklist ({a.done}/{a.total})</span>
                            <span className="font-mono font-bold text-primary">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
                            <div className="h-full bg-verified rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {a.scores.needed ? <p className="text-[11px] text-muted">{t.scoresSent(a.scores.sent, a.scores.needed)}</p> : null}
                        {a.letters.needed ? <p className="text-[11px] text-muted">{t.letters(a.letters.submitted, a.letters.needed)}</p> : null}

                        <form action={setStatus.bind(null, a.id)} className="grid grid-cols-[1fr_auto] gap-2 pt-2 border-t border-border/40">
                          <label className="sr-only" htmlFor={`s-${a.id}`}>{t.moveTo}</label>
                          <select id={`s-${a.id}`} name="status" defaultValue={a.status} className="field py-1 text-xs">
                            {COLUMNS.map((c) => <option key={c} value={c}>{t.status[c]}</option>)}
                          </select>
                          <button className="btn btn-secondary btn-sm py-1 px-2.5 text-xs">{t.move}</button>
                        </form>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface ambient-shadow">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface-2/60 border-b border-border text-xs uppercase tracking-wider font-bold text-muted">
              <tr>
                <th scope="col" className="p-4">{t.colCourse}</th>
                <th scope="col" className="p-4">{t.colStatus}</th>
                <th scope="col" className="p-4">{t.colDeadline}</th>
                <th scope="col" className="p-4">{t.colChecklist}</th>
                <th scope="col" className="p-4">{t.colDecision}</th>
                <th scope="col" className="p-4">{t.colPortal}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {apps.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2/20 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <InstitutionMonogram name={a.course.institution} size="sm" />
                      <div>
                        <Link href={`/app/tracker/${a.id}`} className="font-serif font-bold text-primary hover:text-secondary hover:underline">
                          {a.course.title}
                        </Link>
                        <div className="text-xs text-muted">{a.course.institution}</div>
                        {a.program_cycles ? <div className="text-[11px] text-muted">{all.journey.intakeChoice.intake(intakeName(a.program_cycles))}</div> : null}
                        {a.course.own ? <OwnBadge text={all.journey.own.badge} /> : null}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-block rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-primary border border-border/60">
                      {t.status[a.status]}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-medium">
                    {a.next ? deadlineText(a.next.due_at, a.next.timezone, a.next.precision) : a.ownDue ? `${all.journey.own.yourDate}: ${ownDate(a.ownDue)}` : t.notKnown}
                  </td>
                  <td className="p-4 text-xs font-semibold">
                    {a.done} / {a.total}
                  </td>
                  <td className="p-4 text-xs font-medium">
                    {a.declined_at ? all.journey.decline.label : (a.decision ?? "Pending")}
                  </td>
                  <td className="p-4 text-xs text-muted">
                    {checkedAgo(a.portal_checked_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div id="add-own">
        <AddOwnCourse t={all.journey.own} invalid={params.own === "invalid"} />
      </div>
    </div>
  );
}
