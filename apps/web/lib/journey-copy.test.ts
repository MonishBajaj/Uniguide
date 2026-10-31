import type { HiddenStep, NextStep } from "@uniguide/journey";
import { describe, expect, it } from "vitest";
import { localizeJourney, localizeProgress, parentStepTitle } from "./journey-copy";

const course = "MSc Physics, University X";
const step = { id: "S3.04:a1", title: `Confirm the intake for ${course}`, reason: "r", copy: { key: "S3.04", params: { course } } } as unknown as NextStep;
const hidden = { id: "S2.01", catalogueId: "S2.01", title: "Look through your matches", copy: { key: "S2.01", params: {} }, state: "dismissed", until: null } as HiddenStep;
const result = { stage: 4 as const, steps: [step], hidden: [hidden], stageProgress: { done: 1, total: 3, label: "1 of 3 applications ready" } };

describe("localizeJourney (M6, J6.2)", () => {
  it("leaves English as the engine wrote it", () => {
    expect(localizeJourney(result, "en")).toBe(result);
  });

  it("shows steps, hidden steps and progress in Hindi, keeping the course name as it is", () => {
    const hi = localizeJourney(result, "hi");
    expect(hi.steps[0]!.title).toBe(`${course} का इनटेक पक्का करें`);
    expect(hi.steps[0]!.reason).toBe(`${course} के एक से ज़्यादा इनटेक खुले हैं।`);
    expect(hi.steps[0]!.id).toBe("S3.04:a1");
    expect(hi.hidden[0]!.title).toBe("अपने मैच देखें");
    expect(hi.stageProgress.label).toBe("3 में से 1 आवेदन तैयार");
    // The original, which is what gets saved, is untouched.
    expect(result.steps[0]!.title).toBe(`Confirm the intake for ${course}`);
  });
});

describe("parent titles", () => {
  it("are shown in Hindi from the catalogue id, and fall back to the saved English", () => {
    const s = { parentTitle: "Working through the MSc X checklist", catalogueId: "S4.01", params: { course: "MSc X" } };
    expect(parentStepTitle(s, "hi")).toBe("MSc X की चेकलिस्ट पूरी करना");
    expect(parentStepTitle(s, "en")).toBe("Working through the MSc X checklist");
    expect(parentStepTitle({ parentTitle: "Saved before M6" }, "hi")).toBe("Saved before M6");
  });

  it("show the progress line in the parent's language", () => {
    expect(localizeProgress(6, { done: 0, total: 2, label: "2 offers to decide on" }, "hi")).toBe("2 ऑफ़र पर फ़ैसला करना है");
  });
});
