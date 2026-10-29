import type { Metadata } from "next";
import Link from "next/link";
import { LETTER_STATUSES } from "@/lib/recommendations";
import { getUser } from "@/lib/supabase/server";
import { addRecommender, addRequest, removeRecommender, saveBragNotes } from "./actions";
import { RequestRow } from "./request-row";

export const metadata: Metadata = { title: "Recommendation letters" };

export default async function RecommendersPage() {
  const { supabase } = await getUser();
  const [{ data: recommenders }, { data: apps }] = await Promise.all([
    supabase
      .from("recommenders")
      .select("id, name, relationship, brag_notes, recommendation_requests(id, application_id, status, due_on, asked_on, submitted_on)")
      .order("created_at"),
    supabase.from("applications").select("id, program_cycles(programs(title, institutions(name)))").neq("status", "withdrawn"),
  ]);
  const title = new Map((apps ?? []).map((a) => [a.id, `${a.program_cycles?.programs?.title ?? "Course"}, ${a.program_cycles?.programs?.institutions?.name ?? ""}`]));

  return (
    <div className="grid gap-8">
      <header>
        <Link href="/app/tracker" className="text-sm text-muted underline underline-offset-2">Tracker</Link>
        <h1 className="mt-2 text-4xl font-semibold">Recommendation letters</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Who is writing for you and for which applications. We keep only their name and how they know you, and we never
          contact them; we remind you to check in before each letter is due.
        </p>
      </header>

      {(recommenders ?? []).map((r) => {
        const linked = new Set(r.recommendation_requests.map((q) => q.application_id));
        const open = [...title].filter(([id]) => !linked.has(id));
        return (
          <section key={r.id} aria-label={r.name} className="grid gap-3 rounded-2xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {r.name}
                {r.relationship ? <span className="font-normal text-muted"> · {r.relationship}</span> : null}
              </h2>
              <form action={removeRecommender.bind(null, r.id)}>
                <button className="btn btn-secondary btn-sm">Remove {r.name}</button>
              </form>
            </div>
            {r.recommendation_requests.length ? (
              <ul className="grid gap-2">
                {r.recommendation_requests.map((q) => <RequestRow key={q.id} request={q} title={title.get(q.application_id) ?? "Application"} />)}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not writing for any application yet.</p>
            )}
            {open.length ? (
              <form action={addRequest.bind(null, r.id)} className="flex flex-wrap items-end gap-2 text-sm">
                <label className="grid gap-1">
                  Add a letter for
                  <select name="application_id" className="field" style={{ width: "18rem" }}>
                    {open.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  Status
                  <select name="status" defaultValue="not_asked" className="field" style={{ width: "10rem" }}>
                    {Object.entries(LETTER_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  Letter due
                  <input type="date" name="due_on" className="field" style={{ width: "10.5rem" }} />
                </label>
                <button className="btn btn-secondary">Add</button>
              </form>
            ) : null}
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Brag sheet for {r.name}</summary>
              <form action={saveBragNotes.bind(null, r.id)} className="mt-3 grid gap-2">
                <label className="grid gap-1">
                  What you hope {r.name} might mention, one point per line
                  <textarea
                    name="brag_notes"
                    rows={4}
                    maxLength={3000}
                    defaultValue={r.brag_notes ?? ""}
                    placeholder="For example: led the 4-person capstone and built its scheduling model"
                    className="field"
                  />
                </label>
                <p className="text-muted">Facts they can check, in your words. The sheet adds your CV and the courses and due dates for their letters.</p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-secondary btn-sm">Save notes</button>
                  <Link href={`/app/recommenders/${r.id}/brag-sheet`} className="btn btn-secondary btn-sm">Open printable brag sheet</Link>
                </div>
              </form>
            </details>
          </section>
        );
      })}

      <form action={addRecommender} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <h2 className="text-lg font-semibold sm:col-span-3">Add a recommender</h2>
        <label className="grid gap-1 text-sm">Name<input name="name" required maxLength={120} className="field" /></label>
        <label className="grid gap-1 text-sm">How they know you (optional)<input name="relationship" maxLength={120} placeholder="For example: thesis supervisor" className="field" /></label>
        <button className="btn btn-primary">Add recommender</button>
      </form>
    </div>
  );
}
