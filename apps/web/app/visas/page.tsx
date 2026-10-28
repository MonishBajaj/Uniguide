import type { Metadata } from "next";
import { FactBadge } from "@/components/facts";
import { countryName } from "@/lib/format";
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

export default async function VisasPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("country_rules")
    .select("id, destination, applies_to, kind, title, details, link, status, evidence_quote")
    .order("destination")
    .order("kind", { ascending: false });
  const byCountry = new Map<string, NonNullable<typeof rules>>();
  for (const r of rules ?? []) byCountry.set(r.destination, [...(byCountry.get(r.destination) ?? []), r]);

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
        <div className="grid gap-4 md:grid-cols-2">
          {[...byCountry.entries()].map(([country, list]) => (
            <article key={country} className="grid content-start gap-3 rounded-2xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold">{countryName(country)}</h3>
              <ul className="grid gap-3 text-sm">
                {list.map((r) => (
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
            </article>
          ))}
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
