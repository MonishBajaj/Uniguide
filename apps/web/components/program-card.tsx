import Link from "next/link";
import type { ProgramCard as Card } from "@/lib/catalog";
import { countryName, label } from "@/lib/format";
import { TierBadge } from "./facts";
import { ShortlistButton } from "./shortlist-button";

export function ProgramCard({
  card,
  signedIn,
  showShortlist = true,
  children,
}: {
  card: Card;
  signedIn: boolean;
  showShortlist?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-6">
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
