import { describe, expect, it } from "vitest";
import { letterProgress, lettersNeeded } from "./recommendations";

describe("recommendation letters", () => {
  it("reads the required count from the course's requirements", () => {
    expect(lettersNeeded([{ kind: "recommendation_letters", count_required: 2 }, { kind: "language_test", count_required: null }])).toBe(2);
    expect(lettersNeeded([{ kind: "statement", count_required: null }])).toBeNull();
  });

  it("counts submitted and lined-up letters, ignoring declined ones", () => {
    const p = letterProgress([{ status: "submitted" }, { status: "agreed" }, { status: "declined" }, { status: "not_asked" }], 3);
    expect(p).toEqual({ submitted: 1, lined_up: 2, needed: 3, short: 1 });
  });

  it("says how many more people to ask", () => {
    expect(letterProgress([{ status: "asked" }], 2).short).toBe(1);
    expect(letterProgress([{ status: "asked" }, { status: "agreed" }, { status: "asked" }], 2).short).toBe(0);
    expect(letterProgress([], null).short).toBeNull();
  });
});
