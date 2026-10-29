import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { rulesFor } from "@uniguide/matching";
import { toCountryRule } from "@/lib/country-rules";
import { COUNTRIES, countryName } from "@/lib/format";
import { orderSteps } from "@/lib/visa-steps";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Student visas: official sources by country",
  description: "Links to each government's own student visa pages, plus country rules such as Germany's APS certificate.",
};

const PREP = [
  {
    title: "Know your course",
    body: "Be ready to say in your own words what you will study, why this course and this institution, and how it connects to what you did before.",
  },
  {
    title: "Know your funding",
    body: "Know who pays for tuition and living costs, how much, and where the documents that show it are. Officers check that the numbers match your papers.",
  },
  {
    title: "Bring what the official list asks for",
    body: "Use the checklist on the government page for your visa, not a list from an agent or a forum. Requirements change between years.",
  },
  {
    title: "Answer truthfully",
    body: "Never memorise a script or let anyone write answers for you. Inconsistent or false answers can lead to refusal and bans on future applications.",
  },
];

/** Kinds listed in their own blocks rather than in the general list. */
const OWN_BLOCK = new Set(["visa_step", "post_study_work", "work_hours", "banking", "credential_evaluation"]);

export default async function VisasPage({ searchParams }: PageProps<"/visas">) {
  const raw = (await searchParams).from;
  const from = typeof raw === "string" && /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("country_rules")
    .select("*")
    .order("destination")
    .order("kind", { ascending: false });
  const byCountry = new Map<string, NonNullable<typeof rules>>();
  for (const r of rules ?? []) byCountry.set(r.destination, [...(byCountry.get(r.destination) ?? []), r]);
  // With a residence chosen, show only the rules that apply to it; otherwise show all, each labelled.
  const visible = (country: string, list: NonNullable<typeof rules>) => {
    if (!from) return list;
    const ids = new Set(rulesFor(list.map(toCountryRule), country, from).map((r) => r.id));
    return list.filter((r) => ids.has(r.id));
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-16">
      <header className="grid gap-3">
        <h1 className="text-4xl font-semibold">Student visas</h1>
        <p className="max-w-[680px] text-muted">
          We link only to each government&apos;s own pages. We do not give immigration advice or predict visa decisions;
          the official page and a registered adviser are the authorities.
        </p>
      </header>

      <section aria-labelledby="by-country" className="grid gap-4">
        <h2 id="by-country" className="text-2xl font-semibold">Official pages by destination</h2>
        <form className="flex flex-wrap items-end gap-3" role="search">
          <label className="grid gap-1 text-sm">Where you live now
            <select name="from" defaultValue={from ?? ""} className="field">
              <option value="">Show every rule</option>
              {Object.keys(COUNTRIES).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
            </select>
          </label>
          <button className="btn btn-secondary">Apply</button>
        </form>
        <div className="grid gap-4 md:grid-cols-2">
          {[...byCountry.entries()].map(([country, all]) => {
            const list = visible(country, all);
            const steps = orderSteps(list.map(toCountryRule));
            return (
            <article key={country} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold">{countryName(country)}</h3>
              <ul className="grid gap-3 text-sm">
                {list.filter((r) => !OWN_BLOCK.has(r.kind)).map((r) => (
                  <li key={r.id} className="grid gap-1">
                    {r.link ? (
                      <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{r.title}</a>
                    ) : (
                      <span className="font-semibold">{r.title}</span>
                    )}
                    {r.applies_to.length ? (
                      <span className="text-muted">For applicants from {r.applies_to.map(countryName).join(", ")}</span>
                    ) : null}
                    {r.details ? <span className="text-muted">{r.details}</span> : null}
                    {r.evidence_quote ? <q className="text-muted italic">{r.evidence_quote}</q> : null}
                    {r.kind !== "visa_info" ? <span><FactBadge status={r.status} /></span> : null}
                  </li>
                ))}
              </ul>
              {list.some((r) => r.kind === "post_study_work" || r.kind === "work_hours") ? (
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Working while you study and after</h4>
                  <ul className="grid gap-3 text-sm">
                    {list.filter((r) => r.kind === "post_study_work" || r.kind === "work_hours").map((r) => (
                      <li key={r.id} className="grid gap-1">
                        {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{r.title}</a> : <span className="font-semibold">{r.title}</span>}
                        {r.applies_to.length ? <span className="text-muted">For applicants from {r.applies_to.map(countryName).join(", ")}</span> : null}
                        <span>
                          {r.kind === "work_hours" && r.hours_per_week ? `Up to ${r.hours_per_week} hours a week during study` : null}
                          {r.kind === "post_study_work" && r.months ? `${r.months} months after graduating` : null}
                        </span>
                        {r.evidence_quote ? <q className="text-muted italic">{r.evidence_quote}</q> : null}
                        <span><FactBadge status={r.status} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {list.some((r) => r.kind === "credential_evaluation") ? (
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Getting your qualification assessed</h4>
                  <p className="text-xs text-muted">We keep your grades on their own scale. This is the official service that assesses foreign qualifications here.</p>
                  <ul className="grid gap-3 text-sm">
                    {list.filter((r) => r.kind === "credential_evaluation").map((r) => (
                      <li key={r.id} className="grid gap-1">
                        {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{r.title}</a> : <span className="font-semibold">{r.title}</span>}
                        {r.evidence_quote ? <q className="text-muted italic">{r.evidence_quote}</q> : null}
                        <span><FactBadge status={r.status} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {list.some((r) => r.kind === "banking") ? (
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Money and banking</h4>
                  <ul className="grid gap-3 text-sm">
                    {list.filter((r) => r.kind === "banking").map((r) => (
                      <li key={r.id} className="grid gap-1">
                        {r.link ? <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{r.title}</a> : <span className="font-semibold">{r.title}</span>}
                        {r.applies_to.length ? <span className="text-muted">For applicants from {r.applies_to.map(countryName).join(", ")}</span> : null}
                        {r.details ? <span className="text-muted">{r.details}</span> : null}
                        {r.evidence_quote ? <q className="text-muted italic">{r.evidence_quote}</q> : null}
                        <span><FactBadge status={r.status} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {list.some((r) => r.kind === "proof_of_funds") ? (
                <Link href="/visas/funds" className="text-sm underline underline-offset-2">Work out the proof of funds for a course</Link>
              ) : null}
              {steps.length > 0 ? (
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Steps to apply</h4>
                  <ol className="grid list-decimal gap-3 pl-5 text-sm">
                    {steps.map((s) => (
                      <li key={s.id} className="grid gap-1">
                        {s.link ? <a href={s.link} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">{s.title}</a> : <span className="font-semibold">{s.title}</span>}
                        {s.appliesTo?.length ? <span className="text-muted">For applicants from {s.appliesTo.map(countryName).join(", ")}</span> : null}
                        {s.details ? <span className="text-muted">{s.details}</span> : null}
                        {s.evidenceQuote ? <q className="text-muted italic">{s.evidenceQuote}</q> : null}
                        <span><FactBadge status={s.status ?? "unknown"} /></span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="prep" className="grid gap-4">
        <h2 id="prep" className="text-2xl font-semibold">Preparing for a visa interview</h2>
        <p className="max-w-[680px] text-muted">
          Not every country interviews students. Where one does, these habits help everyone, whatever the country.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {PREP.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
