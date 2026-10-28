import type { Metadata } from "next";
import Link from "next/link";
import { convert, firstYearTuition, requiredFunds, rulesFor, type FundsResult } from "@uniguide/matching";
import { loadCard } from "@/app/courses/[slug]/data";
import { FactBadge } from "@/components/facts";
import { loadCurrentCycles, loadFx, toProgramInput } from "@/lib/catalog";
import { toCountryRule } from "@/lib/country-rules";
import { COUNTRIES, countryName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Proof of funds calculator",
  description: "The money a student visa asks you to show, from the government's published amount and your course's tuition.",
};

const REASONS: Record<Extract<FundsResult, { ok: false }>["reason"], string> = {
  no_verified_rule: "This country's proof of funds amount is not verified yet. Check the official visa page.",
  region_required: "The amount depends on where you will live. Choose a region.",
  currency_mismatch: "The course's tuition is published in a different currency from the visa amount, so we cannot add them.",
  no_tuition: "This course has no published tuition yet, so we cannot total the amount. The visa amount alone is on the official page.",
};

export default async function FundsPage({ searchParams }: PageProps<"/visas/funds">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const slug = one(params.course);
  const region = one(params.region)?.trim().slice(0, 60) || null;
  const from = one(params.from)?.toUpperCase();
  const currency = one(params.currency)?.toUpperCase();

  const supabase = await createClient();
  const { data: courses } = await supabase.from("programs").select("slug, title").eq("published", true).order("title").limit(200);
  const card = slug ? await loadCard(slug) : null;

  let result: FundsResult | null = null;
  let tuitionFact: ReturnType<typeof firstYearTuition> = null;
  let rules: ReturnType<typeof toCountryRule>[] = [];
  let approx: { amount: number; currency: string } | null = null;
  if (card) {
    const [{ data: ruleRows }, cycles, fx] = await Promise.all([
      supabase.from("country_rules").select("*").eq("destination", card.country!).eq("kind", "proof_of_funds"),
      loadCurrentCycles(supabase, [card.id!]),
      loadFx(supabase),
    ]);
    rules = (ruleRows ?? []).map(toCountryRule);
    const applicable = [...rulesFor(rules, card.country!, from && /^[A-Z]{2}$/.test(from) ? from : null, "proof_of_funds")];
    tuitionFact = firstYearTuition(toProgramInput(card, cycles.get(card.id!)));
    result = requiredFunds(applicable, card.country!, region, tuitionFact);
    if (result.ok && currency && /^[A-Z]{3}$/.test(currency) && currency !== result.currency) {
      const c = convert(result.total, result.currency, currency, fx);
      if (c) approx = { amount: c.amount, currency };
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-16">
      <header className="grid gap-3">
        <Link href="/visas" className="text-sm text-muted underline underline-offset-2">Student visas</Link>
        <h1 className="text-4xl font-semibold">Proof of funds calculator</h1>
        <p className="max-w-[680px] text-muted">
          Adds the government&apos;s published living cost amount to your course&apos;s first year tuition. It is a guide: the
          official visa page decides what you must show and how long the money must be held.
        </p>
      </header>

      <form className="grid gap-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2" role="search">
        <label className="grid gap-1 text-sm sm:col-span-2">Course
          <select name="course" defaultValue={slug ?? ""} className="field">
            <option value="">Choose a course</option>
            {(courses ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Region (if the amount depends on it)
          <input name="region" defaultValue={region ?? ""} maxLength={60} className="field" />
        </label>
        <label className="grid gap-1 text-sm">Where you live now
          <select name="from" defaultValue={from ?? ""} className="field">
            <option value="">Not stated</option>
            {Object.keys(COUNTRIES).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm">Show an approximate total in (currency code)
          <input name="currency" defaultValue={currency ?? ""} maxLength={3} placeholder="For example INR" className="field" />
        </label>
        <button className="btn btn-primary justify-self-start sm:col-span-2">Calculate</button>
      </form>

      {!card ? null : result === null ? null : result.ok ? (
        <section aria-labelledby="total" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
          <h2 id="total" className="text-2xl font-semibold">{money(result.total, result.currency)}</h2>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted">Living costs ({countryName(card.country!)})</dt><dd>{money(result.living, result.currency)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">First year tuition ({card.title})</dt><dd>{money(result.tuition, result.currency)}</dd></div>
          </dl>
          {tuitionFact?.assumption ? <p className="text-sm text-muted">{tuitionFact.assumption}</p> : null}
          {approx ? <p className="text-sm text-muted">About {money(Math.round(approx.amount), approx.currency)} at today&apos;s rate (approximate).</p> : null}
          <div className="grid gap-1 border-t border-border pt-4 text-sm">
            <p className="font-semibold">{result.rule.title}</p>
            {result.rule.evidenceQuote ? <q className="text-muted italic">{result.rule.evidenceQuote}</q> : null}
            <span><FactBadge status={result.rule.status ?? "unknown"} /></span>
            {result.rule.link ? <a href={result.rule.link} target="_blank" rel="noreferrer" className="underline underline-offset-2">Official page</a> : null}
          </div>
        </section>
      ) : (
        <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-muted">{REASONS[result.reason]}</p>
      )}
    </div>
  );
}
