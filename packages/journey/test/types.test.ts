import { describe, expect, it } from "vitest";
import { computeJourney, ENGINE_VERSION } from "../src";

describe("journey package", () => {
  it("names its engine version like the matching package does", () => {
    expect(ENGINE_VERSION).toMatch(/^journey-\d+\.\d+\.\d+$/);
  });
  it("exports the engine", () => {
    expect(typeof computeJourney).toBe("function");
  });
});
