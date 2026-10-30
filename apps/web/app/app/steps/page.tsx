import type { Metadata } from "next";
import { formatDate, type Band } from "@uniguide/journey";
import { JourneyError } from "@/components/journey/journey-error";
import { StepCard } from "@/components/journey/step-card";
import { StepStatus } from "@/components/journey/step-status";
import { getLocale } from "@/lib/i18n/server";
import { readStatus } from "@/lib/journey-actions";
import { dueTimezone } from "@/lib/journey-dates";
import type { LoadedJourney } from "@/lib/journey-request";
import { getJourney, saveJourney } from "@/lib/journey-request.server";
import { restoreStep } from "./actions";

export const metadata: Metadata = { title: "All your steps" };

const BANDS: Band[] = ["urgent", "long_lead", "stage", "carry_over"];

/** Every open step, grouped the way the engine ranks them, with snooze, dismiss and bring back (G18). */
export default async function AllSteps({ searchParams }: PageProps<"/app/steps">) {
  const { t } = await getLocale();
  const j = t.journey;

  let journey: LoadedJourney;
  try {
    journey = await getJourney();
  } catch (e) {
    console.error(`journey steps: ${e instanceof Error ? e.message : e}`);
    return <JourneyError title={j.home.errorTitle} body={j.home.errorBody} retry={j.home.retry} href="/app/steps" />;
  }
  const { input, result } = journey;
  await saveJourney();
  const status = readStatus(await searchParams);
  const stageName = j.stages[String(result.stage) as keyof typeof j.stages].name;

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold">{j.steps.title}</h1>
        <p className="text-lg text-muted">
          {result.steps.length ? j.steps.summary(result.steps.length) : j.steps.none} {j.home.summary(result.stage, stageName)}
        </p>
      </header>
      <StepStatus status={status} t={j.steps} from="/app/steps" />

      {BANDS.map((band) => {
        const steps = result.steps.filter((s) => s.rank === band);
        if (!steps.length) return null;
        return (
          <section key={band} id={band} aria-labelledby={`${band}-title`} className="grid scroll-mt-24 gap-4">
            <h2 id={`${band}-title`} className="text-2xl font-semibold">
              {j.bands[band]} <span className="text-base font-normal text-muted">({steps.length})</span>
            </h2>
            {steps.map((step) => (
              <StepCard key={step.id} step={step} t={j} from="/app/steps" timezone={dueTimezone(step.dueAt, input)} />
            ))}
          </section>
        );
      })}

      {result.hidden.length ? (
        <details className="rounded-2xl border border-dashed border-border p-5">
          <summary className="cursor-pointer font-semibold">{j.steps.hiddenTitle(result.hidden.length)}</summary>
          <ul className="mt-4 grid gap-3">
            {result.hidden.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {h.title}
                  {h.application ? <span className="text-sm text-muted"> · {h.application.label}</span> : null}{" "}
                  <span className="text-sm text-muted">· {h.state === "snoozed" && h.until ? j.steps.until(formatDate(h.until)) : j.steps.dismissedLabel}</span>
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
