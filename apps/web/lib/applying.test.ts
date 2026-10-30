import { describe, expect, it } from "vitest";
import { applyingHref, canStartApplying } from "./applying";

describe("canStartApplying", () => {
  it("only starts a shortlisted application", () => {
    expect(canStartApplying("shortlisted")).toBe(true);
    for (const status of ["preparing", "submitted", "decided", "withdrawn"]) expect(canStartApplying(status), status).toBe(false);
  });

  it("lands on the checklist with the confirmation", () => {
    expect(applyingHref("abc")).toBe("/app/tracker/abc?applying=1#checklist");
  });
});
