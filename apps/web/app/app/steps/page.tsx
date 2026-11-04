import type { Metadata } from "next";
import { formatDate, type Band } from "@uniguide/journey";
import { JourneyError } from "@/components/journey/journey-error";
import { StepCard } from "@/components/journey/step-card";
import { StepStatus } from "@/components/journey/step-status";
import { getLocale } from "@/lib/i18n/server";
import { localizeJourney } from "@/lib/journey-copy";
import { readStatus } from "@/lib/journey-actions";
import { dueTimezone } from "@/lib/journey-dates";
import type { LoadedJourney } from "@/lib/journey-request";
import { getJourney, saveJourney } from "@/lib/journey-request.server";
import { restoreStep } from "./actions";

export const metadata: Metadata = { title: "All your steps" };

const BANDS: Band[] = ["urgent", "long_lead", "stage", "carry_over"];

/** Every open step, grouped the way the engine ranks them, with snooze, dismiss and bring back (G18). */
export default async function AllSteps({ searchParams }: PageProps<"/app/steps">) {
  const { t, locale } = await getLocale();
  const j = t.journey;

  let journey: LoadedJourney;
  try {
    journey = await getJourney();
  } catch (e) {
    console.error(`journey steps: ${e instanceof Error ? e.message : e}`);
    return <JourneyError title={j.home.errorTitle} body={j.home.errorBody} retry={j.home.retry} href="/app/steps" />;
  }
  const { input } = journey;
  // Shown in the reader's language; the saved journey stays English (M6, J6.2).
  const result = localizeJourney(journey.result, locale);
  await saveJourney();
  const status = readStatus(await searchParams);
  const stageName = j.stages[String(result.stage) as keyof typeof j.stages].name;

  return (
    <div className="grid gap-8 max-w-4xl mx-auto">
      <header className="grid gap-2">
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-primary">{j.steps.title}</h1>
        <p className="text-base text-muted">
          {result.steps.length ? j.steps.summary(result.steps.length) : j.steps.none} {j.home.summary(result.stage, stageName)}
        </p>
      </header>
      <StepStatus status={status} t={j.steps} from="/app/steps" />

      {BANDS.map((band) => {
        const steps = result.steps.filter((s) => s.rank === band);
        if (!steps.length) return null;
        return (
          <section key={band} id={band} aria-labelledby={`${band}-title`} className="grid scroll-mt-24 gap-4">
            <div className="flex items-center gap-2 border-b border-border/70 pb-2">
              <h2 id={`${band}-title`} className="font-serif text-2xl font-bold text-primary">
                {j.bands[band]}
              </h2>
              <span className="text-xs font-mono font-semibold text-muted bg-surface-2 px-2.5 py-0.5 rounded-full">
                {steps.length}
              </span>
            </div>
            {steps.map((step) => (
              <StepCard key={step.id} step={step} t={j} from="/app/steps" timezone={dueTimezone(step.dueAt, input)} />
            ))}
          </section>
        );
      })}

      {result.hidden.length ? (
        <details className="rounded-xl border border-dashed border-border bg-surface p-6 ambient-shadow">
          <summary className="cursor-pointer font-serif font-bold text-base text-primary">{j.steps.hiddenTitle(result.hidden.length)}</summary>
          <ul className="mt-4 grid gap-3">
            {result.hidden.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0">
                <span>
                  <strong className="text-sm text-foreground">{h.title}</strong>
                  {h.application ? <span className="text-sm text-muted"> · {h.application.label}</span> : null}{" "}
                  <span className="text-xs text-muted">· {h.state === "snoozed" && h.until ? j.steps.until(formatDate(h.until)) : j.steps.dismissedLabel}</span>
                </span>
                <form action={restoreStep.bind(null, h.id)}>
                  <input type="hidden" name="from" value="/app/steps" />
                  <button className="btn btn-secondary btn-sm min-h-11">
                    {j.steps.bringBack}
                    <span className="sr-only">: {h.title}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
