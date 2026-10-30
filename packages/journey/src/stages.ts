import { matchingMinimumMet } from "./minimum";
import type { ApplicationSnapshot, JourneyInput, Stage } from "./types";

export interface StageInfo {
  key: string;
  name: string;
  /** Where the stage's work happens. */
  route: string;
  /** The navigation item this stage belongs to (spec 6.1). */
  navItem: "home" | "explore" | "shortlist" | "applications" | "offers" | "departure";
  forText: string;
  doneWhen: string;
  usuallyTakes: string;
  /** "How you can help right now" for a linked parent; {name} is the student's name. */
  parentNote: string;
}

/** Stage explainers and parent notes, from spec section 5. */
export const STAGES: Record<Stage, StageInfo> = {
  1: {
    key: "set_up",
    name: "Set up",
    route: "/app/profile",
    navItem: "home",
    forText: "Telling UniGuide who you are and what you want.",
    doneWhen: "Matching has what it needs.",
    usuallyTakes: "15 minutes",
    parentNote: "Help set a realistic budget, including living costs, before {name} falls for courses that don't fit it.",
  },
  2: {
    key: "explore",
    name: "Explore",
    route: "/app/match",
    navItem: "explore",
    forText: "Seeing what is possible for you.",
    doneWhen: "At least one course is on your shortlist.",
    usuallyTakes: "1 to 3 weeks",
    parentNote: "Ask about the reasons behind each country, not just the rankings.",
  },
  3: {
    key: "shortlist",
    name: "Shortlist",
    route: "/app/shortlist",
    navItem: "shortlist",
    forText: "Deciding where to apply.",
    doneWhen: "You are preparing at least one application.",
    usuallyTakes: "1 to 4 weeks",
    parentNote: "Look at the cost range of each shortlisted course together.",
  },
  4: {
    key: "prepare",
    name: "Prepare",
    route: "/app/tracker",
    navItem: "applications",
    forText: "Getting each application ready before its deadline.",
    doneWhen: "Every application you chose is submitted.",
    usuallyTakes: "6 to 10 weeks",
    parentNote: "Help gather documents like transcripts and certificates. The essays are {name}'s to write: encouragement helps more than edits.",
  },
  5: {
    key: "wait",
    name: "Submit and wait",
    route: "/app/tracker",
    navItem: "applications",
    forText: "Keeping track of what you've sent.",
    doneWhen: "A decision is recorded.",
    usuallyTakes: "4 to 16 weeks",
    parentNote: "This stage is mostly waiting. Patience is the most useful help.",
  },
  6: {
    key: "decide",
    name: "Decide",
    route: "/app/offers",
    navItem: "offers",
    forText: "Choosing the right offer and securing your place.",
    doneWhen: "One offer is accepted.",
    usuallyTakes: "1 to 4 weeks",
    parentNote: "This is where parents matter most. Compare the true cost of each offer together.",
  },
  7: {
    key: "go",
    name: "Go",
    route: "/app/departure",
    navItem: "departure",
    forText: "Getting there and settling in.",
    doneWhen: "Your pre-departure checklist is done and you have arrived.",
    usuallyTakes: "6 to 12 weeks",
    parentNote: "Proof of funds usually needs your documents. Start early.",
  },
};

/** Applications that still count. Withdrawn ones, and withdrawn or deferred decisions, are ignored (plan D5). */
export function activeApplications(apps: ApplicationSnapshot[]): ApplicationSnapshot[] {
  return apps.filter((a) => a.status !== "withdrawn" && a.decision !== "withdrawn" && a.decision !== "deferred");
}

/**
 * True while an application still has a deadline to work towards: an unfinished deadline on its
 * checklist, or a published deadline, falls today or later. No known deadline counts as open.
 */
export function hasOpenDeadline(app: ApplicationSnapshot, today: string): boolean {
  const dates = [
    ...app.checklist.filter((i) => i.kind === "deadline" && !i.done && i.dueAt).map((i) => i.dueAt!),
    ...app.deadlines.map((d) => d.dueAt),
  ];
  return dates.length === 0 || dates.some((d) => d.slice(0, 10) >= today);
}

/**
 * The furthest stage the student has entered (spec 4.2). Rules run from 7 down; the first match wins.
 * Stage 5 also counts "decided" applications, so a student rejected everywhere waits in stage 5 and
 * never drops back to stage 3 (plan D5).
 */
export function computeStage(input: JourneyInput): Stage {
  const apps = activeApplications(input.applications);
  if (apps.some((a) => a.offerAcceptedAt)) return 7;
  if (apps.some((a) => a.decision === "admitted" || a.decision === "waitlisted")) return 6;
  const preparingOpen = apps.some((a) => a.status === "preparing" && hasOpenDeadline(a, input.today));
  if (apps.some((a) => a.status === "submitted" || a.status === "decided") && !preparingOpen) return 5;
  if (apps.some((a) => a.status === "preparing")) return 4;
  if (input.shortlist.length > 0 || apps.some((a) => a.status === "shortlisted")) return 3;
  if (matchingMinimumMet(input.profile, input.tracks)) return 2;
  return 1;
}
