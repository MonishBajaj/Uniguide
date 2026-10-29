export interface ShortlistItem {
  programId: string;
  title: string;
  band: "reach" | "target" | "likely" | null;
  /** ISO times of the application deadlines still ahead. */
  deadlines: string[];
  country: string;
  fundingFacts: number;
  baseCost: number | null;
}

export interface ShortlistAdvice {
  kind: "empty" | "deadline_cluster" | "no_funding" | "over_budget" | "single_country" | "band_balance";
  message: string;
  programIds: string[];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Plain, specific observations about a shortlist. Never a chance of admission. */
export function shortlistAdvice(items: ShortlistItem[], profile: { budget: number | null; countries: string[] }): ShortlistAdvice[] {
  if (items.length === 0) {
    return [{ kind: "empty", message: "Shortlist a few courses and advice on deadlines, cost and spread appears here.", programIds: [] }];
  }
  const advice: ShortlistAdvice[] = [];

  const dated = items.flatMap((i) => i.deadlines.map((d) => ({ id: i.programId, at: new Date(d).getTime() }))).sort((a, b) => a.at - b.at);
  for (let start = 0; start < dated.length; start++) {
    const window = dated.filter((d) => d.at >= dated[start]!.at && d.at - dated[start]!.at <= WEEK_MS);
    const ids = [...new Set(window.map((d) => d.id))];
    if (ids.length >= 3) {
      advice.push({ kind: "deadline_cluster", message: `${ids.length} of your courses have deadlines within a week of each other. Plan the statements early.`, programIds: ids });
      break;
    }
  }

  const over = items.filter((i) => profile.budget !== null && i.baseCost !== null && i.baseCost > profile.budget);
  if (over.length > 0) {
    advice.push({ kind: "over_budget", message: `${over.length} course(s) cost more than your budget on the published base case.`, programIds: over.map((i) => i.programId) });
  }
  const unfunded = items.filter((i) => i.fundingFacts === 0);
  if (unfunded.length > 0) {
    advice.push({ kind: "no_funding", message: `${unfunded.length} course(s) have no published funding facts yet. Check the university's funding page.`, programIds: unfunded.map((i) => i.programId) });
  }
  if (items.length >= 2 && new Set(items.map((i) => i.country)).size === 1) {
    advice.push({ kind: "single_country", message: "Every course is in one country. Consider whether you would also study elsewhere.", programIds: items.map((i) => i.programId) });
  }
  const banded = items.filter((i) => i.band !== null);
  if (banded.length >= 3 && banded.filter((i) => i.band === "reach").length / banded.length > 0.6) {
    advice.push({ kind: "band_balance", message: "Most of your courses are reaches. Consider adding some target or likely ones.", programIds: banded.filter((i) => i.band === "reach").map((i) => i.programId) });
  }
  return advice;
}
