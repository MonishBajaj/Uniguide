import { baseInCurrency } from "./cost";
import type { CostScenarios, Criterion, FitComponent, FitScore, ProgramInput, StudentProfile, Weights } from "./types";

export const DEFAULT_WEIGHTS: Weights = { field: 0.4, budget: 0.3, location: 0.2, delivery: 0.1 };

/** Budget headroom: 1 when the base cost is at most 75% of budget, falling to 0 at budget × tolerance. */
export function budgetHeadroom(baseCost: number, budget: number, tolerance: number): number {
  const full = 0.75 * budget;
  const zero = tolerance * budget;
  if (baseCost <= full) return 1;
  if (baseCost >= zero) return 0;
  return (zero - baseCost) / (zero - full);
}

function fieldSimilarity(programField: string | null | undefined, targets: string[]): number | null {
  if (!programField) return null;
  let best = 0;
  for (const target of targets) {
    if (programField.startsWith(target) || target.startsWith(programField)) {
      // Exact or more specific match counts fully; a shared broad field (first two digits) partly.
      best = Math.max(best, 1);
    } else if (programField.slice(0, 2) === target.slice(0, 2)) {
      best = Math.max(best, 0.5);
    }
  }
  return best;
}

function locationPreference(country: string, preferred: string[]): number {
  const index = preferred.indexOf(country);
  if (index < 0) return 0;
  return index === 0 ? 1 : Math.max(0.5, 1 - index * 0.15);
}

/**
 * Suitability score (0–100). Criteria the student has no preference for are left out for every
 * program alike. Criteria the *program* lacks data for count as 0 but keep their weight, so
 * missing data can never raise a score.
 */
export function fitScore(
  program: ProgramInput,
  profile: StudentProfile,
  cost: CostScenarios,
  weights: Weights = DEFAULT_WEIGHTS,
  tolerance = 1.25,
): FitScore {
  const components: FitComponent[] = [];
  const add = (criterion: Criterion, applies: boolean, value: () => number | null) => {
    if (!applies || weights[criterion] <= 0) return;
    components.push({ criterion, weight: weights[criterion], value: value() });
  };

  add("field", (profile.targetFields?.length ?? 0) > 0, () => fieldSimilarity(program.iscedF, profile.targetFields ?? []));
  add("budget", profile.budget != null, () => {
    const budget = profile.budget!;
    if (!cost.complete) return null;
    const base = baseInCurrency(cost, budget.currency);
    return base == null ? null : budgetHeadroom(base, budget.amount, tolerance);
  });
  add("location", (profile.targetCountries?.length ?? 0) > 0, () =>
    locationPreference(program.country, profile.targetCountries ?? []),
  );
  add("delivery", profile.preferredDelivery != null, () => (program.deliveryMode === profile.preferredDelivery ? 1 : 0.5));

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return { score: null, components, dataCoverage: 1 };
  const weighted = components.reduce((sum, c) => sum + c.weight * (c.value ?? 0), 0);
  const known = components.reduce((sum, c) => sum + (c.value == null ? 0 : c.weight), 0);
  return {
    score: Math.round((100 * weighted) / totalWeight),
    components,
    dataCoverage: known / totalWeight,
  };
}
