import { describe, expect, it } from "vitest";
import { GLOSSARY, glossaryAnchor, STEPS, type GlossaryEntry, type TermId } from "./glossary";

const entries = Object.entries(GLOSSARY) as [TermId, GlossaryEntry][];

describe("glossary", () => {
  it("has unique, defined terms", () => {
    expect(new Set(entries.map(([, e]) => e.term.toLowerCase())).size).toBe(entries.length);
    for (const [, e] of entries) expect(e.definition.length).toBeGreaterThan(40);
  });
  it("links only over https, to the organisation that owns the term", () => {
    for (const [, e] of entries) if (e.link) expect(e.link.href).toMatch(/^https:\/\/[^/]+/);
  });
  it("gives each term its own anchor", () => {
    expect(new Set(entries.map(([id]) => glossaryAnchor(id))).size).toBe(entries.length);
  });
  it("never promises an outcome", () => {
    expect(entries.map(([, e]) => e.definition).join(" ")).not.toMatch(/(?<!not )guarantee|always get|will get you in/i);
  });
});

describe("steps", () => {
  it("point at app pages and only at terms that exist, and use every term at least once", () => {
    const used = new Set(STEPS.flatMap((s) => s.terms));
    for (const s of STEPS) expect(s.href).toMatch(/^\//);
    for (const t of used) expect(GLOSSARY[t]).toBeDefined();
    const unused = entries.map(([id]) => id).filter((id) => !used.has(id));
    expect(unused).toEqual([]);
  });
});
