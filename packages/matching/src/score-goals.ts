import type { TestScore } from "./types";

export interface ScoreGoalRequirement {
  programId: string;
  title: string;
  exam: string;
  examVersion: string | null;
  minTotal: number | null;
  minSections: Record<string, number> | null;
}

export interface ScoreGoal {
  programId: string;
  exam: string;
  /** How far the best total is below the published minimum; 0 when it reaches it. */
  gapTotal: number;
  /** Sections below their published minimum, with the shortfall. */
  gapSections: Record<string, number>;
  met: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The gap between a student's best score on an exam and each course's published minimum. Same exam and version
 * only. This is a goal, not a prediction: no score is estimated.
 */
export function scoreGoals(scores: TestScore[], requirements: ScoreGoalRequirement[]): ScoreGoal[] {
  return requirements.flatMap((r) => {
    const same = scores.filter((s) => s.exam === r.exam && (s.examVersion ?? null) === (r.examVersion ?? null));
    if (same.length === 0) return [];
    const best = same.reduce((a, b) => ((b.total ?? -Infinity) > (a.total ?? -Infinity) ? b : a));
    const gapTotal = r.minTotal !== null && best.total != null ? Math.max(0, round(r.minTotal - best.total)) : 0;
    const gapSections: Record<string, number> = {};
    for (const [section, min] of Object.entries(r.minSections ?? {})) {
      const have = Math.max(...same.map((s) => s.sections?.[section] ?? -Infinity));
      if (have < min) gapSections[section] = Number.isFinite(have) ? round(min - have) : min;
    }
    return [{ programId: r.programId, exam: r.exam, gapTotal, gapSections, met: gapTotal === 0 && Object.keys(gapSections).length === 0 }];
  });
}
