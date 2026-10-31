import { costScenarios } from "./cost";
import { nextDeadline } from "./deadlines";
import { checkEligibility } from "./eligibility";
import { hardFilters } from "./filters";
import { DEFAULT_WEIGHTS, fitScore } from "./score";
import type { MatchContext, MatchResult, ProgramInput, StudentProfile, Weights } from "./types";
import { ALGORITHM_VERSION } from "./version";

/**
 * Hard filters, then eligibility, then cost scenarios, then a suitability score that only ranks
 * the feasible list. Deterministic: the same inputs always give the same output.
 */
export function matchPrograms(
  programs: ProgramInput[],
  profile: StudentProfile,
  ctx: MatchContext,
  weights: Weights = DEFAULT_WEIGHTS,
): { algorithmVersion: string; results: MatchResult[] } {
  const tolerance = ctx.budgetTolerance ?? 1.25;
  const results = programs.map((program): MatchResult => {
    const cost = costScenarios(program, ctx, {
      budgetCurrency: profile.budget?.currency,
      awardedAid: profile.awardedAid,
    });
    const eligibility = checkEligibility(program, profile, ctx);
    const exclusions = hardFilters(program, profile, cost, eligibility, tolerance);
    return {
      programId: program.id,
      excluded: exclusions.length > 0,
      exclusions,
      eligibility,
      cost,
      fit: fitScore(program, profile, cost, weights, tolerance),
      nextDeadline: nextDeadline(program.deadlines, ctx.now),
    };
  });

  results.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    const byScore = (b.fit.score ?? -1) - (a.fit.score ?? -1);
    if (byScore !== 0) return byScore;
    const byCoverage = b.fit.dataCoverage - a.fit.dataCoverage;
    if (byCoverage !== 0) return byCoverage;
    // Equal programs keep the order they were given (Array.sort is stable), so a ranked input list is not shuffled.
    return 0;
  });
  return { algorithmVersion: ALGORITHM_VERSION, results };
}
