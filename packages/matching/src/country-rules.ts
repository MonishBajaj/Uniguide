import type { CountryRule } from "./checklist";

/**
 * Rules for a destination that apply to a student living in `residence`.
 * A rule with an empty appliesTo is for everyone; a student with no stated residence sees only those.
 */
export function rulesFor(rules: CountryRule[], destination: string, residence: string | null, kind?: string): CountryRule[] {
  return rules.filter(
    (r) =>
      r.destination === destination &&
      (kind === undefined || r.kind === kind) &&
      ((r.appliesTo ?? []).length === 0 || (residence !== null && (r.appliesTo ?? []).includes(residence))),
  );
}
