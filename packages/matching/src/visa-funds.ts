import type { CountryRule } from "./checklist";

export type FundsResult =
  | { ok: true; currency: string; living: number; tuition: number; total: number; rule: CountryRule }
  | { ok: false; reason: "no_verified_rule" | "region_required" | "currency_mismatch" | "no_tuition" };

/**
 * Money a student must show for a visa: the destination's verified proof of funds rule plus the first year of
 * the course's own tuition. A regional rule is used only for that region; two rules are never added together.
 */
export function requiredFunds(
  rules: CountryRule[],
  destination: string,
  region: string | null,
  firstYearTuition: { amount: number; currency: string } | null,
): FundsResult {
  const verified = rules.filter(
    (r) => r.destination === destination && r.kind === "proof_of_funds" && r.status === "verified" && r.amount != null && r.currency && r.period,
  );
  const wanted = region?.trim().toLowerCase() ?? null;
  const regional = wanted ? verified.find((r) => r.region?.toLowerCase() === wanted) : undefined;
  const rule = regional ?? verified.find((r) => !r.region);
  if (!rule) return { ok: false, reason: verified.length > 0 ? "region_required" : "no_verified_rule" };

  const amount = rule.amount as number;
  const living = rule.period === "per_month" ? (rule.months == null ? null : amount * rule.months) : amount;
  if (living === null) return { ok: false, reason: "no_verified_rule" };
  if (!firstYearTuition) return { ok: false, reason: "no_tuition" };
  if (firstYearTuition.currency !== rule.currency) return { ok: false, reason: "currency_mismatch" };
  return { ok: true, currency: rule.currency as string, living, tuition: firstYearTuition.amount, total: living + firstYearTuition.amount, rule };
}
