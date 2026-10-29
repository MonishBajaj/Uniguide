import { checkEligibility } from "./eligibility";
import type { EligibilityResult, MatchContext, ProgramInput, StudentProfile } from "./types";

export type CompareVerdict = "meets" | "below" | "unknown";

export interface ProfileComparison {
  programId: string;
  title: string;
  grade: CompareVerdict;
  language: CompareVerdict;
  /** Only a verified published rate; never a chance of admission. */
  admitRate: number | null;
}

const verdict = (r: EligibilityResult | undefined): CompareVerdict => (r === "meets" ? "meets" : r === "does_not_meet" ? "below" : "unknown");

/**
 * How a student's grade and language score sit against each course's published minimums, using the same
 * eligibility rules as matching (same scale only, matching exam versions). Eligibility is meets or not;
 * there is no "above", because that would imply a chance of admission.
 */
export function compareProfile(
  profile: StudentProfile,
  programs: { program: ProgramInput; title: string; admitRate: { rate: number; status: string } | null }[],
  ctx: Pick<MatchContext, "now">,
): ProfileComparison[] {
  return programs.map(({ program, title, admitRate }) => {
    const { checks } = checkEligibility(program, profile, ctx);
    return {
      programId: program.id,
      title,
      grade: verdict(checks.find((c) => c.kind === "entry_qualification")?.result),
      language: verdict(checks.find((c) => c.kind === "language_test")?.result),
      admitRate: admitRate?.status === "verified" ? admitRate.rate : null,
    };
  });
}
