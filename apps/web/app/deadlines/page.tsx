import type { Metadata } from "next";
import Link from "next/link";
import { FactBadge } from "@/components/facts";
import { groupByMonth, type CalendarDeadline } from "@/lib/deadline-calendar";
import { COUNTRIES, LEVELS, countryName, deadlineText, label } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Application deadlines",
  description: "Upcoming application deadlines for courses abroad, by month, each in the institution's own time zone.",
};

export default async function Deadlines({ searchParams }: PageProps<"/deadlines">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const level = LEVELS.find((l) => l === one(params.level));
  const country = one(params.country)?.toUpperCase();
  const intake = one(params.intake)?.slice(0, 30);

  const supabase = await createClient();
  let query = supabase
    .from("deadlines")
    .select(
      "id, due_at, timezone, precision, kind, status, applicant_category, round, program_cycles!inner(label, programs!inner(slug, title, level, institutions!inner(name, country)))",
    )
    .eq("kind", "application")
    .gte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(500);
  if (level) query = query.eq("program_cycles.programs.level", level);
  if (country && /^[A-Z]{2}$/.test(country)) query = query.eq("program_cycles.programs.institutions.country", country);
  if (intake) query = query.eq("program_cycles.label", intake);
  const { data, error } = await query;

  const rows: CalendarDeadline[] = (data ?? []).map((d) => ({
    id: d.id,
    applicantCategory: d.applicant_category,
    round: d.round,
    programSlug: d.program_cycles.programs.slug,
    programTitle: d.program_cycles.programs.title,
    institution: d.program_cycles.programs.institutions.name,
    country: d.program_cycles.programs.institutions.country,
    level: d.program_cycles.programs.level,
    kind: d.kind,
    dueAt: d.due_at,
    timezone: d.timezone,
    precision: d.precision,
    status: d.status,
  }));
  const months = groupByMonth(rows, new Date());

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Application deadlines</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Upcoming deadlines for every course we have collected facts for, shown in each institution&apos;s own time zone.
        Confirm each one on the official page before you apply.
      </p>

      <form className="mt-8 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[180px_200px_200px_auto]" role="search">
        <label className="sr-only" htmlFor="level">Level</label>
        <select id="level" name="level" defaultValue={level ?? ""} className="field">
          <option value="">Any level</option>
          {LEVELS.map((l) => <option key={l} value={l}>{label(l)}</option>)}
        </select>
        <label className="sr-only" htmlFor="country">Country</label>
        <select id="country" name="country" defaultValue={country ?? ""} className="field">
          <option value="">Any country</option>
          {Object.keys(COUNTRIES).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
        </select>
        <label className="sr-only" htmlFor="intake">Intake</label>
        <input id="intake" name="intake" defaultValue={intake} placeholder="Intake, for example 2027-autumn" className="field" />
        <button className="btn btn-primary">Filter</button>
      </form>

      {error ? (
        <p role="alert" className="mt-8 text-conflicting">Could not load deadlines. Please try again.</p>
      ) : months.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-border bg-surface p-6 text-muted">No open deadlines match these filters.</p>
      ) : (
        <div className="mt-10 grid gap-10">
          {months.map((m) => (
            <section key={m.month} aria-labelledby={`m-${m.month}`}>
              <h2 id={`m-${m.month}`} className="text-2xl font-semibold">{m.label}</h2>
              <ul className="mt-4 grid gap-3">
                {m.items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                    <div>
                      <Link href={`/courses/${i.programSlug}`} className="font-semibold underline-offset-2 hover:underline">{i.programTitle}</Link>
                      <p className="text-sm text-muted">{i.institution} · {countryName(i.country)} · {label(i.level)}</p>
                      {i.applicantCategory !== "all" || i.round ? (
                        <p className="text-sm text-muted">
                          {i.applicantCategory !== "all" ? `${label(i.applicantCategory)} applicants` : ""}
                          {i.applicantCategory !== "all" && i.round ? ", " : ""}
                          {i.round ?? ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p>{deadlineText(i.dueAt, i.timezone, i.precision)}</p>
                      <FactBadge status={i.status as "verified" | "unverified" | "conflicting" | "unknown"} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
