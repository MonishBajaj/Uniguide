import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { STAGES } from "@uniguide/journey/stages";
import { en } from "./en";
import { hi } from "./hi";

// Journey M2 (J2.5): the journey's interface text goes through lib/i18n in both languages.

/** Every string leaf with its path; functions are called with sample values so their text is checked too. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") return [[path, String((value as (...a: unknown[]) => unknown)(1, 2))]];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

/**
 * Strings that may read the same in Hindi and English: brand names, exam names, and strings made
 * only of placeholders, numbers and punctuation. Anything else added here needs a comment saying why.
 */
const SAME_IN_BOTH = [/^UniGuide$/i, /^(IELTS|TOEFL|PTE|GRE|GMAT|SAT|ACT|Duolingo|TestDaF|DSH|Goethe|DELF|DALF|TCF)\b/];
const onlySymbols = (s: string) => !/\p{L}/u.test(s.replace(/\{\w+\}/g, ""));

describe("journey copy", () => {
  it("translates every journey string into Hindi", () => {
    const english = new Map(leaves(en.journey));
    const same = leaves(hi.journey).filter(([path, text]) => english.get(path) === text && !onlySymbols(text) && !SAME_IN_BOTH.some((r) => r.test(text)));
    expect(same).toEqual([]);
  });

  it("takes the English stage text from the journey engine, so there is one source", () => {
    for (const [n, s] of Object.entries(STAGES)) {
      const copy = en.journey.stages[n as keyof typeof en.journey.stages];
      expect(copy).toEqual({ name: s.name, forText: s.forText, doneWhen: s.doneWhen, usuallyTakes: s.usuallyTakes, parentNote: s.parentNote });
    }
  });
});

/** Visible text written straight into the journey's components, instead of coming from lib/i18n. */
function hardCodedText(file: string, text = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) found.push(node.text.trim());
    // Words people read or hear: labels, titles, placeholders, alternative text.
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && ["aria-label", "title", "placeholder", "alt"].includes(node.name.getText()))
      found.push(`${node.name.getText()}="${node.initializer.text}"`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("journey components", () => {
  const root = join(__dirname, "../..");
  const files = [
    ...readdirSync(join(root, "components/journey")).filter((f) => f.endsWith(".tsx")).map((f) => join(root, "components/journey", f)),
    join(root, "app/app/page.tsx"),
    join(root, "app/app/steps/page.tsx"),
    join(root, "app/app/onboarding/page.tsx"),
    join(root, "app/app/onboarding/short-profile.tsx"),
  ];

  it("are scanned for text and labels (the scan itself works)", () => {
    const sample = `export const A = (p: { t: string }) => <nav aria-label="Main"><p>Save now</p>{p.t}<span>{": "}</span></nav>;`;
    expect(hardCodedText("sample.tsx", sample)).toEqual(['aria-label="Main"', "Save now"]);
  });

  it("have no hard-coded English: every word comes from lib/i18n", () => {
    // The logo is the brand name, the same in every language.
    const allowed = new Set(["Uniguide"]);
    const found = files.flatMap((f) => hardCodedText(f).filter((t) => !allowed.has(t)).map((t) => `${f.slice(root.length + 1)}: ${t}`));
    expect(found).toEqual([]);
  });
});

describe("the stage progress line (M6, J6.2)", () => {
  it("reads in English exactly as the engine writes it", async () => {
    const { stageProgress } = await import("@uniguide/journey");
    const cases: [number, number, number][] = [[1, 2, 5], [3, 1, 4], [4, 1, 1], [5, 0, 2], [6, 0, 2], [7, 3, 4]];
    for (const [stage, done, total] of cases) {
      expect(en.journey.progress(stage, done, total)).toMatch(new RegExp(`^${stage === 6 ? total : `${done} of ${total}`} `));
    }
    expect(typeof stageProgress).toBe("function");
  });
});
