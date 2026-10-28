import type { CostFact, CostLine, CostScenarios, FxTable, MatchContext, Money, ProgramInput } from "./types";

/** Terms per year assumed when a fee is quoted per term. */
const TERMS_PER_YEAR = 2;

export function convert(amount: number, from: string, to: string, fx: FxTable) {
  if (from === to) return { amount, rate: null };
  const direct = fx[`${from}->${to}`];
  if (direct) return { amount: amount * direct.rate, rate: direct };
  const inverse = fx[`${to}->${from}`];
  if (inverse) {
    return { amount: amount / inverse.rate, rate: { ...inverse, rate: 1 / inverse.rate } };
  }
  return null;
}

function multiplierFor(cost: CostFact, program: ProgramInput): { value: number | null; assumption?: string } {
  const months = program.durationMonths ?? null;
  switch (cost.basis) {
    case "total":
    case "one_off":
      return { value: 1 };
    case "per_year":
      return months == null ? { value: null } : { value: months / 12 };
    case "per_month":
      return months == null ? { value: null } : { value: months };
    case "per_term":
      return months == null
        ? { value: null }
        : {
            value: Math.ceil((months / 12) * TERMS_PER_YEAR),
            assumption: `Per-term fees assume ${TERMS_PER_YEAR} terms a year.`,
          };
    case "per_credit":
      return program.requiredCredits == null ? { value: null } : { value: program.requiredCredits };
  }
}

/**
 * Low / base / high cost of completing the program, in the program's tuition currency.
 * Only aid the student has been awarded is subtracted; assistantships not yet awarded never are.
 */
export function costScenarios(
  program: ProgramInput,
  ctx: Pick<MatchContext, "fx">,
  options: { budgetCurrency?: string | null; awardedAid?: Money[] } = {},
): CostScenarios {
  const mandatory = program.costs.filter((c) => c.mandatory);
  const tuition = mandatory.find((c) => c.kind === "tuition");
  const currency = tuition?.currency ?? mandatory[0]?.currency ?? null;
  const missing: string[] = [];
  const assumptions = new Set<string>();
  const lines: CostLine[] = [];
  let low = 0;
  let base = 0;
  let high = 0;

  if (!tuition) missing.push("tuition");
  if (!mandatory.some((c) => c.kind === "living")) missing.push("living costs");

  for (const cost of mandatory) {
    const { value: multiplier, assumption } = multiplierFor(cost, program);
    if (assumption) assumptions.add(assumption);
    if (multiplier == null) {
      missing.push(
        cost.basis === "per_credit"
          ? `required credits (for ${cost.kind} per credit)`
          : `program duration (for ${cost.kind} ${cost.basis.replace("_", " ")})`,
      );
      continue;
    }
    let factor = 1;
    if (currency && cost.currency !== currency) {
      const converted = convert(1, cost.currency, currency, ctx.fx);
      if (!converted) {
        missing.push(`${cost.currency}→${currency} exchange rate`);
        continue;
      }
      factor = converted.amount;
      assumptions.add(`Converted ${cost.currency} at ${converted.amount.toFixed(4)} (approximate).`);
    }
    const line: CostLine = {
      factId: cost.id,
      kind: cost.kind,
      basis: cost.basis,
      multiplier,
      low: cost.low * multiplier * factor,
      base: cost.base * multiplier * factor,
      high: cost.high * multiplier * factor,
      currency: currency ?? cost.currency,
      status: cost.status,
    };
    lines.push(line);
    low += line.low;
    base += line.base;
    high += line.high;
  }

  let aidApplied = 0;
  for (const aid of options.awardedAid ?? []) {
    const converted = currency ? convert(aid.amount, aid.currency, currency, ctx.fx) : null;
    if (converted) aidApplied += converted.amount;
    else missing.push(`exchange rate for awarded aid in ${aid.currency}`);
  }
  if (aidApplied > 0) {
    low = Math.max(0, low - aidApplied);
    base = Math.max(0, base - aidApplied);
    high = Math.max(0, high - aidApplied);
  }

  let converted: CostScenarios["converted"] = null;
  const target = options.budgetCurrency;
  if (currency && target && target !== currency) {
    const rateResult = convert(1, currency, target, ctx.fx);
    if (rateResult?.rate) {
      converted = {
        currency: target,
        amount: base * rateResult.amount,
        low: low * rateResult.amount,
        high: high * rateResult.amount,
        rate: rateResult.rate,
        approximate: true,
      };
    }
  }

  return {
    currency,
    low,
    base,
    high,
    lines,
    complete: missing.length === 0,
    missing,
    assumptions: [...assumptions],
    converted,
    aidApplied,
  };
}

/** Base-case total expressed in the budget currency, or null when it cannot be computed. */
export function baseInCurrency(cost: CostScenarios, currency: string): number | null {
  if (cost.currency == null) return null;
  if (cost.currency === currency) return cost.base;
  return cost.converted?.currency === currency ? cost.converted.amount : null;
}

/**
 * What the first year of tuition costs, on the course's own cost basis, in the tuition currency.
 * Null when there is no mandatory tuition fact or the basis needs a figure the course does not publish.
 */
export function firstYearTuition(program: ProgramInput): { amount: number; currency: string; assumption?: string } | null {
  const tuition = program.costs.find((c) => c.mandatory && c.kind === "tuition");
  if (!tuition) return null;
  const months = program.durationMonths ?? null;
  const { currency, base } = tuition;
  switch (tuition.basis) {
    case "per_year":
      return { amount: base, currency };
    case "per_term":
      return { amount: base * TERMS_PER_YEAR, currency, assumption: `Per-term fees assume ${TERMS_PER_YEAR} terms a year.` };
    case "per_month":
      return { amount: base * Math.min(12, months ?? 12), currency };
    case "per_credit": {
      if (program.requiredCredits == null || months == null || months <= 0) return null;
      const creditsPerYear = program.requiredCredits / (months / 12);
      return { amount: base * Math.min(creditsPerYear, program.requiredCredits), currency, assumption: "Credits are assumed to be spread evenly over the course." };
    }
    case "total":
    case "one_off":
      return { amount: months != null && months > 12 ? (base * 12) / months : base, currency, assumption: months != null && months > 12 ? "The total fee is assumed to be spread evenly over the course." : undefined };
  }
}
