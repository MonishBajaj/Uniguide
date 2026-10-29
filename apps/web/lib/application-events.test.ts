import { describe, expect, it } from "vitest";
import { checkedAgo, describeEvent } from "./application-events";

const e = (kind: string, from_value: string | null = null, to_value: string | null = null, note: string | null = null) => ({
  kind, from_value, to_value, note,
});

describe("application history", () => {
  it("describes each kind of event", () => {
    expect(describeEvent(e("created", null, "shortlisted"))).toBe("Added to your tracker");
    expect(describeEvent(e("status", "preparing", "submitted"))).toBe("Moved from Preparing to Submitted");
    expect(describeEvent(e("decision", null, "admitted"))).toBe("Decision recorded: Admitted");
    expect(describeEvent(e("decision", "admitted", null))).toBe("Decision cleared");
    expect(describeEvent(e("portal_check"))).toBe("Checked the portal");
    expect(describeEvent(e("portal_check", null, null, "Under review"))).toBe("Checked the portal: Under review");
    expect(describeEvent(e("note", null, null, "Emailed admissions"))).toBe("Emailed admissions");
  });

  it("says how long ago the portal was checked", () => {
    const now = new Date("2026-12-10T12:00:00Z");
    expect(checkedAgo(null, now)).toBe("never");
    expect(checkedAgo("2026-12-10T08:00:00Z", now)).toBe("today");
    expect(checkedAgo("2026-12-09T08:00:00Z", now)).toBe("yesterday");
    expect(checkedAgo("2026-12-01T12:00:00Z", now)).toBe("9 days ago");
  });
});
