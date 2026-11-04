import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { rulesFor } from "@uniguide/matching";
import { toCountryRule } from "@/lib/country-rules";
import { COUNTRIES, countryName } from "@/lib/format";
import { orderSteps } from "@/lib/visa-steps";
import { createClient } from "@/lib/supabase/server";
import { Globe, ShieldCheck, CheckCircle2, ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "Student visas: official sources by country",
  description: "Links to each government's own student visa pages, plus country rules such as Germany's APS certificate.",
};

const PREP = [
  {
    title: "Know your course",
    body: "Be ready to explain in your own words what you will study, why this specific university and program, and how it aligns with your academic and career trajectory.",
  },
  {
    title: "Know your funding sources",
    body: "Know exactly who pays for tuition and living costs, how much, and where the verified financial documents are. Consular officers check that your numbers match your statements.",
  },
  {
    title: "Follow the official checklist",
    body: "Always follow the verified checklist on the government embassy page for your visa category, not generic lists from forums. Requirements update frequently.",
  },
  {
    title: "Answer truthfully & consistently",
    body: "Never memorise a script or let an external third-party fabricate answers. Inconsistent answers can lead to immediate refusal and multi-year visa bans.",
  },
];

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

  const visible = (country: string, list: NonNullable<typeof rules>) => {
    if (!from) return list;
    const ids = new Set(rulesFor(list.map(toCountryRule), country, from).map((r) => r.id));
    return list.filter((r) => ids.has(r.id));
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-6 py-12">
      <header className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Global Immigration Center</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Student Visas & Official Regulations</h1>
        <p className="mt-2 max-w-2xl text-muted text-sm leading-relaxed">
          We link exclusively to each national government&apos;s verified immigration pages. We do not provide unofficial immigration advice or predict visa decisions; we equip you with official checklists and timelines.
        </p>

        <div className="mt-6 pt-4 border-t border-border/60 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-muted">Filter by your citizenship:</span>
          <Link
            href="/visas"
            className={`rounded-full px-3 py-1 font-semibold border ${!from ? "bg-primary text-white border-primary" : "bg-surface border-border text-muted hover:border-primary/40"}`}
          >
            All applicant origins
          </Link>
          {["IN", "CN", "NG", "VN"].map((c) => (
            <Link
              key={c}
              href={`/visas?from=${c}`}
              className={`rounded-full px-3 py-1 font-semibold border ${from === c ? "bg-primary text-white border-primary" : "bg-surface border-border text-muted hover:border-primary/40"}`}
            >
              From {countryName(c)}
            </Link>
          ))}
        </div>
      </header>

      {/* Preparation Guidelines */}
      <section aria-labelledby="prep-heading">
        <div className="text-center mb-8">
          <h2 id="prep-heading" className="text-2xl font-serif font-bold text-primary">Core Visa Preparation Principles</h2>
          <div className="h-1 w-16 bg-primary mx-auto rounded-full mt-2" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {PREP.map((p) => (
            <div key={p.title} className="rounded-xl border border-border bg-surface p-6 ambient-shadow">
              <h3 className="font-serif font-bold text-lg text-primary mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-verified shrink-0" />
                <span>{p.title}</span>
              </h3>
              <p className="text-xs text-muted leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Destination Rules List */}
      <div className="space-y-10">
        {[...byCountry.entries()].map(([dest, list]) => {
          const shown = visible(dest, list);
          if (!shown.length) return null;
          return (
            <section key={dest} aria-labelledby={`dest-${dest}`} className="rounded-xl border border-border bg-surface p-6 sm:p-8 ambient-shadow space-y-6">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <h2 id={`dest-${dest}`} className="text-2xl font-serif font-bold text-primary">
                  {countryName(dest)}
                </h2>
                <span className="text-xs font-bold uppercase tracking-wider bg-surface-2 text-muted px-3 py-1 rounded-full border border-border/60">
                  {shown.length} {shown.length === 1 ? "Regulation" : "Regulations"}
                </span>
              </div>

              <div className="grid gap-4">
                {shown.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border/60 bg-surface-2/40 p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-serif font-bold text-base text-primary">{r.title}</h3>
                      <FactBadge status={r.status} />
                    </div>
                    {r.details ? <p className="text-xs text-muted leading-relaxed">{r.details}</p> : null}
                    {r.evidence_quote ? (
                      <blockquote className="text-xs italic text-muted border-l-2 border-secondary pl-3 my-2">
                        {r.evidence_quote}
                      </blockquote>
                    ) : null}
                    {r.link ? (
                      <div className="pt-2">
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline underline-offset-2 hover:text-secondary"
                        >
                          <span>Official Government Page</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
