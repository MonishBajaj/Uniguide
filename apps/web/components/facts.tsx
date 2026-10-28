import { shortDate } from "@/lib/format";

const STATUS = {
  verified: { text: "Verified", className: "text-verified border-verified/40" },
  unverified: { text: "Unverified, confirm on the official page", className: "text-unverified border-unverified/40" },
  conflicting: { text: "Official sources disagree", className: "text-conflicting border-conflicting/40" },
  unknown: { text: "Not yet known", className: "text-unknown border-unknown/40" },
} as const;

export function FactBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.text}
    </span>
  );
}

const TIERS = {
  listed: "Listed: the course exists in an official register; details are not yet checked",
  extracted: "Extracted: details read from official pages by software, not yet checked by a person",
  verified: "Verified: some details checked by a person against the official page",
} as const;

export function TierBadge({ tier }: { tier: keyof typeof TIERS }) {
  return (
    <span title={TIERS[tier]} className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium">
      {tier === "listed" ? "Listed" : tier === "extracted" ? "Extracted" : "Verified"}
    </span>
  );
}

/** Source link, verified date and the verbatim quote behind a fact. */
export function Evidence({
  source,
  quote,
  verifiedAt,
}: {
  source: { url: string; owner: string } | null;
  quote: string | null;
  verifiedAt: string | null;
}) {
  return (
    <div className="mt-2 text-sm text-muted">
      {source ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {source.owner}
        </a>
      ) : (
        "No source"
      )}
      {" · "}
      {verifiedAt ? `checked ${shortDate(verifiedAt)}` : "not checked by a person"}
      {quote ? (
        <details className="mt-1">
          <summary className="cursor-pointer">Quote from the page</summary>
          <blockquote className="mt-1 rounded-lg bg-surface px-3 py-2 text-foreground">{quote}</blockquote>
        </details>
      ) : null}
    </div>
  );
}
