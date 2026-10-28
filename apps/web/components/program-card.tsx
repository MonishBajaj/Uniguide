import Link from "next/link";
import type { DeadlineFact } from "@uniguide/matching";
import { closesInText } from "@/lib/card-deadline";
import type { ProgramCard as Card } from "@/lib/catalog";
import { countryName, deadlineText, label } from "@/lib/format";
import { TierBadge } from "./facts";
import { ShortlistButton } from "./shortlist-button";

export function ProgramCard({
  card,
  signedIn,
  showShortlist = true,
  deadline,
  children,
}: {
  card: Card;
  signedIn: boolean;
  showShortlist?: boolean;
  /** Next open application deadline; undefined hides the line, null says none is known. */
  deadline?: DeadlineFact | null;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <TierBadge tier={card.coverage_tier!} />
        <span>{label(card.level)}</span>
        <span>·</span>
        <span>{countryName(card.country)}{card.city ? `, ${card.city}` : ""}</span>
        {card.duration_months ? <><span>·</span><span>{card.duration_months} months</span></> : null}
      </div>
      <h3 className="text-lg font-semibold">
        <Link href={`/courses/${card.slug}`} className="hover:underline underline-offset-2">
          {card.title}
        </Link>
      </h3>
      <p className="text-sm text-muted">{card.institution_name}</p>
      {deadline === undefined ? null : deadline ? (
        <p className="text-sm">
          <span className="font-semibold">{closesInText(deadline)}</span>
          <span className="text-muted">
            {" "}· {deadlineText(deadline.dueAt, deadline.timezone ?? "UTC", deadline.precision)}
            {deadline.status === "verified" ? "" : ", not yet verified"}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted">No open application deadline known</p>
      )}
      {children}
      <div className="mt-auto flex items-end justify-between gap-3 pt-2">
        <p className="text-xs text-muted">
          {card.facts_total ? `${card.facts_verified} of ${card.facts_total} facts verified` : "Requirements not yet collected"}
        </p>
        {showShortlist ? <ShortlistButton programId={card.id!} signedIn={signedIn} /> : null}
      </div>
    </article>
  );
}
