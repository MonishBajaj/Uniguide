import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactBadge } from "@/components/facts";
import { countryName } from "@/lib/format";
import { getUser } from "@/lib/supabase/server";
import { addRule, addStat, verifyRule, verifyStat } from "./actions";

export const metadata: Metadata = { title: "Country rules and admit rates" };

export default async function RulesAdmin() {
  const { supabase, user } = await getUser();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user!.id).maybeSingle();
  if (!admin) notFound();
  const [{ data: rules }, { data: stats }] = await Promise.all([
    supabase.from("country_rules").select("*, sources(url)").order("status").order("destination"),
    supabase.from("program_stats").select("*, programs(slug, title), sources(url)").order("status").order("created_at", { ascending: false }).limit(100),
  ]);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12">
      <header>
        <Link href="/admin/review" className="text-sm text-muted underline underline-offset-2">Review queue</Link>
        <h1 className="mt-2 text-4xl font-semibold">Country rules and admit rates</h1>
        <p className="mt-2 max-w-2xl text-muted">Each entry needs the official page and a short verbatim quote. Entries start unverified; verify after checking the page yourself.</p>
      </header>

      <section aria-labelledby="rules" className="grid gap-4">
        <h2 id="rules" className="text-2xl font-semibold">Country rules</h2>
        <ul className="grid gap-2">
          {(rules ?? []).map((r) => ({ ...r, url: r.sources?.url ?? r.link })).map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="grid gap-1">
                <span className="font-semibold">{countryName(r.destination)}: {r.title}</span>
                <span className="text-muted">{r.kind}{r.applies_to.length ? ` · for ${r.applies_to.join(", ")}` : " · everyone"}{r.lead_days ? ` · start ${r.lead_days} days ahead` : ""}</span>
                {r.evidence_quote ? <q className="text-muted italic">{r.evidence_quote}</q> : null}
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{new URL(r.url).hostname}</a> : null}
              </div>
              <div className="flex items-center gap-2">
                <FactBadge status={r.status} />
                {r.status !== "verified" ? (
                  <form action={verifyRule.bind(null, r.id)}><button className="btn btn-secondary btn-sm">Verify</button></form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <form action={addRule} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Add a rule</h3>
          <label className="grid gap-1 text-sm">Destination (two letters)<input name="destination" required maxLength={2} className="field" /></label>
          <label className="grid gap-1 text-sm">Kind
            <select name="kind" className="field">
              <option value="aps_certificate">Academic document check (for example APS)</option>
              <option value="proof_of_funds">Proof of funds</option>
              <option value="visa_info">Official visa page</option>
              <option value="visa_step">Visa step</option>
              <option value="post_study_work">Work after graduation</option>
              <option value="work_hours">Part time work hours</option>
              <option value="banking">Money and banking</option>
              <option value="credential_evaluation">Qualification assessment service</option>
              <option value="health_insurance">Health insurance</option>
              <option value="residence_registration">Registering after arrival</option>
              <option value="housing">Housing</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">Title<input name="title" required maxLength={200} className="field" /></label>
          <label className="grid gap-1 text-sm">Only for residents of (comma separated, empty for everyone)<input name="applies_to" className="field" /></label>
          <label className="grid gap-1 text-sm">Official page<input name="source" type="url" required className="field" /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">What students should do<textarea name="details" rows={2} maxLength={1000} className="field" /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Verbatim quote from the page<textarea name="quote" required rows={2} maxLength={1000} className="field" /></label>
          <fieldset className="grid gap-3 rounded-lg border border-border p-3 sm:col-span-2 sm:grid-cols-3">
            <legend className="px-1 text-sm text-muted">Numbers the page states (only what applies to this kind)</legend>
            <label className="grid gap-1 text-sm">Amount<input name="amount" type="number" min="0" step="any" className="field" /></label>
            <label className="grid gap-1 text-sm">Currency (for example GBP)<input name="currency" maxLength={3} className="field" /></label>
            <label className="grid gap-1 text-sm">Period
              <select name="period" className="field">
                <option value="">None</option>
                <option value="per_month">Per month</option>
                <option value="per_year">Per year</option>
                <option value="total">Total</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">Months (months of funds, or months allowed to work)<input name="months" type="number" min="1" max="120" className="field" /></label>
            <label className="grid gap-1 text-sm">Hours per week<input name="hours_per_week" type="number" min="1" max="80" className="field" /></label>
            <label className="grid gap-1 text-sm">Step number (visa steps)<input name="step" type="number" min="0" className="field" /></label>
            <label className="grid gap-1 text-sm sm:col-span-3">Region (for example london; empty for the whole country)<input name="region" maxLength={60} className="field" /></label>
            <label className="grid gap-1 text-sm">Days ahead to start (lead time)<input name="lead_days" type="number" min="1" max="365" className="field" /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">The page&apos;s words for that lead time<input name="lead_days_quote" maxLength={500} className="field" /></label>
          </fieldset>
          <button className="btn btn-primary justify-self-start">Add rule</button>
        </form>
      </section>

      <section aria-labelledby="stats" className="grid gap-4">
        <h2 id="stats" className="text-2xl font-semibold">Published admit rates</h2>
        <p className="max-w-2xl text-sm text-muted">Only rates an institution publishes for a specific course. They feed the optional reach, target and likely bands.</p>
        <ul className="grid gap-2">
          {(stats ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
              <div className="grid gap-1">
                <span className="font-semibold">{s.programs?.title} · {s.cycle_label} · {Math.round(Number(s.admit_rate) * 1000) / 10}%</span>
                {s.evidence_quote ? <q className="text-muted italic">{s.evidence_quote}</q> : null}
                {s.sources?.url ? <a href={s.sources.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{new URL(s.sources.url).hostname}</a> : null}
              </div>
              <div className="flex items-center gap-2">
                <FactBadge status={s.status} />
                {s.status !== "verified" ? (
                  <form action={verifyStat.bind(null, s.id)}><button className="btn btn-secondary btn-sm">Verify and publish</button></form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <form action={addStat} className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Add an admit rate</h3>
          <label className="grid gap-1 text-sm">Course slug<input name="slug" required className="field" /></label>
          <label className="grid gap-1 text-sm">Intake (for example 2026-autumn)<input name="cycle" required pattern="\d{4}-[a-z]+" className="field" /></label>
          <label className="grid gap-1 text-sm">Admit rate (%)<input name="rate" type="number" step="0.1" min="0.1" max="100" required className="field" /></label>
          <label className="grid gap-1 text-sm">Official page<input name="source" type="url" required className="field" /></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Verbatim quote from the page<textarea name="quote" required rows={2} maxLength={1000} className="field" /></label>
          <button className="btn btn-primary justify-self-start">Add rate</button>
        </form>
      </section>
    </div>
  );
}
