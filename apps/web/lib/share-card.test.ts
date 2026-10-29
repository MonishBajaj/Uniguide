import { describe, expect, it } from "vitest";
import { cleanName, intakeLabel, shareCardLines } from "./share-card";

describe("share card", () => {
  it("formats the intake", () => {
    expect(intakeLabel("2027-autumn")).toBe("Autumn 2027");
    expect(intakeLabel("2027-register")).toBe("Register 2027");
    expect(intakeLabel("rolling")).toBe("rolling");
    expect(intakeLabel(null)).toBe("");
  });

  it("cleans the optional name", () => {
    expect(cleanName("  Asha   Rao ")).toBe("Asha Rao");
    expect(cleanName("<script>x</script>")).toBe("scriptx/script");
    expect(cleanName("a\u0000b\nc")).toBe("abc");
    expect(cleanName("x".repeat(60))).toHaveLength(40);
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });

  it("says only what is safe to share", () => {
    expect(shareCardLines({ title: "MSc Data Science", institution: "University of Exampleton", intake: "2027-autumn", name: null })).toEqual({
      headline: "I got in!",
      course: "MSc Data Science",
      institution: "University of Exampleton",
      intake: "Autumn 2027",
    });
    expect(shareCardLines({ title: "T", institution: "U", intake: null, name: "Asha" }).headline).toBe("Asha got in!");
  });
});
