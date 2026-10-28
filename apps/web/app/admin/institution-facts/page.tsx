import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactBadge } from "@/components/facts";
import { getRoles } from "@/lib/roles";
import { label } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { addFact, verifyFact } from "./actions";

export const metadata: Metadata = { title: "Institution facts" };

const KINDS = ["assistantship", "on_campus_work", "housing_on_campus", "housing_off_campus", "transit_pass", "parking", "airport", "arrival_support", "course_registration", "health_insurance"];

export default async function InstitutionFactsAdmin() {
  const { supabase, user } = await getUser();
  const roles = await getRoles(supabase, user!.id);
  if (!roles.admin && !roles.verifier) notFound();
  const [{ data: facts }, { data: institutions }] = await Promise.all([
    supabase.from("institution_facts").select("*, institutions(name, country), sources(url)").order("status").order("created_at", { ascending: false }).limit(200),
    supabase.from("institutions").select("id, name, country").order("name").limit(500),
  ]);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12">
      <header>
        <Link href="/admin/review" className="text-sm text-muted underline underline-offset-2">Review queue</Link>
        <h1 className="mt-2 text-4xl font-semibold">Institution facts</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Funding, housing, transit and arrival facts for one institution. The source must be on the institution&apos;s own
          domain, with a short verbatim quote. Entries start unverified; verify after checking the page yourself.
        </p>
      </header>

      <ul className="grid gap-2">
        {(facts ?? []).map((f) => (
          <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
            <div className="grid gap-1">
              <span className="font-semibold">{f.title}</span>
              <span className="text-muted">{label(f.kind)} · {f.institutions?.name} ({f.institutions?.country})</span>
              {f.sources ? <a href={f.sources.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source</a> : null}
              <q className="text-muted italic">{f.evidence_quote}</q>
            </div>
            <div className="flex items-center gap-2">
              <FactBadge status={f.status} />
              {f.status !== "verified" ? (
                <form action={verifyFact.bind(null, f.id)}><button className="btn btn-secondary btn-sm">Verify</button></form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <form action={addFact} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Add a fact</h2>
        <label className="grid gap-1 text-sm">Institution
          <select name="institution" required className="field">
            {(institutions ?? []).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.country})</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Kind
          <select name="kind" className="field">{KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">Title<input name="title" required maxLength={200} className="field" /></label>
        <label className="grid gap-1 text-sm">Official page (on the institution&apos;s domain)<input name="source" type="url" required className="field" /></label>
        <label className="grid gap-1 text-sm">Only for this course (course id, empty for the whole institution)<input name="program" className="field" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Details<textarea name="details" rows={2} maxLength={1000} className="field" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Verbatim quote from the page<textarea name="quote" required rows={2} maxLength={1000} className="field" /></label>
        <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-4">
          <legend className="px-1 text-sm text-muted">Numbers the page states</legend>
          <label className="grid gap-1 text-sm">Amount<input name="amount" type="number" min="0" step="any" className="field" /></label>
          <label className="grid gap-1 text-sm">Currency<input name="currency" maxLength={3} className="field" /></label>
          <label className="grid gap-1 text-sm">Period
            <select name="period" className="field">
              <option value="">None</option><option value="per_month">Per month</option><option value="per_term">Per term</option>
              <option value="per_year">Per year</option><option value="one_off">One off</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">Hours per week<input name="hours_per_week" type="number" min="1" max="80" className="field" /></label>
        </fieldset>
        <button className="btn btn-primary justify-self-start">Add fact</button>
      </form>
    </div>
  );
}
