import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactBadge } from "@/components/facts";
import { shortDate } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { addPolicy, verifyPolicy } from "./actions";

export const metadata: Metadata = { title: "AI policies", robots: { index: false } };

const POLICY: Record<string, string> = { allows: "Allows AI help", limited: "Allows limited AI help", bans: "Doesn't allow AI help" };

type Row = {
  id: string;
  policy: string;
  status: "verified" | "unverified" | "conflicting" | "unknown";
  evidence_quote: string;
  verified_at: string | null;
  created_at: string;
  sources: { url: string } | null;
  programs: { slug: string; title: string; institutions: { name: string } | null } | null;
};

/**
 * M7 A1.7: each course's policy on AI help in application essays. An entry starts unverified; verify it after
 * checking the official page yourself. Only a verified "allows" lets the extension paste a final draft; anything
 * else, and no entry at all, counts as a ban (owner decision 3).
 */
export default async function AiPoliciesAdmin() {
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();
  const { data } = await supabase
    .from("program_ai_policies")
    .select("id, policy, status, evidence_quote, verified_at, created_at, sources(url), programs(slug, title, institutions(name))")
    .order("status")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12">
      <header>
        <Link href="/admin/review" className="text-sm text-muted underline underline-offset-2">Review queue</Link>
        <h1 className="mt-2 text-4xl font-semibold">AI policies</h1>
        <p className="mt-2 max-w-2xl text-muted">
          A course&apos;s policy on AI help in application essays, from its official page with a short verbatim quote. Entries start
          unverified; verify after checking the page yourself. Until a course has a verified &quot;allows&quot;, the extension won&apos;t paste
          into its essay fields.
        </p>
      </header>

      <section aria-labelledby="add" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 id="add" className="text-lg font-semibold">Add a policy</h2>
        <form action={addPolicy} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            Course slug
            <input name="slug" required className="field font-normal" placeholder="exampleton-msc-data-science" />
          </label>
          <div className="grid gap-1 text-sm font-semibold">
            <label htmlFor="policy">Policy</label>
            <select id="policy" name="policy" required className="field font-normal">
              <option value="allows">{POLICY.allows}</option>
              <option value="limited">{POLICY.limited}</option>
              <option value="bans">{POLICY.bans}</option>
            </select>
          </div>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
            Official page
            <input name="source" type="url" required className="field font-normal" placeholder="https://" />
          </label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
            Quote from the page
            <textarea name="quote" required minLength={3} maxLength={1000} rows={3} className="field font-normal" />
          </label>
          <button className="btn btn-primary justify-self-start">Add policy</button>
        </form>
      </section>

      <section aria-labelledby="list" className="grid gap-3">
        <h2 id="list" className="text-2xl font-semibold">Policies</h2>
        {rows.length === 0 ? <p className="text-muted">No policies yet.</p> : null}
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {r.programs ? (
                  <Link href={`/courses/${r.programs.slug}`} className="font-semibold underline underline-offset-2">
                    {r.programs.title}
                    {r.programs.institutions ? `, ${r.programs.institutions.name}` : ""}
                  </Link>
                ) : null}
                <span>· {POLICY[r.policy] ?? r.policy}</span>
                <FactBadge status={r.status} />
              </div>
              <blockquote className="rounded-lg border border-border bg-background px-3 py-2">{r.evidence_quote}</blockquote>
              <p className="text-muted">
                {r.sources ? <a href={r.sources.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">Official page</a> : "No source"} · added{" "}
                {shortDate(r.created_at)}
                {r.verified_at ? ` · verified ${shortDate(r.verified_at)}` : ""}
              </p>
              {r.status !== "verified" ? (
                <form action={verifyPolicy.bind(null, r.id)}>
                  <button className="btn btn-secondary btn-sm">
                    Verify<span className="sr-only">: {r.programs?.title ?? "this policy"}</span>
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
