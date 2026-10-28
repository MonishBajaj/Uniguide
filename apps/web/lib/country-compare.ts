import type { CountryRule } from "@uniguide/matching";

export type CountryColumn = {
  code: string;
  tuitionRange: { low: number; high: number; currency: string; courses: number } | null;
  fundsRule: CountryRule | null;
  postStudy: CountryRule | null;
  workHours: CountryRule | null;
};

/** One column per requested country, built only from verified rules and verified first year tuition. */
export function compareCountries(
  codes: string[],
  rules: CountryRule[],
  tuition: { country: string; amount: number; currency: string }[],
): CountryColumn[] {
  return codes.map((code) => {
    const verified = (kind: string) => rules.find((r) => r.destination === code && r.kind === kind && r.status === "verified") ?? null;
    const mine = tuition.filter((t) => t.country === code);
    const counts = new Map<string, number>();
    for (const t of mine) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
    const currency = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    const amounts = mine.filter((t) => t.currency === currency).map((t) => t.amount);
    return {
      code,
      tuitionRange: currency ? { low: Math.min(...amounts), high: Math.max(...amounts), currency, courses: amounts.length } : null,
      fundsRule: rules.find((r) => r.destination === code && r.kind === "proof_of_funds" && r.status === "verified" && !r.region) ?? verified("proof_of_funds"),
      postStudy: verified("post_study_work"),
      workHours: verified("work_hours"),
    };
  });
}
