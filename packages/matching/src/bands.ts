import type { EligibilityResult } from "./types";

export type Band = "reach" | "target" | "likely";

export interface AdmitStats {
  admitRate: number;
  status: "verified" | "unverified" | "conflicting" | "unknown";
}

/**
 * Rules-based Reach / Target / Likely, shown only when the student turns it on and always labelled
 * low confidence. It needs a verified published admit rate and the student's own standing in their
 * home cohort; otherwise there is no band. Never a percentage.
 */
export function admissionBand(stats: AdmitStats | null | undefined, eligibility: EligibilityResult, classPercentile: number | null | undefined): Band | null {
  if (!stats || stats.status !== "verified" || classPercentile == null || eligibility === "does_not_meet") return null;
  const rate = stats.admitRate;
  if (rate < 0.15) return "reach";
  if (classPercentile <= 10 && rate >= 0.5) return "likely";
  if ((classPercentile <= 25 && rate >= 0.3) || (classPercentile <= 10 && rate >= 0.15)) return "target";
  return "reach";
}
