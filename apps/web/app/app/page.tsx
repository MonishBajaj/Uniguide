import type { Metadata } from "next";
import { AppLink as Link } from "@/components/lite";
import { redirect } from "next/navigation";
import { STAGES, upcomingDeadlines } from "@uniguide/journey";
import { JourneyError } from "@/components/journey/journey-error";
import { SideColumn } from "@/components/journey/side-column";
import { StagePath } from "@/components/journey/stage-path";
import { StepCard } from "@/components/journey/step-card";
import { StepStatus } from "@/components/journey/step-status";
import { readStatus } from "@/lib/journey-actions";
import { dueTimezone } from "@/lib/journey-dates";
import { getLocale } from "@/lib/i18n/server";
import { localizeJourney } from "@/lib/journey-copy";
import type { LoadedJourney } from "@/lib/journey-request";
import { getJourney, saveJourney } from "@/lib/journey-request.server";

export const metadata: Metadata = { title: "Home" };


/**
 * Journey home (spec 6.2, journey M2 J2.3): where a signed-in student lands. Everything on it comes
 * from the journey engine: the stage, its progress, the next three steps and their order.
 */
export default async function JourneyHome({ searchParams }: PageProps<"/app">) {
  const { t, locale } = await getLocale();
  const j = t.journey;

  let journey: LoadedJourney;
  try {
    journey = await getJourney();
  } catch (e) {
    console.error(`journey home: ${e instanceof Error ? e.message : e}`);
    return <JourneyError title={j.home.errorTitle} body={j.home.errorBody} retry={j.home.retry} href="/app" />;
  }
  const { input } = journey;
  // Shown in the reader's language; the saved journey stays English (M6, J6.2).
  const result = localizeJourney(journey.result, locale);
  const { consentState, entryPath, displayName } = input.profile;

  // Onboarding only for students who may save personal data, are still setting up and haven't answered yet.
  const consentOk = consentState === "not_required" || consentState === "granted";
  if (consentOk && result.stage === 1 && !entryPath) redirect("/app/onboarding");
  await saveJourney();

  const greeting = <h1 className="text-4xl font-semibold">{j.home.greeting(displayName ?? "")}</h1>;
  // Revoked consent: nothing personal may be used, so no steps; the layout's banner explains why.
  if (consentState === "revoked") return <div className="grid gap-6">{greeting}</div>;

  // Stage 7 done (M5 J5.8): "You made it", with settling-in links and no step list.
  if (result.arrived) {
    const going = input.applications.find((a) => a.offerAcceptedAt && !a.declinedAt);
    const institution = going?.program.institution ?? "";
    return (
      <div className="grid gap-8">
        <header>{greeting}</header>
        <section aria-labelledby="made-it" className="grid gap-4 rounded-2xl border border-border bg-surface p-6">
          <h2 id="made-it" className="text-3xl font-semibold">{j.arrived.title}</h2>
          <p className="max-w-2xl text-lg">{institution ? j.arrived.body(institution) : j.arrived.bodyNoCourse}</p>
          <h3 className="font-semibold">{j.arrived.links}</h3>
          <ul className="grid gap-2">
            <li><Link href="/app/departure" className="font-semibold text-accent underline underline-offset-2">{j.arrived.arrival}</Link></li>
            {going?.program.slug ? (
              <li>
                <Link href={`/courses/${going.program.slug}/arrival`} className="font-semibold text-accent underline underline-offset-2">
                  {j.arrived.arrivalGuide(institution)}
                </Link>
              </li>
            ) : null}
            {going?.program.slug ? (
              <li>
                <Link href={`/courses/${going.program.slug}#student-life`} className="font-semibold text-accent underline underline-offset-2">
                  {j.arrived.studentLife(institution)}
                </Link>
              </li>
            ) : null}
            <li><Link href="/app/tracker" className="font-semibold text-accent underline underline-offset-2">{j.arrived.tracker}</Link></li>
          </ul>
        </section>
      </div>
    );
  }

  const stageName = j.stages[String(result.stage) as keyof typeof j.stages].name;
  const next = result.steps.slice(0, 3);
  const status = readStatus(await searchParams);
  const alsoOpen = result.steps.filter((s) => s.rank === "carry_over").length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 content-start gap-8">
        <header className="grid gap-2">
          {greeting}
          <p className="text-lg text-muted">{j.home.summary(result.stage, stageName)}</p>
        </header>
        <StepStatus status={status} t={j.steps} from="/app" />
        <StagePath stage={result.stage} progress={result.stageProgress} t={j} />
        <section aria-labelledby="next-steps" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="next-steps" className="text-2xl font-semibold">{j.home.nextSteps}</h2>
            <Link href="/app/steps" className="font-semibold text-accent underline underline-offset-2">{j.home.seeAll}</Link>
          </div>
          {next.length ? (
            <div className="grid gap-4">
              {next.map((step) => <StepCard key={step.id} step={step} t={j} from="/app" timezone={dueTimezone(step.dueAt, input)} />)}
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
