import { AppLink as Link } from "@/components/lite";
import { dismissStep, markStepDone, snoozeStep } from "@/app/app/steps/actions";
import { formatDate, type NextStep } from "@uniguide/journey";
import { FactBadge } from "@/components/facts";
import type { Dict } from "@/lib/i18n/en";
import { CheckCircle2, ChevronRight, Clock } from "lucide-react";

const BAND_STYLES: Record<NextStep["rank"], { text: string; bg: string }> = {
  urgent: { text: "text-secondary", bg: "bg-[#ffdad3]/60 border border-[#fe694a]/30" },
  long_lead: { text: "text-unverified", bg: "bg-surface-2 border border-border" },
  stage: { text: "text-primary", bg: "bg-surface-2 border border-border" },
  carry_over: { text: "text-muted", bg: "bg-surface-2 border border-border" },
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
  const bandStyle = BAND_STYLES[step.rank];

  return (
    <article className="rounded-xl border border-border bg-surface p-6 ambient-shadow hover:border-primary/40 transition-all grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${bandStyle.text} ${bandStyle.bg}`}>
            {t.bands[step.rank]}
          </span>
          {step.application ? (
            <span className="text-xs font-semibold text-muted bg-surface-2 px-2.5 py-0.5 rounded-full border border-border/60">
              {step.application.label}
            </span>
          ) : null}
          {step.trackLabel ? (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted border border-border/60">
              {t.home.track(step.trackLabel)}
            </span>
          ) : null}
        </div>

        {step.dueAt ? (
          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-secondary">
            <Clock className="h-3.5 w-3.5" />
            {t.home.due(formatDate(step.dueAt, timezone))}
          </span>
        ) : null}
      </div>

      <div>
        <Heading className="text-xl font-serif font-bold text-primary">{step.title}</Heading>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">{step.reason}</p>
      </div>

      {fact || step.source ? (
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {fact ? <FactBadge status={fact.status} /> : null}
          {step.source ? (
            <a
              href={step.source.href}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="text-primary font-semibold underline underline-offset-2 hover:text-secondary"
            >
              {sourceLabel(step.source.href, t.home)}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={step.href} className="btn btn-coral-bright min-h-11 shadow-xs">
            <span>{t.home.start}</span>
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">: {step.title}</span>
          </Link>
          {step.markable ? (
            <StepButton action={markStepDone.bind(null, step.id)} from={from} label={t.steps.markDone} title={step.title} />
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {step.dismissable ? (
            <>
              <StepButton action={snoozeStep.bind(null, step.id)} from={from} label={t.steps.snooze} title={step.title} />
              <StepButton action={dismissStep.bind(null, step.id)} from={from} label={t.steps.dismiss} title={step.title} quiet />
            </>
          ) : (
            <span className="text-xs text-muted">{t.steps.cantDismiss}</span>
          )}
        </div>
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
      <button className={`btn btn-sm min-h-11 ${quiet ? "text-muted hover:text-primary font-medium" : "btn-secondary"}`}>
        {label}
        <span className="sr-only">: {title}</span>
      </button>
    </form>
  );
}
