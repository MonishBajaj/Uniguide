import Link from "next/link";

export interface HelpCopy {
  heading: string;
  explainer: { forText: string; doneWhen: string; usuallyTakes: string } | null;
  labels: { forText: string; doneWhen: string; usuallyTakes: string };
  noStage: string;
  guide: string;
  glossary: string;
  onThisPage: string;
  askCourse: string;
  inviteParent: string;
  shareCounselor: string;
}

/**
 * "Get help" (spec 6.3, journey M4): in order, what this stage is for and what done looks like; help for
 * this page; "Ask about this course" on a catalogue application; the guide and glossary; and, lower,
 * asking a parent to follow along and sharing with a counselor. No chatbot.
 */
export function HelpContent({ copy, pageHelp, courseSlug }: { copy: HelpCopy; pageHelp: string | null; courseSlug: string | null }) {
  return (
    <div className="grid gap-4 text-sm">
      <p className="font-semibold">{copy.heading}</p>
      {copy.explainer ? (
        <dl className="grid gap-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{copy.labels.forText}</dt>
            <dd>{copy.explainer.forText}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{copy.labels.doneWhen}</dt>
            <dd>{copy.explainer.doneWhen}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{copy.labels.usuallyTakes}</dt>
            <dd>{copy.explainer.usuallyTakes}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-muted">{copy.noStage}</p>
      )}
      {pageHelp ? (
        <section aria-labelledby="help-page" className="grid gap-2 border-t border-border pt-4">
          <h3 id="help-page" className="text-xs font-semibold tracking-wide text-muted uppercase">{copy.onThisPage}</h3>
          {/* Our own Markdown from content/help, so the HTML is trusted. */}
          <div className="grid gap-2 [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: pageHelp }} />
        </section>
      ) : null}
      {courseSlug ? (
        <p>
          <Link href={`/courses/${courseSlug}#ask`} className="font-semibold text-accent underline underline-offset-2">{copy.askCourse}</Link>
        </p>
      ) : null}
      <ul className="grid gap-1 border-t border-border pt-4">
        <li>
          <Link href="/guide" className="font-semibold text-accent underline underline-offset-2">{copy.guide}</Link>
        </li>
        <li>
          <Link href="/guide#glossary" className="font-semibold text-accent underline underline-offset-2">{copy.glossary}</Link>
        </li>
      </ul>
      <ul className="grid gap-1 border-t border-border pt-4">
        <li>
          <Link href="/app/sharing#family" className="underline underline-offset-2">{copy.inviteParent}</Link>
        </li>
        <li>
          <Link href="/app/sharing#shares" className="underline underline-offset-2">{copy.shareCounselor}</Link>
        </li>
      </ul>
    </div>
  );
}
