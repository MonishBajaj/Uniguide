import { compareProfile, costScenarios, shortlistAdvice, type CostScenarios, type FxTable, type StudentProfile } from "@uniguide/matching";
import type { Tables } from "@uniguide/db-types";
import { toProgramInput, type CycleFacts } from "@/lib/catalog";

type Card = Tables<"program_cards">;

export interface ShortlistCost {
  programId: string;
  title: string;
  cost: CostScenarios;
  /** The base case in the budget's currency, when it can be worked out; null otherwise. */
  inBudgetCurrency: number | null;
}

/**
 * The shortlist page's three panels (J3.1): advice, profile comparison and costs. Pure, from the
 * same published facts matching uses. Never a chance of admission: bands are left out, and only a
 * verified admit rate is passed on.
 */
export function shortlistPanels(input: {
  cards: Card[];
  cycles: Map<string, CycleFacts>;
  student: StudentProfile;
  budget: { amount: number; currency: string } | null;
  fx: FxTable;
  admitRates: Map<string, { rate: number; status: string }>;
  /** Published assistantships for each course's institution, by course id. */
  funding: Map<string, number>;
  now: Date;
}) {
  const { cards, cycles, student, budget, fx, admitRates, funding, now } = input;
  const programs = cards.map((card) => ({ card, program: toProgramInput(card, cycles.get(card.id!)) }));

  const costs: ShortlistCost[] = programs.map(({ card, program }) => {
    const cost = costScenarios(program, { fx }, { budgetCurrency: budget?.currency ?? null });
    const inBudgetCurrency =
      !budget || !cost.currency || cost.lines.length === 0
        ? null
        : cost.currency === budget.currency
          ? cost.base
          : cost.converted?.currency === budget.currency
            ? cost.converted.amount
            : null;
    return { programId: card.id!, title: card.title!, cost, inBudgetCurrency };
  });
  const costBy = new Map(costs.map((c) => [c.programId, c]));

  const advice = shortlistAdvice(
    programs.map(({ card, program }) => ({
      programId: card.id!,
      title: card.title!,
      band: null,
      deadlines: program.deadlines
        .filter((d) => (d.kind === "application" || d.kind === "priority") && d.status !== "unknown" && new Date(d.dueAt) >= now)
        .map((d) => d.dueAt),
      country: card.country!,
      fundingFacts:
        program.deadlines.filter((d) => d.kind === "funding" || d.kind === "scholarship").length + (funding.get(card.id!) ?? 0),
      baseCost: costBy.get(card.id!)?.inBudgetCurrency ?? null,
    })),
    { budget: budget?.amount ?? null, countries: student.targetCountries ?? [] },
  );

  const comparison = compareProfile(
    student,
    programs.map(({ card, program }) => ({ program, title: card.title!, admitRate: admitRates.get(card.id!) ?? null })),
    { now },
  );

  return { advice, comparison, costs };
}
