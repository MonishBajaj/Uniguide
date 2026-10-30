import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { STAGES, upcomingDeadlines, type JourneyInput } from "@uniguide/journey";
import { JourneyError } from "@/components/journey/journey-error";
import { SideColumn } from "@/components/journey/side-column";
import { StagePath } from "@/components/journey/stage-path";
import { StepCard } from "@/components/journey/step-card";
import { getLocale } from "@/lib/i18n/server";
import type { LoadedJourney } from "@/lib/journey-request";
import { getJourney, saveJourney } from "@/lib/journey-request.server";

export const metadata: Metadata = { title: "Home" };

/** A due date that is a published deadline reads in that deadline's own time zone; anything else in UTC. */
function dueTimezone(dueAt: string | null, input: JourneyInput): string {
  if (!dueAt) return "UTC";
  for (const app of input.applications) for (const d of app.deadlines) if (d.dueAt === dueAt) return d.timezone;
  return "UTC";
}

/**
 * Journey home (spec 6.2, journey M2 J2.3): where a signed-in student lands. Everything on it comes
 * from the journey engine: the stage, its progress, the next three steps and their order.
 */
export default async function JourneyHome() {
  const { t } = await getLocale();
  const j = t.journey;

  let journey: LoadedJourney;
  try {
    journey = await getJourney();
  } catch (e) {
    console.error(`journey home: ${e instanceof Error ? e.message : e}`);
    return <JourneyError title={j.home.errorTitle} body={j.home.errorBody} retry={j.home.retry} href="/app" />;
  }
  const { input, result } = journey;
  const { consentState, entryPath, displayName } = input.profile;

  // Onboarding only for students who may save personal data, are still setting up and haven't answered yet.
  const consentOk = consentState === "not_required" || consentState === "granted";
  if (consentOk && result.stage === 1 && !entryPath) redirect("/app/onboarding");
  await saveJourney();

  const greeting = <h1 className="text-4xl font-semibold">{j.home.greeting(displayName ?? "")}</h1>;
  // Revoked consent: nothing personal may be used, so no steps; the layout's banner explains why.
  if (consentState === "revoked") return <div className="grid gap-6">{greeting}</div>;

  const stageName = j.stages[String(result.stage) as keyof typeof j.stages].name;
  const next = result.steps.slice(0, 3);
  const alsoOpen = result.steps.filter((s) => s.rank === "carry_over").length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 content-start gap-8">
        <header className="grid gap-2">
          {greeting}
          <p className="text-lg text-muted">{j.home.summary(result.stage, stageName)}</p>
        </header>
        <StagePath stage={result.stage} progress={result.stageProgress} t={j} />
        <section aria-labelledby="next-steps" className="grid gap-4">
          <h2 id="next-steps" className="text-2xl font-semibold">{j.home.nextSteps}</h2>
          {next.length ? (
            <div className="grid gap-4">
              {next.map((step) => <StepCard key={step.id} step={step} t={j} timezone={dueTimezone(step.dueAt, input)} />)}
            </div>
          ) : (
            <div className="grid gap-2 rounded-2xl border border-border bg-surface p-5">
              <p>{j.home.upToDate}</p>
              <Link href={STAGES[result.stage].route} className="font-semibold text-accent underline underline-offset-2">{j.home.stagePage}</Link>
            </div>
          )}
        </section>
      </div>
      <SideColumn t={j} stage={result.stage} deadlines={upcomingDeadlines(input, 3)} input={input} alsoOpen={alsoOpen} />
    </div>
  );
}
