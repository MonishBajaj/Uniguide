import type { CountryRule } from "@uniguide/matching";

/** Visa steps in checklist order: by step number (unnumbered last), then by title so equal steps stay stable. */
export function orderSteps(rules: CountryRule[]): CountryRule[] {
  return rules
    .filter((r) => r.kind === "visa_step")
    .sort((a, b) => (a.step ?? Infinity) - (b.step ?? Infinity) || a.title.localeCompare(b.title));
}
