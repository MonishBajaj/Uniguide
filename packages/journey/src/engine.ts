import { type Candidate, evaluateCatalogue } from "./catalogue";
import { checklistFields, profileChecklist } from "./minimum";
import { isStalled, rankSteps, splitByStepState, urgentLabel } from "./rank";
import { activeApplications, computeStage } from "./stages";
import type { FactRef, JourneyInput, JourneyResult, Stage } from "./types";
import { ENGINE_VERSION } from "./version";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "2 of 3 applications ready": what the current stage's progress bar shows (spec 4.1). */
export function stageProgress(input: JourneyInput, stage: Stage, open: Candidate[], completed: string[]): JourneyResult["stageProgress"] {
  const apps = activeApplications(input.applications);
  const of = (done: number, total: number, noun: string, nouns: string, rest: string) => ({
    done,
    total,
    label: `${done} of ${total} ${plural(total, noun, nouns)} ${rest}`,
  });
  switch (stage) {
    case 1: {
      const items = profileChecklist(checklistFields(input.profile, input.tracks), 0).filter((i) => i.key !== "tests");
      return of(items.filter((i) => i.done).length, items.length, "profile detail", "profile details", "added");
    }
    case 2:
      return { done: 0, total: 1, label: "No courses shortlisted yet" };
    case 3: {
      const programs = new Set([...input.shortlist.map((s) => s.program.id), ...apps.map((a) => a.program.id)]);
      const chosen = apps.filter((a) => a.status !== "shortlisted").length;
      return of(chosen, programs.size, "shortlisted course", "shortlisted courses", "chosen to apply to");
    }
    case 4: {
      const chosen = apps.filter((a) => a.status !== "shortlisted");
      const ready = chosen.filter((a) => a.status !== "preparing" || (a.checklist.length > 0 && a.checklist.every((i) => i.done)));
      return of(ready.length, chosen.length, "application", "applications", "ready");
    }
    case 5: {
      const sent = apps.filter((a) => a.status === "submitted" || a.status === "decided");
      return of(sent.filter((a) => a.decision).length, sent.length, "decision", "decisions", "received");
    }
    case 6: {
      const offers = apps.filter((a) => a.decision === "admitted" || a.decision === "waitlisted").length;
      return { done: 0, total: offers, label: `${offers} ${plural(offers, "offer", "offers")} to decide on` };
    }
    case 7: {
      const done = completed.filter((id) => id.startsWith("S7.")).length;
      const total = done + open.filter((s) => s.stage === 7).length;
      return of(done, total, "departure step", "departure steps", "done");
    }
  }
}

export interface UpcomingDeadline {
  applicationId: string;
  label: string;
  dueAt: string;
  timezone: string;
  status: FactRef["status"];
  factRef: FactRef;
  sourceUrl: string | null;
}

/**
 * The next published deadlines of applications still to be sent (shortlisted or preparing), soonest
 * first (M2 home, "Coming up"). Deadlines of applications already submitted or decided no longer matter.
 */
export function upcomingDeadlines(input: JourneyInput, limit = 3): UpcomingDeadline[] {
  return activeApplications(input.applications)
    .filter((app) => app.status === "shortlisted" || app.status === "preparing")
    .flatMap((app) =>
      app.deadlines
        .filter((d) => d.status !== "unknown" && d.dueAt.slice(0, 10) >= input.today)
        .map((d) => {
          const status = d.status as FactRef["status"];
          return {
            applicationId: app.id,
            label: `${app.program.title}, ${app.program.institution}`,
            dueAt: d.dueAt,
            timezone: d.timezone,
            status,
            factRef: { table: "deadlines", id: d.id, status },
            sourceUrl: d.sourceUrl ?? null,
          };
        }),
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.applicationId.localeCompare(b.applicationId))
    .slice(0, limit);
}

/** The journey for one student on one date. Pure: same input, same output. */
export function computeJourney(input: JourneyInput): JourneyResult {
  const stage = computeStage(input);
  const { open, completed, marked } = evaluateCatalogue(input, stage);
  const { visible, hidden } = splitByStepState(open, input.stepState, input.today);
  const steps = rankSteps(visible, stage, input.today);
  const urgentCount = steps.filter((s) => s.rank === "urgent").length;
  return {
    stage,
    stageProgress: stageProgress(input, stage, open, completed),
    steps,
    completed,
    marked,
    hidden: hidden.map(({ step, state, until }) => ({ id: step.id, catalogueId: step.catalogueId, title: step.title, state, until })),
    urgentCount,
    urgentLabel: urgentLabel(urgentCount),
    stalled: isStalled(input.lastCompletedAt, steps, input.today),
    engineVersion: ENGINE_VERSION,
  };
}
