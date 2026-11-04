import type { Metadata } from "next";
import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { cardDeadline } from "@/lib/card-deadline";
import { loadCurrentCycles } from "@/lib/catalog";
import { CURRENCIES } from "@/lib/fields";
import { listSize } from "@/lib/display";
import { readDisplay } from "@/lib/display-server";
import { getUser } from "@/lib/supabase/server";
import { COUNTRIES, LEVELS, countryName, label } from "@/lib/format";
import type { Enums } from "@uniguide/db-types";
import { Search, SlidersHorizontal } from "lucide-react";

export const metadata: Metadata = {
  title: "Courses",
  description: "Search courses abroad by level, country and subject. Every listed course comes from an official register.",
};

const FULL_PAGE = 30;

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
  const PAGE_SIZE = listSize(FULL_PAGE, (await readDisplay()).lite);

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
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">Explore Courses & Universities</h1>
        <p className="mt-2 max-w-2xl text-muted text-base leading-relaxed">
          Search accredited degrees across 40+ countries. Every course shows its verification status, intake deadlines, and direct links to official sources.
        </p>
      </div>

      <form className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6 ambient-shadow" role="search">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_200px_auto]">
          <div className="relative">
            <label className="sr-only" htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Subject, course or university (e.g. Computer Science, MIT)"
              className="field pl-10"
            />
            <Search className="h-4 w-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          </div>

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

          <button className="btn btn-coral-bright whitespace-nowrap shadow-sm min-h-[42px]">
            Search Courses
          </button>
        </div>

        <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs sm:text-sm text-muted pt-3 border-t border-border/60">
          <legend className="sr-only">More filters</legend>
          <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
            <input type="checkbox" name="open" value="1" defaultChecked={open} className="accent-primary h-4 w-4 rounded" />
            Application deadline still open
          </label>
          <span className="flex flex-wrap items-center gap-2">
            <label htmlFor="max" className="text-muted">Published yearly tuition up to</label>
            <input id="max" name="max" type="number" min="1" step="any" defaultValue={maxTuition ?? ""} className="field py-1 text-xs" style={{ width: "8rem" }} />
            <label className="sr-only" htmlFor="cur">Currency</label>
            <select id="cur" name="cur" defaultValue={currency} className="field py-1 text-xs" style={{ width: "6rem" }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </span>
        </fieldset>
      </form>

      {open || maxTuition ? (
        <p className="mt-3 text-xs text-muted">
          Filters use the current intake&apos;s published facts. Courses whose deadline or yearly tuition is not published yet are hidden while a filter is on
          {maxTuition ? "; fees in other currencies are compared at the latest stored exchange rate" : ""}.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-8 text-sm font-semibold text-conflicting bg-conflicting/10 p-4 rounded-xl">Search failed. Please try again.</p>
      ) : results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-8 ambient-shadow text-center py-12">
          <h2 className="text-xl font-serif font-bold text-primary">No courses match yet</h2>
          <p className="mt-2 text-muted max-w-md mx-auto text-sm leading-relaxed">
            Try a broader subject or another country. We add countries in waves based on demand;{" "}
            <Link href="/#join" className="font-semibold text-primary underline underline-offset-2">tell us where you are headed</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {results.map((card) => (
            <ProgramCard key={card.id} card={card} signedIn={Boolean(user)} deadline={cardDeadline(cycles.get(card.id!)?.deadlines)} />
          ))}
        </div>
      )}

      <nav aria-label="Pages" className="mt-10 flex justify-between items-center">
        {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">Previous</Link> : <span />}
        <span className="text-xs text-muted font-medium">Page {page}</span>
        {hasMore ? <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">Next</Link> : <span />}
      </nav>
    </div>
  );
}
