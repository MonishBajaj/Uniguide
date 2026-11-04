import { AppLink as Link } from "@/components/lite";
import { formatDate, type JourneyInput, type UpcomingDeadline } from "@uniguide/journey";
import { FactBadge } from "@/components/facts";
import type { Dict } from "@/lib/i18n/en";
import { Calendar, Clock, Sparkles, Users, ArrowUpRight } from "lucide-react";

const panel = "rounded-xl border border-border bg-surface p-6 ambient-shadow text-sm grid gap-3";

/** The home's side column (spec 6.2): stage explainer, coming up, also open, shared with. */
export function SideColumn({
  t,
  stage,
  deadlines,
  input,
  alsoOpen,
}: {
  t: Dict["journey"];
  stage: number;
  deadlines: UpcomingDeadline[];
  input: JourneyInput;
  alsoOpen: number;
}) {
  const info = t.stages[String(stage) as keyof typeof t.stages];
  const slugOf = (applicationId: string) => input.applications.find((a) => a.id === applicationId)?.program.slug;
  const { parents, counselors } = input.sharedWith;
  const nextDeadline = deadlines[0];

  return (
    <aside className="grid content-start gap-6">
      {/* Next Deadline Hero Card (Stitch design highlight) */}
      {nextDeadline ? (
        <section aria-labelledby="urgent-deadline" className="rounded-xl bg-primary text-white p-6 ambient-shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white">
              <Calendar className="h-5 w-5" />
            </span>
            <span className="text-[11px] uppercase tracking-wider font-bold bg-secondary px-2.5 py-0.5 rounded-full">
              {t.home.comingUp}
            </span>
          </div>

          <h2 id="urgent-deadline" className="font-serif text-xl font-bold text-white leading-tight">
            {nextDeadline.label}
          </h2>

          <div className="mt-4 mb-5">
            <p className="text-3xl font-serif font-bold text-white tracking-tight">
              {formatDate(nextDeadline.dueAt, nextDeadline.timezone)}
            </p>
          </div>

          {slugOf(nextDeadline.applicationId) ? (
            <Link
              href={`/app/tracker/${nextDeadline.applicationId}`}
              className="btn w-full bg-white text-primary font-bold hover:bg-white/90 shadow-sm"
            >
              {t.home.start}
            </Link>
          ) : null}
        </section>
      ) : null}

      {/* Stage Explainer */}
      <section aria-labelledby="about-stage" className={panel}>
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Sparkles className="h-4 w-4 text-secondary" />
          <h2 id="about-stage" className="font-serif font-bold text-base text-primary">{t.explainer.title}</h2>
        </div>
        <dl className="grid gap-3 pt-1">
          <div>
            <dt className="text-xs font-bold tracking-wider text-muted uppercase">{t.explainer.forText}</dt>
            <dd className="mt-1 text-foreground leading-relaxed">{info.forText}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wider text-muted uppercase">{t.explainer.doneWhen}</dt>
            <dd className="mt-1 text-foreground leading-relaxed">{info.doneWhen}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wider text-muted uppercase">{t.explainer.usuallyTakes}</dt>
            <dd className="mt-1 text-foreground leading-relaxed">{info.usuallyTakes}</dd>
          </div>
        </dl>
      </section>

      {/* Coming Up / Deadlines */}
      <section aria-labelledby="coming-up" className={panel}>
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 id="coming-up" className="font-serif font-bold text-base text-primary">{t.home.comingUp}</h2>
          </div>
          <span className="text-xs font-mono font-semibold text-muted bg-surface-2 px-2 py-0.5 rounded-full">
            {deadlines.length}
          </span>
        </div>
        {deadlines.length ? (
          <>
            <ul className="grid gap-3.5 pt-1">
              {deadlines.map((d) => {
                const href = d.sourceUrl ?? (slugOf(d.applicationId) ? `/courses/${slugOf(d.applicationId)}` : null);
                return (
                  <li key={d.factRef.id} className="grid gap-1 pb-2 border-b border-border/40 last:border-b-0 last:pb-0">
                    <span className="font-mono text-xs font-semibold text-secondary">{formatDate(d.dueAt, d.timezone)}</span>
                    {href ? (
                      <a
                        href={href}
                        {...(d.sourceUrl ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="text-sm font-semibold text-primary hover:text-secondary hover:underline inline-flex items-center gap-1"
                      >
                        <span>{d.label}</span>
                        <ArrowUpRight className="h-3 w-3 opacity-60" />
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-foreground">{d.label}</span>
                    )}
                    <div className="pt-0.5">
                      <FactBadge status={d.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <a href="/app/tracker/calendar.ics" className="font-semibold text-primary underline underline-offset-2 hover:text-secondary text-xs pt-1">
              {t.home.addToCalendar}
            </a>
          </>
        ) : (
          <p className="text-xs text-muted pt-1">{t.home.noDeadlines}</p>
        )}
      </section>

      {/* Also Open / Carry-over Steps */}
      {alsoOpen ? (
        <section aria-labelledby="also-open" className={panel}>
          <h2 id="also-open" className="font-serif font-bold text-base text-primary">{t.home.alsoOpen}</h2>
          <p className="text-muted leading-relaxed">{t.home.alsoOpenCount(alsoOpen)}</p>
          <Link href="/app/steps#carry_over" className="font-semibold text-primary underline underline-offset-2 hover:text-secondary">
            {t.home.seeAll}
          </Link>
        </section>
      ) : null}

      {/* Shared With */}
      <section aria-labelledby="shared-with" className={panel}>
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Users className="h-4 w-4 text-muted" />
          <h2 id="shared-with" className="font-serif font-bold text-base text-primary">{t.home.sharedWith}</h2>
        </div>
        {parents.length || counselors.length ? (
          <>
            <ul className="grid gap-1.5 pt-1 text-xs">
              {parents.map((p, i) => <li key={`p${i}`}>{t.home.parent(p)}</li>)}
              {counselors.map((c, i) => <li key={`c${i}`}>{c}</li>)}
            </ul>
            <Link href="/app/sharing" className="font-semibold text-primary underline underline-offset-2 hover:text-secondary text-xs pt-2">
              {t.home.manage}
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs text-muted pt-1">{t.home.nobody}</p>
            <Link href="/app/sharing#family" className="font-semibold text-primary underline underline-offset-2 hover:text-secondary text-xs pt-2">
              {t.home.invite}
            </Link>
          </>
        )}
      </section>
    </aside>
  );
}
