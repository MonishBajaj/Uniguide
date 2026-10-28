import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { label, shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { approve, reject } from "./actions";

export const metadata: Metadata = { title: "Review queue", robots: { index: false } };

type Issue = { level: string; code: string; message: string };
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
  program_cycles: { label: string; programs: { slug: string; title: string; institutions: { name: string } | null } | null } | null;
};

const HIDDEN = new Set(["_seed_key"]);

export default async function ReviewQueue() {
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();

  const { data: versions, count } = await supabase
    .from("fact_versions")
    .select(
      "id, subject, subject_id, proposed, evidence_quote, validation, created_by, created_at, sources(url, owner), program_cycles(label, programs(slug, title, institutions(name)))",
      { count: "exact" },
    )
    .eq("review_state", "pending")
    .order("created_at")
    .limit(50)
    .returns<Version[]>();

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Review queue</h1>
      <p className="mt-2 text-muted">
        {count ?? 0} facts waiting. Open the source, find the quote, and check the value matches the page and the intake.
        Deadlines, eligibility and tuition are only shown as verified after this step.
      </p>

      {(versions ?? []).length === 0 ? (
        <div className="mt-8 rounded-2xl bg-surface p-8">
          <h2 className="text-xl font-semibold">Queue is empty</h2>
          <p className="mt-2 text-muted">New extractions from the worker and seed files appear here.</p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {versions!.map((v) => {
            const program = v.program_cycles?.programs;
            const errors = v.validation.filter((i) => i.level === "error");
            return (
              <li key={v.id} className="rounded-2xl bg-surface p-6">
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
