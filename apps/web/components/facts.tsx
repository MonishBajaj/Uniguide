import { shortDate } from "@/lib/format";

const STATUS = {
  verified: { text: "Verified", className: "text-verified bg-[#a0f3d4]/35 border-[#53a58a]/40" },
  unverified: { text: "Unverified, confirm on the official page", className: "text-unverified bg-[#ffdad3]/40 border-[#ffb4a4]/60" },
  conflicting: { text: "Official sources disagree", className: "text-conflicting bg-[#ffdad6]/40 border-[#ba1a1a]/40" },
  unknown: { text: "Not yet known", className: "text-muted bg-surface-2 border-border" },
} as const;

export function FactBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${s.className}`}>
      {status === "verified" ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
      ) : null}
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
    <span title={TIERS[tier]} className="inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted border border-border/80">
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
        <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-primary font-medium">
          {source.owner}
        </a>
      ) : (
        "No source"
      )}
      {" · "}
      {verifiedAt ? `checked ${shortDate(verifiedAt)}` : "not checked by a person"}
      {quote ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline">Quote from the page</summary>
          <blockquote className="mt-1 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-foreground text-xs leading-relaxed italic">{quote}</blockquote>
        </details>
      ) : null}
    </div>
  );
}
