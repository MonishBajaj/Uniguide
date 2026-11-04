import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { groupByMonth, monthName } from "@/lib/departure";
import { loadDeparture } from "@/lib/departure-data";
import { shortDate } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { setAcceptedOffer, setTaskDone } from "./actions";
import { courseOf } from "@/lib/own-application";
import { Plane, Calendar, CheckCircle2, ChevronLeft } from "lucide-react";

export const metadata: Metadata = { title: "Before you leave" };

export default async function DeparturePage() {
  const { supabase, user } = await getUser();
  const data = await loadDeparture(supabase, user!.id);

  if (!data) {
    const { data: offers } = await supabase
      .from("applications")
      .select("id, own_title, own_institution, program_cycles(programs(title, institutions(name)))")
      .eq("decision", "admitted")
      .order("created_at");
    return (
      <div className="grid gap-8 max-w-4xl mx-auto">
        <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plane className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Pre-Departure & Arrival Hub</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Before You Leave</h1>
          <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
            Once you have selected your accepted offer, this unlocks an interactive timeline of milestones before classes begin: housing, healthcare, visas, travel booking, and official documents.
          </p>
        </header>

        {(offers ?? []).length ? (
          <section aria-labelledby="choose" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <h2 id="choose" className="text-xl font-serif font-bold text-primary mb-4">Which offer are you taking?</h2>
            <ul className="grid gap-3">
              {offers!.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface-2/50 border border-border/60">
                  <div>
                    <h3 className="font-serif font-bold text-base text-primary">{courseOf(o).title}</h3>
                    <p className="text-xs text-muted mt-0.5">{courseOf(o).institution}</p>
                  </div>
                  <form action={setAcceptedOffer.bind(null, o.id)}>
                    <button className="btn btn-coral-bright btn-sm shadow-xs">I&apos;m taking this offer</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-12">
            <p className="text-sm text-muted">
              No offers recorded yet. Mark an admission on your applications in the <Link href="/app/tracker" className="font-semibold text-primary underline underline-offset-2">Tracker</Link> to unlock your departure timeline.
            </p>
          </div>
        )}
      </div>
    );
  }

  const { app, program, start, tasks, done } = data;
  const ta = (await getLocale()).t.journey.arrived;
  const arrived = done.has("arrived");
  const today = new Date().toISOString().slice(0, 10);
  const doneCount = tasks.filter((t) => done.has(t.key)).length;

  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-verified/10 text-verified">
                <Plane className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted">Confirmed Destination</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Before you leave</h1>
            <p className="text-sm font-semibold text-secondary mt-1">
              <Link href={`/app/tracker/${app.id}`} className="hover:underline">
                {program.title}
              </Link>
              {" · "}{program.institutions!.name}
            </p>
            <p className="mt-2 text-xs text-muted">
              {start
                ? start.approximate
                  ? <>The course starts around <strong>{shortDate(start.date)}</strong> (estimated from intake cycle).</>
                  : <>The course starts on <strong>{shortDate(start.date)}</strong>.</>
                : "Check your official admission letter for exact orientation and arrival dates."}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">
              {doneCount} of {tasks.length} tasks completed
            </span>
            <div className="flex gap-2 mt-1">
              <a href="/app/departure/calendar.ics" className="btn btn-secondary btn-sm">Add to Calendar (.ics)</a>
              <form action={setAcceptedOffer.bind(null, null)}>
                <button className="btn btn-secondary btn-sm">Change Offer</button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {groupByMonth(tasks).map((group) => (
        <section key={group.month ?? "undated"} aria-label={group.month ? monthName(group.month) : "Steps"} className="grid gap-4">
          <div className="flex items-center gap-2 border-b border-border/70 pb-2">
            <Calendar className="h-5 w-5 text-secondary" />
            <h2 className="font-serif text-2xl font-bold text-primary">{group.month ? monthName(group.month) : "General Steps"}</h2>
          </div>

          <ul className="grid gap-3">
            {group.tasks.map((t) => {
              const isDone = done.has(t.key);
              const late = !isDone && t.due != null && t.due < today;
              return (
                <li key={t.key} className="grid grid-cols-[auto_1fr] gap-4 rounded-xl border border-border bg-surface p-5 ambient-shadow hover:border-primary/40 transition-all text-sm">
                  <form action={setTaskDone.bind(null, app.id, t.key, !isDone)}>
                    <button
                      aria-pressed={isDone}
                      aria-label={`${t.title}: ${isDone ? "done, mark not done" : "mark done"}`}
                      className={`grid h-6 w-6 place-items-center rounded-md border transition-all ${
                        isDone ? "border-verified bg-verified text-white" : "border-border bg-surface hover:border-primary"
                      }`}
                    >
                      <span aria-hidden="true" className="font-bold text-xs">{isDone ? "✓" : ""}</span>
                    </button>
                  </form>

                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className={`text-base font-serif font-bold ${isDone ? "text-muted line-through" : "text-primary"}`}>{t.title}</h3>
                      {t.due ? (
                        <span className={`text-xs font-mono ${late ? "font-bold text-conflicting" : "text-muted"}`}>
                          {t.weeksBefore < 0 ? "First week" : `By ${shortDate(t.due)}`}{late ? " · Overdue" : ""}
                        </span>
                      ) : null}
                      {t.status ? <FactBadge status={t.status as Parameters<typeof FactBadge>[0]["status"]} /> : null}
                    </div>
                    <p className="text-muted text-xs leading-relaxed">{t.body}</p>
                    {t.leadFromSource ? <p className="text-[11px] text-muted italic">Timing sourced directly from official regulations.</p> : null}
                    {t.link ? (
                      <a href={t.link} target="_blank" rel="noreferrer" className="justify-self-start text-xs font-semibold text-primary underline underline-offset-2 hover:text-secondary">
                        Official guidance page
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Arrival Confirmation */}
      <section id="arrived" aria-labelledby="arrived-title" className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <h2 id="arrived-title" className="font-serif text-2xl font-bold text-primary mb-2">Have you arrived on campus?</h2>
        <p className="text-sm text-muted mb-4 leading-relaxed">
          When you touch down and arrive at university, mark this milestone to conclude the pre-departure phase.
        </p>
        <form action={setTaskDone.bind(null, app.id, "arrived", !arrived)}>
          <button className={`btn ${arrived ? "btn-secondary" : "btn-coral-bright shadow-sm"}`}>
            {arrived ? "Mark as not arrived yet" : "I have arrived on campus"}
          </button>
        </form>
      </section>
    </div>
  );
}
