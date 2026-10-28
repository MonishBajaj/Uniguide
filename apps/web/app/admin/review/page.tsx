import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoles } from "@/lib/roles";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { approve, reject, resolveReport } from "./actions";

export const metadata: Metadata = { title: "Review queue", robots: { index: false } };

type Issue = { level: string; code: string; message: string };
type Report = {
  id: string;
  message: string;
  evidence_url: string | null;
  subject: string | null;
  created_at: string;
  programs: { slug: string; title: string } | null;
};

type Version = {
  id: string;
  subject: string;
  subject_id: string | null;
  proposed: Record<string, unknown>;
  evidence_quote: string;
  validation: Issue[];
  created_by: string;
  created_at: string;
  sources: { url: string; owner: string } | null;
  program_cycles: { label: string; program_id: string; programs: { slug: string; title: string; institutions: { name: string } | null } | null } | null;
};

const HIDDEN = new Set(["_seed_key"]);

export default async function ReviewQueue() {
  const { supabase, user } = await getUser();
  const roles = await getRoles(supabase, user!.id);
  if (!roles.admin && !roles.verifier) notFound();

  const [{ data: pending, count }, { data: demand }, { data: reports }] = await Promise.all([
    supabase
      .from("fact_versions")
      .select(
        "id, subject, subject_id, proposed, evidence_quote, validation, created_by, created_at, sources(url, owner), program_cycles(label, program_id, programs(slug, title, institutions(name)))",
        { count: "exact" },
      )
      .eq("review_state", "pending")
      .order("created_at")
      .limit(500)
      .returns<Version[]>(),
    supabase.rpc("verification_demand", { p_limit: 200 }),
    // Reports pay credits when accepted, so only admins resolve them.
    supabase
      .from("fact_reports")
      .select("id, message, evidence_url, subject, created_at, programs(slug, title)")
      .eq("status", "open")
      .order("created_at")
      .returns<Report[]>(),
  ]);

  // Verification follows demand: the most-shortlisted courses first, then the nearest deadline.
  const rank = new Map((demand ?? []).map((d, i) => [d.program_id, i]));
  const versions = [...(pending ?? [])]
    .sort((a, b) => {
      const ra = rank.get(a.program_cycles?.program_id ?? "") ?? Infinity;
      const rb = rank.get(b.program_cycles?.program_id ?? "") ?? Infinity;
      return ra - rb || a.created_at.localeCompare(b.created_at);
    })
    .slice(0, 50);
  const wanted = (demand ?? []).filter((d) => d.facts_unverified > 0).slice(0, 10);
  const titles = new Map((pending ?? []).map((v) => [v.program_cycles?.program_id, v.program_cycles?.programs]));

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Review queue</h1>
      <p className="mt-2 text-muted">
        {count ?? 0} facts waiting. Open the source, find the quote, and check the value matches the page and the intake.
        Deadlines, eligibility and tuition are only shown as verified after this step.
      </p>
      {roles.verifier ? (
        <p className="mt-2 text-sm text-muted">
          You review courses in {roles.verifier.countries.join(", ")} as {roles.verifier.display_name}.
        </p>
      ) : null}

      {wanted.length ? (
        <section aria-labelledby="wanted" className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <h2 id="wanted" className="text-lg font-semibold">Most wanted</h2>
          <p className="text-sm text-muted">Courses students shortlisted that still have facts waiting.</p>
          <ul className="mt-3 grid gap-1 text-sm">
            {wanted.map((d) => (
              <li key={d.program_id}>
                {titles.get(d.program_id)?.title ?? d.program_id}: {d.shortlists} shortlists, {d.facts_unverified} waiting
                {d.next_deadline ? `, next deadline ${shortDate(d.next_deadline)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {roles.admin && (reports ?? []).length ? (
        <section aria-labelledby="reports" className="mt-8 grid gap-3">
          <h2 id="reports" className="text-2xl font-semibold">Reports from students ({reports!.length})</h2>
          {reports!.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <p className="text-muted">{shortDate(r.created_at)} · {r.subject ? label(r.subject) : "general"} ·{" "}
                {r.programs ? <Link href={`/courses/${r.programs.slug}`} className="underline underline-offset-2">{r.programs.title}</Link> : null}
              </p>
              <p className="mt-1">{r.message}</p>
              {r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{r.evidence_url}</a> : null}
              <div className="mt-3 flex gap-2">
                <form action={resolveReport.bind(null, r.id, true)}><button className="btn btn-primary btn-sm">Correct, credit them</button></form>
                <form action={resolveReport.bind(null, r.id, false)}><button className="btn btn-secondary btn-sm">Page still matches</button></form>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {(versions ?? []).length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">Queue is empty</h2>
          <p className="mt-2 text-muted">New extractions from the worker and seed files appear here.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {versions!.map((v) => {
            const program = v.program_cycles?.programs;
            const errors = v.validation.filter((i) => i.level === "error");
            return (
              <li key={v.id} className="rounded-2xl border border-border bg-surface p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  <span>
                    {label(v.subject)} · {v.subject_id ? "update to an existing fact" : "new fact"} · from {v.created_by} ·{" "}
                    {shortDate(v.created_at)}
                  </span>
                  <span>{v.program_cycles?.label}</span>
                </div>
                {program ? (
                  <h2 className="mt-2 text-lg font-semibold">
                    <Link href={`/courses/${program.slug}`} className="underline-offset-2 hover:underline">{program.title}</Link>
                    <span className="font-normal text-muted">, {program.institutions?.name}</span>
                  </h2>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {Object.entries(v.proposed)
                      .filter(([k, value]) => !HIDDEN.has(k) && value != null)
                      .map(([k, value]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted">{k}</dt>
                          <dd className="font-mono break-all">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                  <div className="grid gap-2 text-sm">
                    <blockquote className="rounded-lg bg-background p-3">&ldquo;{v.evidence_quote}&rdquo;</blockquote>
                    {v.sources ? (
                      <a href={v.sources.url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
                        {v.sources.owner}: {v.sources.url}
                      </a>
                    ) : null}
                    {v.validation.map((i) => (
                      <p key={i.code} className={i.level === "error" ? "text-conflicting" : "text-unverified"}>
                        {i.level === "error" ? "Blocked" : "Check"}: {i.message}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <form action={approve.bind(null, v.id)}>
                    <button className="btn btn-primary btn-sm" disabled={errors.length > 0} title={errors.length ? "Fix or reject: validation errors" : undefined}>
                      Verified
                    </button>
                  </form>
                  <form action={approve.bind(null, v.id)}>
                    <input type="hidden" name="status" value="conflicting" />
                    <button className="btn btn-secondary btn-sm">Official pages disagree</button>
                  </form>
                  <form action={reject.bind(null, v.id)} className="flex gap-2">
                    <label className="sr-only" htmlFor={`reason-${v.id}`}>Reason</label>
                    <input id={`reason-${v.id}`} name="reason" placeholder="Reason" className="field py-1 text-sm" />
                    <button className="btn btn-secondary btn-sm">Reject</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
