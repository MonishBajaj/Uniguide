import Link from "next/link";
import { formatDate, type JourneyInput, type UpcomingDeadline } from "@uniguide/journey";
import { FactBadge } from "@/components/facts";
import type { Dict } from "@/lib/i18n/en";

const panel = "grid gap-2 rounded-2xl border border-border bg-surface p-5 text-sm";

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
  return (
    <aside className="grid content-start gap-4">
      <section aria-labelledby="about-stage" className={panel}>
        <h2 id="about-stage" className="font-semibold">{t.explainer.title}</h2>
        <dl className="grid gap-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{t.explainer.forText}</dt>
            <dd>{info.forText}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{t.explainer.doneWhen}</dt>
            <dd>{info.doneWhen}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{t.explainer.usuallyTakes}</dt>
            <dd>{info.usuallyTakes}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="coming-up" className={panel}>
        <h2 id="coming-up" className="font-semibold">{t.home.comingUp}</h2>
        {deadlines.length ? (
          <>
            <ul className="grid gap-3">
              {deadlines.map((d) => {
                const href = d.sourceUrl ?? (slugOf(d.applicationId) ? `/courses/${slugOf(d.applicationId)}` : null);
                return (
                  <li key={d.factRef.id} className="grid gap-1">
                    <span className="font-mono text-xs">{formatDate(d.dueAt, d.timezone)}</span>
                    {href ? (
                      <a href={href} {...(d.sourceUrl ? { target: "_blank", rel: "noreferrer" } : {})} className="underline underline-offset-2">
                        {d.label}
                      </a>
                    ) : (
                      <span>{d.label}</span>
                    )}
                    <span>
                      <FactBadge status={d.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <a href="/app/tracker/calendar.ics" className="font-semibold text-accent underline underline-offset-2">{t.home.addToCalendar}</a>
          </>
        ) : (
          <p className="text-muted">{t.home.noDeadlines}</p>
        )}
      </section>

      {alsoOpen ? (
        <section aria-labelledby="also-open" className={panel}>
          <h2 id="also-open" className="font-semibold">{t.home.alsoOpen}</h2>
          <p>{t.home.alsoOpenCount(alsoOpen)}</p>
        </section>
      ) : null}

      <section aria-labelledby="shared-with" className={panel}>
        <h2 id="shared-with" className="font-semibold">{t.home.sharedWith}</h2>
        {parents.length || counselors.length ? (
          <>
            <ul className="grid gap-1">
              {parents.map((p, i) => <li key={`p${i}`}>{t.home.parent(p)}</li>)}
              {counselors.map((c, i) => <li key={`c${i}`}>{c}</li>)}
            </ul>
            <Link href="/app/sharing" className="font-semibold text-accent underline underline-offset-2">{t.home.manage}</Link>
          </>
        ) : (
          <>
            <p className="text-muted">{t.home.nobody}</p>
            <Link href="/app/sharing#family" className="font-semibold text-accent underline underline-offset-2">{t.home.invite}</Link>
          </>
        )}
      </section>
    </aside>
  );
}
