import type { Metadata } from "next";
import Link from "next/link";
import { LETTER_STATUSES } from "@/lib/recommendations";
import { getUser } from "@/lib/supabase/server";
import { addRecommender, addRequest, removeRecommender, saveBragNotes } from "./actions";
import { RequestRow } from "./request-row";
import { courseLabel } from "@/lib/own-application";
import { Users, Mail, Plus, ChevronLeft } from "lucide-react";

export const metadata: Metadata = { title: "Recommendation letters" };

export default async function RecommendersPage() {
  const { supabase } = await getUser();
  const [{ data: recommenders }, { data: apps }] = await Promise.all([
    supabase
      .from("recommenders")
      .select("id, name, relationship, brag_notes, recommendation_requests(id, application_id, status, due_on, asked_on, submitted_on)")
      .order("created_at"),
    supabase.from("applications").select("id, own_title, own_institution, program_cycles(programs(title, institutions(name)))").neq("status", "withdrawn"),
  ]);
  const title = new Map((apps ?? []).map((a) => [a.id, courseLabel(a)]));

  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <div>
        <Link href="/app/tracker" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary transition-colors">
          <ChevronLeft className="h-4 w-4" />
          <span>Back to Tracker</span>
        </Link>
      </div>

      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">LOR Management Hub</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Recommendation Letters</h1>
        <p className="mt-2 text-sm text-muted max-w-2xl leading-relaxed">
          Manage professors, supervisors, and mentors writing letters for your applications. We store only their name and professional relationship, and we never contact them directly without your consent.
        </p>
      </header>

      {/* Add Recommender Card */}
      <section className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <h2 className="text-lg font-serif font-bold text-primary mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-secondary" />
          <span>Add a Recommender</span>
        </h2>
        <form action={addRecommender} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Full Name
            <input name="name" required placeholder="Dr. Jane Smith" className="field text-sm" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Relationship
            <input name="relationship" placeholder="Undergraduate Thesis Supervisor" className="field text-sm" />
          </label>
          <div className="sm:col-span-2 flex justify-end pt-2">
            <button className="btn btn-coral-bright btn-sm shadow-xs">Add Recommender</button>
          </div>
        </form>
      </section>

      {/* Existing Recommenders List */}
      {(recommenders ?? []).map((r) => {
        const linked = new Set(r.recommendation_requests.map((q) => q.application_id));
        const open = [...title].filter(([id]) => !linked.has(id));
        return (
          <section key={r.id} aria-label={r.name} className="grid gap-5 rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-4">
              <div>
                <h2 className="text-xl font-serif font-bold text-primary">
                  {r.name}
                </h2>
                {r.relationship ? <p className="text-xs text-muted mt-0.5">{r.relationship}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/app/recommenders/${r.id}/brag-sheet`} className="btn btn-secondary btn-sm">
                  Brag Sheet
                </Link>
                <form action={removeRecommender.bind(null, r.id)}>
                  <button className="btn btn-secondary btn-sm text-conflicting hover:bg-conflicting/10">Remove</button>
                </form>
              </div>
            </div>

            {r.recommendation_requests.length ? (
              <div className="grid gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Assigned Applications</h3>
                <ul className="grid gap-2">
                  {r.recommendation_requests.map((q) => <RequestRow key={q.id} request={q} title={title.get(q.application_id) ?? "Application"} />)}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted">Not assigned to any application yet.</p>
            )}

            {open.length ? (
              <form action={addRequest.bind(null, r.id)} className="flex flex-wrap items-end gap-3 text-xs pt-3 border-t border-border/60">
                <label className="grid gap-1 font-semibold text-muted">
                  Assign to application
                  <select name="application_id" className="field text-xs py-1.5" style={{ width: "20rem" }}>
                    {open.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
                  </select>
                </label>
                <button className="btn btn-secondary btn-sm py-1.5">Assign</button>
              </form>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
