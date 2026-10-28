import { applicantCategories } from "./applicant";
import { applicationDeadlines, closesAt, nextDeadline } from "./deadlines";
import type {
  Eligibility,
  EligibilityCheck,
  EligibilityResult,
  MatchContext,
  ProgramInput,
  RequirementFact,
  StudentProfile,
  TestScore,
} from "./types";

/** How long a score stays valid, in years, by exam. */
const SCORE_VALIDITY_YEARS: Record<string, number> = { gre: 5, gmat: 5, sat: Infinity, act: Infinity };
const DEFAULT_VALIDITY_YEARS = 2;

const check = (
  kind: EligibilityCheck["kind"],
  result: EligibilityResult,
  reason: string,
  facts: { id: string }[],
): EligibilityCheck => ({ kind, result, reason, factIds: facts.map((f) => f.id) });

/**
 * A conclusion drawn from facts nobody has verified is never "meets" or "does not meet":
 * it becomes "needs clarification" so missing or unverified data cannot make a program look better.
 */
function guardStatus(result: EligibilityCheck, facts: RequirementFact[]): EligibilityCheck {
  if (result.result === "needs_clarification") return result;
  const conflicting = facts.some((f) => f.status === "conflicting");
  const unverified = facts.some((f) => f.status !== "verified");
  if (conflicting) {
    return { ...result, result: "needs_clarification", reason: `${result.reason} Official sources disagree.` };
  }
  if (unverified) {
    return {
      ...result,
      result: "needs_clarification",
      reason: `${result.reason} Based on unverified information; confirm on the official page.`,
    };
  }
  return result;
}

function scoreIsValidAt(score: TestScore, at: Date): boolean | null {
  if (!score.takenOn) return null;
  const years = SCORE_VALIDITY_YEARS[score.exam] ?? DEFAULT_VALIDITY_YEARS;
  if (years === Infinity) return true;
  const taken = new Date(score.takenOn);
  const expires = new Date(taken);
  expires.setUTCFullYear(expires.getUTCFullYear() + years);
  return expires >= at;
}

type TestOutcome = { result: EligibilityResult; reason: string };

function compareTest(req: RequirementFact, score: TestScore, at: Date): TestOutcome {
  const label = req.exam ?? "test";
  if ((req.examVersion ?? null) !== null && (score.examVersion ?? null) !== req.examVersion) {
    return {
      result: "needs_clarification",
      reason: `${label}: the program states version "${req.examVersion}" but your score is ${
        score.examVersion ? `version "${score.examVersion}"` : "of an unknown version"
      }; scales differ between versions.`,
    };
  }
  const valid = scoreIsValidAt(score, at);
  if (valid === false) {
    return { result: "needs_clarification", reason: `${label}: your score may have expired by the deadline.` };
  }
  if (req.minTotal != null) {
    if (score.total == null) {
      return { result: "needs_clarification", reason: `${label}: add your overall score.` };
    }
    if (score.total < req.minTotal) {
      return { result: "does_not_meet", reason: `${label}: overall ${score.total} is below the minimum ${req.minTotal}.` };
    }
  }
  for (const [section, min] of Object.entries(req.minSections ?? {})) {
    const value = score.sections?.[section];
    if (value == null) {
      return { result: "needs_clarification", reason: `${label}: add your ${section} score (minimum ${min}).` };
    }
    if (value < min) {
      return { result: "does_not_meet", reason: `${label}: ${section} ${value} is below the minimum ${min}.` };
    }
  }
  return { result: "meets", reason: `${label}: your score meets the published minimum.` };
}

function checkEntryQualification(rows: RequirementFact[], profile: StudentProfile): EligibilityCheck {
  if (rows.length === 0) {
    return check("entry_qualification", "needs_clarification", "Entry requirements are not yet known.", []);
  }
  if (!profile.homeQualification) {
    return check("entry_qualification", "needs_clarification", "Add your qualification to check entry requirements.", rows);
  }
  const matching = rows.filter((r) => r.qualification === profile.homeQualification);
  if (matching.length === 0) {
    return check(
      "entry_qualification",
      "needs_clarification",
      "Your qualification is not listed for this program; check the international entry page.",
      rows,
    );
  }

  const outcomes = matching.map((req): EligibilityCheck => {
    if (req.minGradeNumeric == null) {
      return check("entry_qualification", "meets", "Your qualification is accepted.", [req]);
    }
    const published = req.minGradeText ?? `${req.minGradeNumeric} (${req.gradeScale})`;
    if (profile.gradeValue == null || !profile.gradeScale) {
      return check("entry_qualification", "needs_clarification", `Add your grade to compare with the minimum ${published}.`, [req]);
    }
    if (profile.gradeScale !== req.gradeScale) {
      // No silent conversion between grading scales.
      return check(
        "entry_qualification",
        "needs_clarification",
        `The minimum is ${published} on a different grading scale from yours; ask the admissions office how they convert it.`,
        [req],
      );
    }
    if (profile.gradeValue >= req.minGradeNumeric) {
      return check("entry_qualification", "meets", `Your grade meets the minimum ${published}.`, [req]);
    }
    if (req.isDesirable) {
      return check(
        "entry_qualification",
        "needs_clarification",
        `Your grade is below the desirable ${published}; this is not a strict cut-off.`,
        [req],
      );
    }
    return check("entry_qualification", "does_not_meet", `Your grade is below the minimum ${published}.`, [req]);
  });
  return guardStatus(bestOf(outcomes), matching);
}

