import type { CountryRule } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";

/** A country_rules row as the matching package's CountryRule. */
export function toCountryRule(row: Tables<"country_rules">): CountryRule {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    details: row.details,
    link: row.link,
    destination: row.destination,
    appliesTo: row.applies_to,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    period: row.period as CountryRule["period"],
    months: row.months,
    hoursPerWeek: row.hours_per_week,
    region: row.region,
    step: row.step,
    evidenceQuote: row.evidence_quote,
  };
}
