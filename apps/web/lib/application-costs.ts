import { convert, type FxTable } from "@uniguide/matching";

export const COST_KINDS = {
  application_fee: "Application fee",
  score_send: "Sending scores",
  exam: "Exam fee",
  deposit: "Deposit",
  other: "Other",
} as const;
export type CostKind = keyof typeof COST_KINDS;

type Cost = { amount: number; currency: string };

/** Totals per currency, largest first. Money is never summed across currencies without a rate. */
export function totalsByCurrency(costs: Cost[]): Cost[] {
  const sums = new Map<string, number>();
  for (const c of costs) sums.set(c.currency, (sums.get(c.currency) ?? 0) + Number(c.amount));
  return [...sums].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

/**
 * Everything in one currency using the latest stored rates. Currencies with no rate are left out and
 * named, so the total is shown as a lower bound rather than silently wrong.
 */
export function approximateTotal(totals: Cost[], target: string, fx: FxTable) {
  let amount = 0;
  const missing: string[] = [];
  for (const t of totals) {
    const converted = convert(t.amount, t.currency, target, fx);
    if (converted) amount += converted.amount;
    else missing.push(t.currency);
  }
  return { amount, currency: target, missing };
}
