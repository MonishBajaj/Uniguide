import { describe, expect, it } from "vitest";
import { en } from "./en";
import { hi } from "./hi";
import { STEPS } from "@/lib/glossary";
import { pickLocale } from "./index";

/** Every path to a leaf, with its type, so both languages can be compared shape for shape. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "function") return [[path, "function"]];
  if (typeof value === "string") return [[path, "string"]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, typeof value]];
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [String((value as (...a: unknown[]) => unknown)(1, 2))];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("translations", () => {
  it("have exactly the same keys, list lengths and kinds of value", () => {
    expect(leaves(hi)).toEqual(leaves(en));
  });
  it("have no empty strings", () => {
    for (const s of [...strings(en), ...strings(hi)]) expect(s.trim()).not.toBe("");
  });
  it("Hindi is written in Devanagari, apart from a few shared words", () => {
    const shared = strings(hi).filter((s) => !/[ऀ-ॿ]/.test(s));
    // Machine values (form option codes) are shared with English by design.
    expect(shared).toEqual(["View in English", ...hi.waitlist.doors.map((d) => d.value)]);
  });
  it("cover every guide step", () => {
    expect(en.guide.steps).toHaveLength(STEPS.length);
  });
  it("keep machine values identical", () => {
    expect(hi.waitlist.doors.map((d) => d.value)).toEqual(en.waitlist.doors.map((d) => d.value));
  });
});

describe("pickLocale", () => {
  it("uses the saved choice first", () => {
    expect(pickLocale("hi", "en-GB")).toBe("hi");
    expect(pickLocale("en", "hi-IN")).toBe("en");
  });
  it("otherwise follows the browser only when Hindi comes before English", () => {
    expect(pickLocale(undefined, "hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi");
    expect(pickLocale(undefined, "en-IN,en;q=0.9,hi;q=0.8")).toBe("en");
    expect(pickLocale(undefined, "ta-IN,hi;q=0.8")).toBe("hi");
    expect(pickLocale("fr", null)).toBe("en");
  });
});