function checkLanguage(rows: RequirementFact[], profile: StudentProfile, at: Date): EligibilityCheck {
  if (rows.length === 0) {
    return check("language_test", "needs_clarification", "Language requirements are not yet known.", []);
  }
  const scores = profile.testScores ?? [];
  const outcomes: EligibilityCheck[] = [];
  for (const req of rows) {
    const score = scores.find((s) => s.exam === req.exam);
    if (!score) continue;
    const outcome = compareTest(req, score, at);
    outcomes.push(guardStatus(check("language_test", outcome.result, outcome.reason, [req]), [req]));
  }
  if (outcomes.length === 0) {
    const accepted = [...new Set(rows.map((r) => r.exam))].join(", ");
    return check("language_test", "needs_clarification", `Add a score for one of the accepted tests: ${accepted}.`, rows);
  }
  // Any accepted test that is met is enough.
  return bestOf(outcomes);
}

function checkAdmissionsTest(req: RequirementFact, profile: StudentProfile, at: Date): EligibilityCheck {
  const policy = req.testPolicy ?? "unknown";
  const label = req.exam?.toUpperCase() ?? "Admissions test";
  if (policy === "unknown" || policy === "conflicting") {
    return check("admissions_test", "needs_clarification", `${label} policy is ${policy === "conflicting" ? "contradictory across official pages" : "not yet known"}.`, [req]);
  }
  if (policy === "waived_conditional") {
    return check("admissions_test", "needs_clarification", `${label} is waived only under conditions; check whether they apply to you.`, [req]);
  }
  if (policy !== "required") {
    return guardStatus(check("admissions_test", "meets", `${label} is ${policy.replace("_", " ")}.`, [req]), [req]);
  }
  const score = (profile.testScores ?? []).find((s) => s.exam === req.exam);
  if (!score) {
    return guardStatus(check("admissions_test", "needs_clarification", `${label} is required; add your score.`, [req]), [req]);
  }
  const outcome = compareTest(req, score, at);
  return guardStatus(check("admissions_test", outcome.result, outcome.reason, [req]), [req]);
}

const RANK: Record<EligibilityResult, number> = { meets: 0, needs_clarification: 1, does_not_meet: 2 };

function bestOf(outcomes: EligibilityCheck[]): EligibilityCheck {
  return outcomes.reduce((best, o) => (RANK[o.result] < RANK[best.result] ? o : best));
}

/** Checks each published requirement: meets / does not meet / needs clarification. */
export function checkEligibility(program: ProgramInput, profile: StudentProfile, ctx: Pick<MatchContext, "now">): Eligibility {
  const categories = applicantCategories(profile.residenceCountry, program.country);
  const applicable = program.requirements.filter((r) => categories.includes(r.applicantCategory));
  const upcoming = nextDeadline(program.deadlines, ctx.now);
  const scoreDate = upcoming ? new Date(upcoming.dueAt) : ctx.now;

  const checks: EligibilityCheck[] = [
    checkEntryQualification(applicable.filter((r) => r.kind === "entry_qualification"), profile),
    checkLanguage(applicable.filter((r) => r.kind === "language_test"), profile, scoreDate),
    ...applicable.filter((r) => r.kind === "admissions_test").map((r) => checkAdmissionsTest(r, profile, scoreDate)),
    ...applicable
      .filter((r) => r.kind === "prerequisite")
      .map((r) => check("prerequisite", "needs_clarification", "Check this prerequisite against your transcript.", [r])),
  ];

  const deadlines = applicationDeadlines(program.deadlines);
  if (deadlines.length === 0) {
    checks.push(check("deadline", "needs_clarification", "Application deadline not yet known.", []));
  } else if (!upcoming) {
    const allVerified = deadlines.every((d) => d.status === "verified");
    checks.push(
      check(
        "deadline",
        allVerified ? "does_not_meet" : "needs_clarification",
        allVerified
          ? "All published application deadlines for this intake have passed."
          : "The listed deadline may have passed; confirm on the official page.",
        deadlines,
      ),
    );
  } else if (upcoming.status !== "verified") {
    checks.push(check("deadline", "needs_clarification", "Deadline is unverified; confirm on the official page.", [upcoming]));
  } else {
    checks.push(check("deadline", "meets", `Applications open until ${closesAt(upcoming).toISOString().slice(0, 10)}.`, [upcoming]));
  }

  const overall = checks.reduce<EligibilityResult>(
    (worst, c) => (RANK[c.result] > RANK[worst] ? c.result : worst),
    "meets",
  );
  return { overall, checks };
}
