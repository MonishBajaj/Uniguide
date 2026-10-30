import Link from "next/link";

export interface HelpCopy {
  heading: string;
  explainer: { forText: string; doneWhen: string; usuallyTakes: string } | null;
  labels: { forText: string; doneWhen: string; usuallyTakes: string };
  noStage: string;
  guide: string;
  glossary: string;
}

/** "Get help" in M2: the current stage's explainer and the first-generation guide (full panel in M4). */
export function HelpContent({ copy }: { copy: HelpCopy }) {
  return (
    <div className="grid gap-3 text-sm">
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
      <ul className="grid gap-1">
        <li>
          <Link href="/guide" className="font-semibold text-accent underline underline-offset-2">{copy.guide}</Link>
        </li>
        <li>
          <Link href="/guide#glossary" className="font-semibold text-accent underline underline-offset-2">{copy.glossary}</Link>
        </li>
      </ul>
    </div>
  );
}
