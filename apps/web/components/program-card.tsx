import { AppLink as Link } from "./lite";
import type { DeadlineFact } from "@uniguide/matching";
import { closesInText } from "@/lib/card-deadline";
import type { ProgramCard as Card } from "@/lib/catalog";
import { countryName, deadlineText, label } from "@/lib/format";
import { TierBadge } from "./facts";
import { ShortlistButton } from "./shortlist-button";
import { InstitutionMonogram } from "./ui/monogram";
import { Calendar, ChevronRight, Clock } from "lucide-react";

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
    <article className="group flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 ambient-shadow hover:border-primary/40 hover:-translate-y-0.5 transition-all">
      {/* Top row with Institution Monogram & Title */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <InstitutionMonogram name={card.institution_name} size="md" />
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-primary leading-snug group-hover:text-secondary transition-colors">
              <Link href={`/courses/${card.slug}`} className="hover:underline underline-offset-2">
                {card.title}
              </Link>
            </h3>
            <p className="text-sm font-medium text-muted mt-0.5 truncate">{card.institution_name}</p>
            <p className="text-xs text-muted/80 mt-0.5">
              {countryName(card.country)}{card.city ? ` · ${card.city}` : ""}
            </p>
          </div>
        </div>

        {card.coverage_tier ? (
          <div className="shrink-0">
            <TierBadge tier={card.coverage_tier} />
          </div>
        ) : null}
      </div>

      {/* Tags / Chips row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-primary border border-border/60">
          {label(card.level)}
        </span>
        {card.duration_months ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted border border-border/60">
            {card.duration_months} months
          </span>
        ) : null}
      </div>

      {/* Deadline section */}
      {deadline === undefined ? null : deadline ? (
        <div className="rounded-lg bg-surface-2/60 border border-border/60 p-3 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-secondary shrink-0" />
            <div>
              <span className="font-bold text-secondary">{closesInText(deadline)}</span>
              <span className="text-muted block text-[11px]">
                {deadlineText(deadline.dueAt, deadline.timezone ?? "UTC", deadline.precision)}
                {deadline.status === "verified" ? " (Verified)" : ""}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-surface-2/40 border border-border/40 p-2.5 text-xs text-muted flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted/60 shrink-0" />
          <span>No open application deadline known</span>
        </div>
      )}

      {children}

      {/* Footer row */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-border/60">
        <span className="text-xs text-muted">
          {card.facts_total ? `${card.facts_verified} of ${card.facts_total} facts verified` : "Requirements not yet collected"}
        </span>

        <div className="flex items-center gap-2">
          {showShortlist ? <ShortlistButton programId={card.id!} signedIn={signedIn} /> : null}
          <Link
            href={`/courses/${card.slug}`}
            className="btn btn-secondary btn-sm gap-1 hover:border-primary/40 hover:text-primary"
          >
            <span>Details</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
