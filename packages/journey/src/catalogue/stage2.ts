import { ENGLISH_SPEAKING, countryName, isEnglishExam, listOf } from "./helpers";
import type { StepDef } from "./types";

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
    // Waits for the score goals panel on the match page (G8, M3).
    id: "S2.05",
    stage: 2,
    dismissable: true,
    until: 4,
    available: false,
    done: () => false,
    href: () => "/app/match",
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
