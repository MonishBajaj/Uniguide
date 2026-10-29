import { describe, expect, it } from "vitest";
import { courseMaterial, namedInDraft } from "./why-helper";

const course = { city: "Exampleton", duration_months: 12, delivery_mode: "on_campus", languages_of_instruction: ["en"], track: null };
const faculty = [
  { id: "f1", name: "Priya Raman", topics: [{ name: "Hospital scheduling" }, { name: "Stochastic optimisation" }], recent_works: [{ title: "Rostering under uncertainty", year: 2025 }] },
  { id: "f2", name: "Li Wu", topics: [], recent_works: [] },
];

describe("why this university helper", () => {
  const items = courseMaterial(course, faculty);

  it("collects researchers, place and format from stored facts", () => {
    expect(items.map((i) => i.key)).toEqual(["faculty:f1", "faculty:f2", "place", "format"]);
    expect(items[0]!.detail).toBe('Hospital scheduling, Stochastic optimisation; recent: "Rostering under uncertainty" (2025)');
    expect(items[3]!.detail).toBe("12 months, on campus, taught in English");
  });

  it("matches surnames as whole words, and short surnames by full name", () => {
    expect(items[0]!.terms).toEqual(["Raman"]);
    expect(items[1]!.terms).toEqual(["Li Wu"]);
    expect([...namedInDraft("Professor Raman's work on rostering", items)]).toEqual(["faculty:f1"]);
    expect(namedInDraft("Ramanathan and Wu", items).size).toBe(0);
  });

  it("counts the city but never the format", () => {
    expect([...namedInDraft("Living in exampleton would let me...", items)]).toEqual(["place"]);
    expect(namedInDraft("a 12 months on campus course taught in English", items).has("format")).toBe(false);
  });

  it("finds nothing in a draft that could be about any university", () => {
    expect(namedInDraft("Your world-class faculty and excellent reputation inspire me.", items).size).toBe(0);
  });
});
