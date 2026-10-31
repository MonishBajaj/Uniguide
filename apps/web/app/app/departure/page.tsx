import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { groupByMonth, monthName } from "@/lib/departure";
import { loadDeparture } from "@/lib/departure-data";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { setAcceptedOffer, setTaskDone } from "./actions";
import { courseOf } from "@/lib/own-application";

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
      <div className="grid gap-8">
        <header>
          <h1 className="text-4xl font-semibold">Before you leave</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Once you have chosen an offer, this becomes a timeline of what to arrange before the course starts: housing,
            insurance, travel, documents, and the visa steps for your destination with their official pages.
          </p>
        </header>
        {(offers ?? []).length ? (
          <section aria-labelledby="choose" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
            <h2 id="choose" className="text-lg font-semibold">Which offer are you taking?</h2>
            <ul className="grid gap-2">
              {offers!.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3">
                  <span>
                    <span className="font-semibold">{courseOf(o).title}</span>
                    <span className="text-muted"> · {courseOf(o).institution}</span>
                  </span>
                  <form action={setAcceptedOffer.bind(null, o.id)}>
                    <button className="btn btn-primary btn-sm">I&apos;m taking this offer</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="rounded-2xl border border-border bg-surface p-6 text-muted">
            No offers yet. Record an admission on the application in your <Link href="/app/tracker" className="underline underline-offset-2">tracker</Link> and it will appear here.
          </p>
        )}
      </div>
    );
  }

  const { app, program, start, tasks, done } = data;
  const today = new Date().toISOString().slice(0, 10);
  const doneCount = tasks.filter((t) => done.has(t.key)).length;

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">Before you leave</h1>
        <p className="text-muted">
          <Link href={`/app/tracker/${app.id}`} className="font-semibold text-foreground underline-offset-2 hover:underline">{program.title}</Link>
          {" · "}{program.institutions!.name}
        </p>
        <p>
          {start
            ? start.approximate
              ? <>The course starts around <strong>{shortDate(start.date)}</strong>. That date is estimated from the intake; use the one in your offer letter.</>
              : <>The course starts on <strong>{shortDate(start.date)}</strong>.</>
            : "We do not know when this course starts, so the steps have no dates. Check your offer letter."}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a href="/app/departure/calendar.ics" className="btn btn-secondary btn-sm">Add to calendar (.ics)</a>
          <form action={setAcceptedOffer.bind(null, null)}>
            <button className="btn btn-secondary btn-sm">Choose a different offer</button>
          </form>
          <p className="text-sm font-semibold">{doneCount} of {tasks.length} done</p>
        </div>
      </header>

      {groupByMonth(tasks).map((group) => (
        <section key={group.month ?? "undated"} aria-label={group.month ? monthName(group.month) : "Steps"} className="grid gap-3">
          <h2 className="text-2xl font-semibold">{group.month ? monthName(group.month) : "Steps"}</h2>
          <ul className="grid gap-3">
            {group.tasks.map((t) => {
              const isDone = done.has(t.key);
              const late = !isDone && t.due != null && t.due < today;
              return (
                <li key={t.key} className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
                  <form action={setTaskDone.bind(null, app.id, t.key, !isDone)}>
                    <button
                      aria-pressed={isDone}
                      aria-label={`${t.title}: ${isDone ? "done, mark not done" : "mark done"}`}
                      className={`grid h-6 w-6 place-items-center rounded-md border ${isDone ? "border-accent bg-accent text-background" : "border-border bg-background"}`}
                    >
                      <span aria-hidden="true">{isDone ? "✓" : ""}</span>
                    </button>
                  </form>
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className={`text-base font-semibold ${isDone ? "text-muted line-through" : ""}`}>{t.title}</h3>
                      {t.due ? (
                        <span className={late ? "font-semibold text-conflicting" : "text-muted"}>
                          {t.weeksBefore < 0 ? "First week" : `By ${shortDate(t.due)}`}{late ? " · overdue" : ""}
                        </span>
                      ) : null}
                      {t.status ? <FactBadge status={t.status as Parameters<typeof FactBadge>[0]["status"]} /> : null}
                    </div>
                    <p className="text-muted">{t.body}</p>
                    {t.leadFromSource ? <p className="text-sm text-muted">The timing comes from the official page.</p> : null}
                    {t.link ? (
                      <a href={t.link} target="_blank" rel="noreferrer" className="justify-self-start underline underline-offset-2">Official page</a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-xs text-muted">
        General steps, not immigration or legal advice. Rules change; your university and the official pages decide what applies to you.
      </p>
    </div>
  );
}
