import { AppLink as Link } from "@/components/lite";
import { dismissStep, markStepDone, snoozeStep } from "@/app/app/steps/actions";
import { formatDate, type NextStep } from "@uniguide/journey";
import { FactBadge } from "@/components/facts";
import type { Dict } from "@/lib/i18n/en";

const BAND_TONE: Record<NextStep["rank"], string> = {
  urgent: "text-conflicting",
  long_lead: "text-unverified",
  stage: "text-muted",
  carry_over: "text-muted",
};

/** Which words to use for a step's source link. */
function sourceLabel(href: string, t: Dict["journey"]["home"]): string {
  if (/^https?:\/\//.test(href)) return t.officialPage;
  return href.startsWith("/visas") ? t.visaRules : t.coursePage;
}

/**
 * One next step (spec 6.2): why it's here, which application, what to do, the fact it relies on
 * with its status and source, and one button to the exact place to do it. Below it, snooze,
 * dismiss and mark done where the catalogue allows them (J2.4).
 */
export function StepCard({
  step,
  t,
  from,
  timezone = "UTC",
  headingLevel = 3,
}: {
  step: NextStep;
  t: Dict["journey"];
  /** The page the step actions return to. */
  from: "/app" | "/app/steps";
  /** The time zone of the deadline the due date comes from, so it reads the same as under "Coming up". */
  timezone?: string;
  headingLevel?: 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h3" | "h4";
  const fact = step.factRefs[0];
  const external = step.source && /^https?:\/\//.test(step.source.href);
  return (
    <article className="grid gap-2 rounded-2xl border border-border bg-surface p-5">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={`font-semibold tracking-wide uppercase ${BAND_TONE[step.rank]}`}>{t.bands[step.rank]}</span>
        {step.application ? <span className="text-muted">{step.application.label}</span> : null}
        {step.trackLabel ? <span className="rounded-full bg-surface-2 px-2 text-muted">{t.home.track(step.trackLabel)}</span> : null}
      </p>
      <Heading className="text-lg font-semibold">{step.title}</Heading>
      <p className="text-muted">{step.reason}</p>
      {fact || step.dueAt ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {fact ? <FactBadge status={fact.status} /> : null}
          {step.source ? (
            <a
              href={step.source.href}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="underline underline-offset-2"
            >
              {sourceLabel(step.source.href, t.home)}
            </a>
          ) : null}
          {step.dueAt ? <span className="font-mono text-xs">{t.home.due(formatDate(step.dueAt, timezone))}</span> : null}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Link href={step.href} className="btn btn-primary min-h-11">
          {t.home.start}
          <span className="sr-only">: {step.title}</span>
        </Link>
        {step.markable ? <StepButton action={markStepDone.bind(null, step.id)} from={from} label={t.steps.markDone} title={step.title} /> : null}
        {step.dismissable ? (
          <>
            <StepButton action={snoozeStep.bind(null, step.id)} from={from} label={t.steps.snooze} title={step.title} />
            <StepButton action={dismissStep.bind(null, step.id)} from={from} label={t.steps.dismiss} title={step.title} quiet />
          </>
        ) : (
          <span className="text-sm text-muted">{t.steps.cantDismiss}</span>
        )}
      </div>
    </article>
  );
}

function StepButton({
  action,
  from,
  label,
  title,
  quiet = false,
}: {
  action: (form: FormData) => Promise<void>;
  from: string;
  label: string;
  title: string;
  quiet?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="from" value={from} />
      <button className={`btn btn-sm min-h-11 ${quiet ? "text-muted hover:text-foreground" : "btn-secondary"}`}>
        {label}
        <span className="sr-only">: {title}</span>
      </button>
    </form>
  );
}
