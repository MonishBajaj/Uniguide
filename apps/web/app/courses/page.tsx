import type { Metadata } from "next";
import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { cardDeadline } from "@/lib/card-deadline";
import { loadCurrentCycles } from "@/lib/catalog";
import { CURRENCIES } from "@/lib/fields";
import { getUser } from "@/lib/supabase/server";
import { COUNTRIES, LEVELS, countryName, label } from "@/lib/format";
import type { Enums } from "@uniguide/db-types";

export const metadata: Metadata = {
  title: "Courses",
  description: "Search courses abroad by level, country and subject. Every listed course comes from an official register.",
};

const PAGE_SIZE = 30;

export default async function Courses({ searchParams }: PageProps<"/courses">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const q = one(params.q)?.slice(0, 100);
  const level = LEVELS.find((l) => l === one(params.level));
  const country = one(params.country)?.toUpperCase();
  const page = Math.max(1, Number(one(params.page)) || 1);
  const open = one(params.open) === "1";
  const maxTuition = Number(one(params.max)) > 0 ? Math.round(Number(one(params.max))) : undefined;
  const currency = CURRENCIES.find((c) => c === one(params.cur)) ?? "USD";

  const { supabase, user } = await getUser();
  const { data: cards, error } = await supabase.rpc("search_programs", {
    p_query: q,
    p_levels: level ? [level as Enums<"program_level">] : undefined,
    p_countries: country && /^[A-Z]{2}$/.test(country) ? [country] : undefined,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
    p_deadline_open: open,
    p_max_tuition: maxTuition,
    p_tuition_currency: maxTuition ? currency : undefined,
  });
  const results = (cards ?? []).slice(0, PAGE_SIZE);
  const hasMore = (cards?.length ?? 0) > PAGE_SIZE;
  const cycles = await loadCurrentCycles(supabase, results.map((c) => c.id!));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (level) sp.set("level", level);
    if (country) sp.set("country", country);
    if (open) sp.set("open", "1");
    if (maxTuition) {
      sp.set("max", String(maxTuition));
      sp.set("cur", currency);
    }
    sp.set("page", String(p));
    return `/courses?${sp}`;
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Courses</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Every country and level is searchable. Each course shows how deeply it has been checked: listed from a register,
        extracted from official pages, or verified by a person.
      </p>

      <form className="mt-8 grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_180px_200px_auto]" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" defaultValue={q} placeholder="Subject, course or university" className="field" />
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
        <button className="btn btn-primary">Search</button>
        <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm sm:col-span-4">
          <legend className="sr-only">More filters</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="open" value="1" defaultChecked={open} className="accent-[var(--accent)]" />
            Application deadline still open
          </label>
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="max">Published yearly tuition up to</label>
            <input id="max" name="max" type="number" min="1" step="any" defaultValue={maxTuition ?? ""} className="field py-1" style={{ width: "8rem" }} />
            <label className="sr-only" htmlFor="cur">Currency</label>
            <select id="cur" name="cur" defaultValue={currency} className="field py-1" style={{ width: "6rem" }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </fieldset>
      </form>
      {open || maxTuition ? (
        <p className="mt-3 text-sm text-muted">
          Filters use the current intake&apos;s published facts. Courses whose deadline or yearly tuition is not published yet are hidden while a filter is on
          {maxTuition ? "; fees in other currencies are compared at the latest stored exchange rate" : ""}.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-8 text-conflicting">Search failed. Please try again.</p>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8">
          <h2 className="text-xl font-semibold">No courses match yet</h2>
          <p className="mt-2 text-muted">
            Try a broader subject or another country. We add countries in waves based on demand;{" "}
            <Link href="/#join" className="underline underline-offset-2">tell us where you are headed</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {results.map((card) => (
            <ProgramCard key={card.id} card={card} signedIn={Boolean(user)} deadline={cardDeadline(cycles.get(card.id!)?.deadlines)} />
          ))}
        </div>
      )}

      <nav aria-label="Pages" className="mt-8 flex justify-between">
        {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">Previous</Link> : <span />}
        {hasMore ? <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">Next</Link> : null}
      </nav>
    </div>
  );
}
