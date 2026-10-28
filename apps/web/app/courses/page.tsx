import type { Metadata } from "next";
import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
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

  const { supabase, user } = await getUser();
  const { data: cards, error } = await supabase.rpc("search_programs", {
    p_query: q,
    p_levels: level ? [level as Enums<"program_level">] : undefined,
    p_countries: country && /^[A-Z]{2}$/.test(country) ? [country] : undefined,
    p_limit: PAGE_SIZE + 1,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const results = (cards ?? []).slice(0, PAGE_SIZE);
  const hasMore = (cards?.length ?? 0) > PAGE_SIZE;
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (level) sp.set("level", level);
    if (country) sp.set("country", country);
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
      </form>

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
          {results.map((card) => <ProgramCard key={card.id} card={card} signedIn={Boolean(user)} />)}
        </div>
      )}

      <nav aria-label="Pages" className="mt-8 flex justify-between">
        {page > 1 ? <Link href={pageHref(page - 1)} className="btn btn-secondary btn-sm">Previous</Link> : <span />}
        {hasMore ? <Link href={pageHref(page + 1)} className="btn btn-secondary btn-sm">Next</Link> : null}
      </nav>
    </div>
  );
}
