import type { Requirement } from "../types";
import { ENGLISH_SPEAKING, EXAM_NAMES, countryName, courseLabel, isEnglishExam, listOf, ref } from "./helpers";
import type { Ctx, StepDef } from "./types";

/**
 * The student's best total in a verified test requirement's exam and version, when it is below the published
 * minimum; otherwise null. Unverified minimums and exams without a saved score never count.
 */
function scoreGap(ctx: Ctx, r: Requirement): number | null {
  if (r.status !== "verified" || !r.exam || r.minTotal == null) return null;
  if (r.kind !== "language_test" && r.kind !== "admissions_test") return null;
  const totals = ctx.input.testScores
    .filter((t) => t.exam === r.exam && (t.examVersion ?? null) === (r.examVersion ?? null) && t.total != null)
    .map((t) => t.total!);
  if (totals.length === 0) return null;
  const best = Math.max(...totals);
  return best < r.minTotal ? best : null;
}

/** Stage 2: Explore (spec section 5). */
export const STAGE2: StepDef[] = [
  {
    id: "S2.01",
    stage: 2,
    dismissable: true,
    until: 3,
    available: true,
    parentTitle: "Looking through course matches",
    applies: (ctx) => ctx.input.matchRuns.latestAt != null,
    done: (ctx) => ctx.input.shortlist.length > 0 || ctx.apps.length > 0,
    href: () => "/app/match",
  },
  {
    id: "S2.02",
    stage: 2,
    dismissable: true,
    until: 3,
    available: true,
    parentTitle: "Finding universities for their subject",
    applies: (ctx) => ctx.input.matchRuns.latestAt == null || (ctx.input.matchRuns.feasibleCount ?? 0) < 5,
    done: (ctx) => ctx.input.enrichment.lastFinishedAt != null,
    href: () => "/app/matching",
  },
  {
    id: "S2.03",
    stage: 2,
    dismissable: true,
    until: 3,
    available: true,
    markable: true,
    parentTitle: "Comparing countries",
    applies: (ctx) => ctx.countries.length >= 2,
    done: () => false,
    href: (ctx) => `/compare/countries?${ctx.countries.slice(0, 4).map((c) => `c=${c}`).join("&")}`,
    params: (ctx) => ({ countries: listOf(ctx.countries.slice(0, 4).map(countryName)) }),
  },
  {
    id: "S2.04",
    stage: 2,
    dismissable: true,
    until: 4,
    available: true,
    markable: true,
    applies: (ctx) => !ENGLISH_SPEAKING.has(ctx.input.profile.residenceCountry),
    done: (ctx) => ctx.input.testScores.some((t) => isEnglishExam(t.exam)),
    href: () => "/english-tests",
  },
  {
    // Courses the student is tracking whose verified minimum is above their best score in the same exam and
    // version. Match results aren't in the snapshot, so other matches show on the score goals panel only (M3 P3).
    id: "S2.05",
    stage: 2,
    dismissable: true,
    until: 4,
    available: true,
    subjects: (ctx) =>
      ctx.apps
        .filter((app) => app.status === "shortlisted" || app.status === "preparing")
        .flatMap((app) => app.requirements.filter((r) => scoreGap(ctx, r) !== null).map((requirement) => ({ key: `${app.id}-${requirement.id}`, app, requirement }))),
    done: () => false,
    factRefs: (_, s) => ref("requirements", s.requirement!.id, s.requirement!.status),
    href: () => "/app/match#score-goals",
    params: (ctx, s) => ({
      course: courseLabel(s.app!),
      exam: EXAM_NAMES[s.requirement!.exam!] ?? s.requirement!.exam!,
      minimum: String(s.requirement!.minTotal),
      score: String(scoreGap(ctx, s.requirement!)),
    }),
  },
  {
    // Only the count of matches is known, not which filter limits it; any short list qualifies.
    id: "S2.06",
    stage: 2,
    dismissable: true,
    until: 3,
    available: true,
    markable: true,
    applies: (ctx) => ctx.input.matchRuns.latestAt != null && (ctx.input.matchRuns.feasibleCount ?? 0) < 5,
    done: () => false,
    href: () => "/app/match/what-if",
  },
  {
    // Needs course view tracking, which nothing defines yet (plan D8).
    id: "S2.07",
    stage: 2,
    dismissable: true,
    until: 3,
    available: false,
    done: () => false,
    href: () => "/courses",
  },
];
