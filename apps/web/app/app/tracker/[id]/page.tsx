import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COST_KINDS, totalsByCurrency, type CostKind } from "@/lib/application-costs";
import { checkedAgo, describeEvent } from "@/lib/application-events";
import { CURRENCIES } from "@/lib/fields";
import { letterProgress, lettersNeeded, LETTER_STATUSES, type LetterStatus } from "@/lib/recommendations";
import { scoreNeeds, sentProgress } from "@/lib/score-sending";
import { WAITLIST_STEPS } from "@/lib/waitlist";
import { startLinkedDocument } from "../../writing/actions";
import { daysUntil, deadlineText, label, money, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { CostForm } from "../cost-form";
import { ShareCard } from "./share-card";
import {
  addItem,
  deleteApplication,
  logPortal,
  markScoreReceived,
  recordDecision,
  recordScoreSent,
  removeCost,
  removeScoreReport,
  saveNotes,
  shareOutcome,
  toggleItem,
  withdrawOutcome,
} from "../actions";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/app/tracker/[id]">) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  const [{ data: app }, { data: outcome }, { data: consent }, { data: events }, { data: scores }, { data: costs }, { data: profile }, { data: linkedDocs }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "*, program_cycles(label, requirements(kind, exam, test_policy, count_required), programs(slug, title, official_url, institutions(name))), checklist_items(*, deadlines(due_at, timezone, precision, status), requirements(status)), score_reports(id, sent_on, received_on, test_scores(exam, exam_version, total)), recommendation_requests(id, status, due_on, recommenders(name))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("outcomes").select("id").eq("application_id", id).maybeSingle(),
    supabase.from("consents").select("id").eq("kind", "outcomes_research").is("withdrawn_at", null).limit(1).maybeSingle(),
    supabase
      .from("application_events")
      .select("id, kind, from_value, to_value, note, created_at")
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("test_scores").select("id, exam, exam_version, total").order("taken_on", { ascending: false }),
    supabase.from("application_costs").select("id, kind, amount, currency, paid_on, note").eq("application_id", id).order("created_at"),
    supabase.from("profiles").select("budget_currency").eq("user_id", user!.id).single(),
    supabase.from("documents").select("id, kind, document_versions(word_count, created_at)").eq("application_id", id).in("kind", ["continued_interest", "why_this_university"]),
  ]);
  if (!app) notFound();
  const program = app.program_cycles?.programs;
  const items = [...app.checklist_items].sort((a, b) => a.sort - b.sort);
  const letter = (linkedDocs ?? []).find((d) => d.kind === "continued_interest");
  const letters = letterProgress(app.recommendation_requests, lettersNeeded(app.program_cycles?.requirements ?? []));
  const whyDoc = (linkedDocs ?? []).find((d) => d.kind === "why_this_university");
  const needs = scoreNeeds(app.program_cycles?.requirements ?? []);
  const reports = [...app.score_reports].sort((a, b) => a.sent_on.localeCompare(b.sent_on));
  const progress = sentProgress(needs, reports.flatMap((r) => (r.test_scores ? [r.test_scores.exam] : [])));
  const scoreName = (t: { exam: string; exam_version: string | null; total: number | null }) =>
    `${label(t.exam)}${t.exam_version ? ` (${t.exam_version})` : ""}${t.total != null ? ` ${t.total}` : ""}`;

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/tracker" className="text-sm text-muted underline underline-offset-2">Tracker</Link>
        <h1 className="mt-2 text-4xl font-semibold">{program?.title}</h1>
        <p className="mt-1 text-muted">{program?.institutions?.name} · {app.program_cycles?.label.replace("-", " ")} intake</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {program ? <Link href={`/courses/${program.slug}`} className="btn btn-secondary btn-sm">Course facts and sources</Link> : null}
          <a href={`/app/tracker/calendar.ics?application=${app.id}`} className="btn btn-secondary btn-sm">Add to calendar (.ics)</a>
          <form action={startLinkedDocument.bind(null, app.id, "why_this_university")}>
            <button className="btn btn-secondary btn-sm">{whyDoc ? "Continue your \u201cWhy this university\u201d" : "Write your \u201cWhy this university\u201d"}</button>
          </form>
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

      <section aria-labelledby="scores" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <h2 id="scores" className="text-lg font-semibold">Scores sent</h2>
          {needs.length ? (
            <p className="text-sm text-muted">
              This course asks for {needs.filter((n) => n.required).map((n) => n.label).join(" and ") || "no required tests"}
              {needs.some((n) => !n.required) ? `; optional: ${needs.filter((n) => !n.required).map((n) => n.label).join(", ")}` : ""}.
              {progress.needed ? ` Sent ${progress.sent} of ${progress.needed}.` : ""} Confirm on the official page.
            </p>
          ) : (
            <p className="text-sm text-muted">No test requirements are published for this course yet. Check the official page.</p>
          )}
        </div>
        {reports.length ? (
          <ul className="grid gap-2 text-sm">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3">
                <span>
                  <span className="font-semibold">{r.test_scores ? scoreName(r.test_scores) : "Score"}</span>
                  <span className="block text-muted">
                    Sent {shortDate(r.sent_on)}{r.received_on ? ` · received ${shortDate(r.received_on)}` : " · not confirmed as received yet"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {r.received_on ? null : (
                    <form action={markScoreReceived.bind(null, r.id)} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`recv-${r.id}`}>Date received</label>
                      <input id={`recv-${r.id}`} type="date" name="received_on" required min={r.sent_on} className="field py-1 text-sm" />
                      <button className="btn btn-secondary btn-sm">Mark received</button>
                    </form>
                  )}
                  <form action={removeScoreReport.bind(null, r.id)}>
                    <button className="btn btn-secondary btn-sm" aria-label={`Remove ${r.test_scores ? scoreName(r.test_scores) : "score"}`}>Remove</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {(scores ?? []).length ? (
          <form action={recordScoreSent.bind(null, app.id)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="send-score">Score</label>
            <select id="send-score" name="test_score_id" required className="field max-w-xs">
              {(scores ?? []).map((t) => <option key={t.id} value={t.id}>{scoreName(t)}</option>)}
            </select>
            <label className="sr-only" htmlFor="send-date">Date sent</label>
            <input id="send-date" type="date" name="sent_on" required className="field max-w-[180px]" />
            <button className="btn btn-secondary">Record score sent</button>
          </form>
        ) : (
          <p className="text-sm">
            Add your test scores on your <Link href="/app/profile" className="underline underline-offset-2">profile</Link> to record sending them.
          </p>
        )}
      </section>

      <section aria-labelledby="letters" className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="letters" className="text-lg font-semibold">Recommendation letters</h2>
          <Link href="/app/recommenders" className="text-sm underline underline-offset-2">Manage recommenders</Link>
        </div>
        <p className="text-sm text-muted">
          {letters.needed != null ? `This course asks for ${letters.needed} letter${letters.needed === 1 ? "" : "s"}. ` : "The number of letters is not published yet; check the official page. "}
          {app.recommendation_requests.length ? `${letters.submitted} submitted, ${letters.lined_up} agreed or submitted.` : ""}
          {letters.short ? ` Ask ${letters.short} more ${letters.short === 1 ? "person" : "people"}.` : ""}
        </p>
        {app.recommendation_requests.length ? (
          <ul className="grid gap-1 text-sm">
            {app.recommendation_requests.map((q) => (
              <li key={q.id}>
                <span className="font-semibold">{q.recommenders?.name}</span>: {LETTER_STATUSES[q.status as LetterStatus] ?? q.status}
                {q.due_on && q.status !== "submitted" ? <span className="text-muted"> · due {shortDate(q.due_on)}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="costs" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="costs" className="text-lg font-semibold">Costs</h2>
          <Link href="/app/tracker/costs" className="text-sm underline underline-offset-2">All application costs</Link>
        </div>
        {(costs ?? []).length ? (
          <>
            <ul className="grid gap-2 text-sm">
              {(costs ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3">
                  <span>
                    <span className="font-semibold">{COST_KINDS[c.kind as CostKind] ?? c.kind}</span> {money(Number(c.amount), c.currency)}
                    <span className="block text-muted">{c.paid_on ? `Paid ${shortDate(c.paid_on)}` : "Not dated"}{c.note ? ` · ${c.note}` : ""}</span>
                  </span>
                  <form action={removeCost.bind(null, c.id)}><button className="btn btn-secondary btn-sm">Remove</button></form>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Total for this application: {totalsByCurrency((costs ?? []).map((c) => ({ amount: Number(c.amount), currency: c.currency }))).map((t) => money(t.amount, t.currency)).join(" + ")}
            </p>
          </>
        ) : null}
        <CostForm applicationId={app.id} defaultCurrency={profile?.budget_currency ?? "USD"} />
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

        {app.decision === "waitlisted" ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <h3 className="font-semibold">You&apos;re on the waitlist: what to do now</h3>
            <ol className="grid gap-2 text-sm">
              {WAITLIST_STEPS.map((step, i) => (
                <li key={step.id} className="grid grid-cols-[24px_1fr] gap-2">
                  <span className="font-mono text-muted">{i + 1}</span>
                  <span>
                    <span className="font-semibold">{step.title}.</span> <span className="text-muted">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              {program?.official_url ? (
                <a href={program.official_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Official course page</a>
              ) : null}
              <form action={startLinkedDocument.bind(null, app.id, "continued_interest")}>
                <button className="btn btn-primary btn-sm">{letter ? "Continue your letter of continued interest" : "Start a letter of continued interest"}</button>
              </form>
              {letter?.document_versions.length ? (
                <span className="text-sm text-muted">
                  Last saved {shortDate([...letter.document_versions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!.created_at)},{" "}
                  {[...letter.document_versions].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!.word_count} words
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {app.decision === "admitted" ? (
          <div className="grid gap-2 border-t border-border pt-4">
            <h3 className="font-semibold">Congratulations! Share the news</h3>
            <p className="text-sm text-muted">A card with the course, university and intake. It never shows your grades, scores or funding.</p>
            <ShareCard applicationId={app.id} />
          </div>
        ) : null}

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

      <section aria-labelledby="portal" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <div>
          <h2 id="portal" className="text-lg font-semibold">Portal and history</h2>
          <p className="text-sm text-muted">Portal last checked {checkedAgo(app.portal_checked_at)}.</p>
        </div>
        <form action={logPortal.bind(null, app.id, "portal_check")} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="portal-note">What the portal says (optional)</label>
          <input id="portal-note" name="note" maxLength={1000} placeholder="What the portal says (optional)" className="field max-w-md" />
          <button className="btn btn-primary">I checked the portal today</button>
        </form>
        <form action={logPortal.bind(null, app.id, "note")} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="history-note">Add a note to the history</label>
          <input id="history-note" name="note" required maxLength={1000} placeholder="Add a note, for example an email you sent" className="field max-w-md" />
          <button className="btn btn-secondary">Add note</button>
        </form>
        <ol className="grid gap-2 text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id} className="grid grid-cols-[110px_1fr] gap-3 border-t border-border pt-2">
              <time dateTime={e.created_at} className="text-muted">{shortDate(e.created_at)}</time>
              <span>{describeEvent(e)}</span>
            </li>
          ))}
        </ol>
      </section>

      <form action={deleteApplication.bind(null, app.id)}>
        <button className="btn btn-secondary btn-sm">Delete this application</button>
      </form>
    </div>
  );
}
