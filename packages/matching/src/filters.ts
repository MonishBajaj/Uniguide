import { baseInCurrency } from "./cost";
import type { CostScenarios, Eligibility, Exclusion, ProgramInput, StudentProfile } from "./types";

/**
 * Hard limits are filters, never a weight among others. A program is excluded only on verified
 * facts; anything drawn from unverified data stays visible and is flagged instead.
 */
export function hardFilters(
  program: ProgramInput,
  profile: StudentProfile,
  cost: CostScenarios,
  eligibility: Eligibility,
  tolerance = 1.25,
): Exclusion[] {
  const exclusions: Exclusion[] = [];

  if (profile.targetLevels?.length && !profile.targetLevels.includes(program.level)) {
    exclusions.push({ rule: "level", reason: `Level is ${program.level}.`, factIds: [] });
  }
  if (profile.targetCountries?.length && !profile.targetCountries.includes(program.country)) {
    exclusions.push({ rule: "country", reason: `Located in ${program.country}.`, factIds: [] });
  }
  // An unknown field does not exclude (it is not a verified fact); the field criterion scores it 0.
  if (profile.targetFields?.length && program.iscedF) {
    const field = program.iscedF;
    const matches = profile.targetFields.some((f) => field.startsWith(f) || f.startsWith(field));
    if (!matches) exclusions.push({ rule: "field", reason: "Outside your fields of study.", factIds: [] });
  }
  if (profile.deliveryModes?.length && !profile.deliveryModes.includes(program.deliveryMode)) {
    exclusions.push({ rule: "delivery", reason: `Delivered ${program.deliveryMode.replace("_", " ")}.`, factIds: [] });
  }

  for (const c of eligibility.checks) {
    if (c.result !== "does_not_meet") continue;
    exclusions.push({
      rule: c.kind === "deadline" ? "deadline_passed" : "ineligible",
      reason: c.reason,
      factIds: c.factIds,
    });
  }

  if (profile.budget && cost.complete && cost.lines.every((l) => l.status === "verified")) {
    const base = baseInCurrency(cost, profile.budget.currency);
    if (base != null && base > profile.budget.amount * tolerance) {
      exclusions.push({
        rule: "budget",
        reason: `Base-case cost of about ${Math.round(base).toLocaleString("en")} ${profile.budget.currency} is over your budget.`,
        factIds: cost.lines.map((l) => l.factId),
      });
    }
  }
  return exclusions;
}
