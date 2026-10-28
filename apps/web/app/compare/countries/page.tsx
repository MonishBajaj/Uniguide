import type { Metadata } from "next";
import { Fragment } from "react";
import { firstYearTuition } from "@uniguide/matching";
import { loadCurrentCycles, toProgramInput } from "@/lib/catalog";
import { compareCountries, type CountryColumn } from "@/lib/country-compare";
import { toCountryRule } from "@/lib/country-rules";
import { WAVE_1, countryName, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Compare countries",
  description: "Tuition, proof of funds, work rights and post-study work for up to four destinations, from verified facts only.",
};

const NOT_VERIFIED = "Not yet verified";

function Cell({ rule, children }: { rule: CountryColumn["fundsRule"]; children: React.ReactNode }) {
  return (
    <td className="p-3 align-top">
      <p>{children}</p>
      {rule?.link ? <a href={rule.link} target="_blank" rel="noreferrer" className="text-sm text-muted underline underline-offset-2">Official page</a> : null}
    </td>
  );
}

export default async function CompareCountries({ searchParams }: PageProps<"/compare/countries">) {
  const raw = (await searchParams).c;
  const asked = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  const codes = [...new Set(asked.length ? asked : ["US", "GB", "DE"])].slice(0, 4);

  const supabase = await createClient();
  const [{ data: ruleRows }, { data: cards }] = await Promise.all([
    supabase.from("country_rules").select("*").in("destination", codes),
    supabase.from("program_cards").select("*").in("country", codes).limit(400),
  ]);
  const cycles = await loadCurrentCycles(supabase, (cards ?? []).map((c) => c.id!));
  const tuition = (cards ?? []).flatMap((card) => {
    // Only a verified international fee counts toward a range; home or unverified figures are not averaged in.
    const t = firstYearTuition(toProgramInput(card, cycles.get(card.id!)), { verifiedOnly: true });
    return t ? [{ country: card.country!, amount: t.amount, currency: t.currency }] : [];
  });
  const columns = compareCountries(codes, (ruleRows ?? []).map(toCountryRule), tuition);

  const rows: { label: string; cell: (c: CountryColumn) => React.ReactNode }[] = [
    {
      label: "First year tuition",
      cell: (c) => (
        <td className="p-3 align-top">
          {c.tuitionRange
            ? `${money(c.tuitionRange.low, c.tuitionRange.currency)} to ${money(c.tuitionRange.high, c.tuitionRange.currency)}`
            : NOT_VERIFIED}
          {c.tuitionRange ? <p className="text-sm text-muted">From {c.tuitionRange.courses} verified {c.tuitionRange.courses === 1 ? "course" : "courses"}</p> : null}
        </td>
      ),
    },
    {
      label: "Visa proof of funds",
      cell: (c) => (
        <Cell rule={c.fundsRule}>
          {c.fundsRule?.amount != null && c.fundsRule.currency
            ? `${money(c.fundsRule.amount, c.fundsRule.currency)} ${c.fundsRule.period === "per_month" ? `a month${c.fundsRule.months ? ` for ${c.fundsRule.months} months` : ""}` : c.fundsRule.period === "per_year" ? "a year" : "in total"}`
            : NOT_VERIFIED}
        </Cell>
      ),
    },
    { label: "Part time work during study", cell: (c) => <Cell rule={c.workHours}>{c.workHours?.hoursPerWeek ? `Up to ${c.workHours.hoursPerWeek} hours a week` : NOT_VERIFIED}</Cell> },
    { label: "Work after graduating", cell: (c) => <Cell rule={c.postStudy}>{c.postStudy?.months ? `${c.postStudy.months} months` : NOT_VERIFIED}</Cell> },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Compare countries</h1>
      <p className="mt-3 max-w-[680px] text-muted">
        Only verified facts appear. Where a fact has not been verified yet, the cell says so. Tuition ranges rest only on
        the courses verified so far, not on every course in the country.
      </p>

      <form className="mt-8 flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-4" role="search" aria-label="Choose countries">
        {WAVE_1.map((c) => (
          <label key={c} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm has-[:checked]:border-accent">
            <input type="checkbox" name="c" value={c} defaultChecked={codes.includes(c)} className="accent-[var(--accent)]" />
            {countryName(c)}
          </label>
        ))}
        <button className="btn btn-primary">Compare</button>
      </form>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="p-3">&nbsp;</th>
              {columns.map((c) => <th key={c.code} scope="col" className="p-3">{countryName(c.code)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <th scope="row" className="p-3 align-top font-semibold">{r.label}</th>
                {columns.map((c) => <Fragment key={c.code}>{r.cell(c)}</Fragment>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
