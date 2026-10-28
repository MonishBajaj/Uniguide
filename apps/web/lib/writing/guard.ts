import type { Sentence } from "./segment";

const normal = (s: string) => s.toLowerCase().replace(/[“”"‘’']/g, "").replace(/\s+/g, " ").trim();

/**
 * Coaching only: any quoted wording of six words or more that is not the student's own is removed,
 * evidence must point at real sentences, and questions must be questions.
 */
export function stripInventedQuotes(text: string, draft: string): string {
  const own = normal(draft);
  return text.replace(/[“"]([^”"]+)[”"]/g, (whole, inner: string) => {
    const words = inner.trim().split(/\s+/).length;
    return words >= 6 && !own.includes(normal(inner)) ? "[suggested wording removed: write this in your own words]" : whole;
  });
}

type Coachable = { [key: string]: unknown };

export function enforceCoaching<T extends Coachable>(result: T, sentences: Sentence[]): T {
  const ids = new Set(sentences.map((s) => s.id));
  const draft = sentences.map((s) => s.text).join(" ");
  const clean = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      let text = stripInventedQuotes(value, draft);
      if ((key === "question" || key === "biggest_question") && !text.trim().endsWith("?")) text = `${text.trim()}?`;
      return text;
    }
    if (Array.isArray(value)) {
      return key === "evidence" ? value.filter((v) => typeof v === "string" && ids.has(v)) : value.map((v) => clean(v));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    }
    return value;
  };
  const out = clean(result) as T & { strongest_sentence?: string; criteria?: { score: number; evidence: string[] }[] };
  if (out.strongest_sentence !== undefined && !ids.has(out.strongest_sentence)) out.strongest_sentence = "";
  for (const c of out.criteria ?? []) {
    if (typeof c.score === "number") c.score = Math.min(5, Math.max(1, Math.round(c.score)));
    // A score with no real evidence sentence is not supported.
    if (Array.isArray(c.evidence) && c.evidence.length === 0 && typeof c.score === "number") c.score = 1;
  }
  return out;
}
