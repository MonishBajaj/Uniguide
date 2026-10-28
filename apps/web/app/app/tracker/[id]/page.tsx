import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CURRENCIES } from "@/lib/fields";
import { daysUntil, deadlineText, label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { addItem, deleteApplication, recordDecision, saveNotes, shareOutcome, toggleItem, withdrawOutcome } from "../actions";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/app/tracker/[id]">) {
  const { id } = await params;
  const { supabase } = await getUser();
  const [{ data: app }, { data: outcome }, { data: consent }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "*, program_cycles(label, programs(slug, title, official_url, institutions(name))), checklist_items(*, deadlines(due_at, timezone, precision, status), requirements(status))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("outcomes").select("id").eq("application_id", id).maybeSingle(),
    supabase.from("consents").select("id").eq("kind", "outcomes_research").is("withdrawn_at", null).limit(1).maybeSingle(),
  ]);
  if (!app) notFound();
  const program = app.program_cycles?.programs;
  const items = [...app.checklist_items].sort((a, b) => a.sort - b.sort);

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/tracker" className="text-sm text-muted underline underline-offset-2">Tracker</Link>
        <h1 className="mt-2 text-4xl font-semibold">{program?.title}</h1>
        <p className="mt-1 text-muted">{program?.institutions?.name} · {app.program_cycles?.label.replace("-", " ")} intake</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {program ? <Link href={`/courses/${program.slug}`} className="btn btn-secondary btn-sm">Course facts and sources</Link> : null}
          <a href={`/app/tracker/calendar.ics?application=${app.id}`} className="btn btn-secondary btn-sm">Add to calendar (.ics)</a>
        </div>
      </header>

      <section aria-labelledby="checklist" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="checklist" className="text-lg font-semibold">Checklist</h2>
        <ul className="grid gap-2">
          {items.map((item) => {
            const deadline = item.deadlines;
            const unverified = (deadline && deadline.status !== "verified") || (item.requirements && item.requirements.status !== "verified");
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-lg bg-background p-3">
                <form action={toggleItem.bind(null, item.id, !item.done)}>
                  <button
                    aria-label={item.done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
                    className={`mt-0.5 size-5 rounded border border-border ${item.done ? "bg-accent" : "bg-background"}`}
                  />
                </form>
                <div className="grid gap-1 text-sm">
                  <span className={item.done ? "text-muted line-through" : "font-semibold"}>{item.title}</span>
                  {item.details ? <span className="text-muted">{item.details}</span> : null}
                  <span className="text-muted">
                    {deadline
                      ? `${deadlineText(deadline.due_at, deadline.timezone, deadline.precision)} (${daysUntil(deadline.due_at)} days)`
                      : item.due_at
                        ? `By ${shortDate(item.due_at)}`
                        : ""}
                    {unverified ? " · from unverified information, confirm on the official page" : ""}
                  </span>
                  {item.link ? <a href={item.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">{new URL(item.link).hostname}</a> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <form action={addItem.bind(null, app.id)} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="new-item">New step</label>
          <input id="new-item" name="title" required maxLength={200} placeholder="Add your own step" className="field max-w-sm" />
          <label className="sr-only" htmlFor="new-due">Due date</label>
          <input id="new-due" name="due" type="date" className="field max-w-[180px]" />
          <button className="btn btn-secondary">Add</button>
        </form>
      </section>

      <section aria-labelledby="notes" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <h2 id="notes" className="text-lg font-semibold">Notes</h2>
        <form action={saveNotes.bind(null, app.id)} className="grid gap-2">
          <label className="sr-only" htmlFor="notes-text">Notes</label>
          <textarea id="notes-text" name="notes" rows={4} maxLength={4000} defaultValue={app.notes ?? ""} className="field" />
          <button className="btn btn-secondary justify-self-start">Save notes</button>
        </form>
      </section>

      <section aria-labelledby="decision" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 id="decision" className="text-lg font-semibold">Decision</h2>
        <form action={recordDecision.bind(null, app.id)} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            Result
            <select name="decision" defaultValue={app.decision ?? ""} required className="field font-normal">
              <option value="" disabled>Choose</option>
              {["admitted", "rejected", "waitlisted", "deferred", "withdrawn"].map((d) => <option key={d} value={d}>{label(d)}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Date of decision
            <input type="date" name="decided_at" defaultValue={app.decided_at ?? ""} className="field font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Funding awarded (only if it is in your offer)
            <input name="awarded_aid" inputMode="numeric" defaultValue={app.awarded_aid ?? ""} className="field font-normal" />
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Currency
            <select name="awarded_aid_currency" defaultValue={app.awarded_aid_currency ?? ""} className="field font-normal">
              <option value="">None</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold">
            Deposit or reply due
            <input type="date" name="deposit_due_at" defaultValue={app.deposit_due_at?.slice(0, 10) ?? ""} className="field font-normal" />
          </label>
          <button className="btn btn-secondary self-end justify-self-start">Save decision</button>
        </form>

        {app.decision ? (
          outcome ? (
            <form action={withdrawOutcome.bind(null, app.id)} className="text-sm">
              <p>You shared this outcome for research. Thank you.</p>
              <button className="btn btn-secondary btn-sm mt-2">Stop sharing it</button>
            </form>
          ) : (
            <form action={shareOutcome.bind(null, app.id)} className="grid gap-2 text-sm">
              <p className="text-muted">
                Sharing your result, grades and scores (never your name or email) helps future students see what
                admitted applicants had. It is optional and you can withdraw it at any time.
              </p>
              {!consent ? (
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="consent" required className="mt-1 accent-[var(--accent)]" />
                  I agree to share my outcomes for research, separately from everything else.
                </label>
              ) : null}
              <button className="btn btn-secondary btn-sm justify-self-start">Share this outcome</button>
            </form>
          )
        ) : null}
      </section>

      <form action={deleteApplication.bind(null, app.id)}>
        <button className="btn btn-secondary btn-sm">Delete this application</button>
      </form>
    </div>
  );
}
