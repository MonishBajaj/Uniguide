import type { JourneyInput, JourneyResult } from "./types";
import { ENGINE_VERSION } from "./version";

/** The journey for one student on one date. Pure: same input, same output. */
export function computeJourney(input: JourneyInput): JourneyResult {
  void input;
  return {
    stage: 1,
    stageProgress: { done: 0, total: 0, label: "" },
    steps: [],
    completed: [],
    urgentCount: 0,
    urgentLabel: null,
    stalled: false,
    engineVersion: ENGINE_VERSION,
  };
}
