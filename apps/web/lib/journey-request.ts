/**
 * Journey M2 (J2.1): one snapshot read per request. The navigation and the page both ask for the
 * journey; `journeyRequest` reads and computes it once, and `save` stores that same result.
 * The server wrapper (`journey-request.server.ts`) creates one of these per request with React `cache()`.
 */
import { type JourneyInput, type JourneyResult, computeJourney } from "@uniguide/journey";
import { type JourneyRpc, parseSnapshot } from "./journey-snapshot";

export interface LoadedJourney {
  input: JourneyInput;
  result: JourneyResult;
}

/** Test-only switch: with E2E=1 on the server, this cookie makes the journey read fail (error-state tests). */
export const FAIL_COOKIE = "ug_e2e_journey_fail";

export function failureInjected(env: { E2E?: string }, cookie: string | undefined): boolean {
  return env.E2E === "1" && cookie === "1";
}

export function journeyRequest(supabase: JourneyRpc, today: string, fail = false) {
  let loaded: Promise<LoadedJourney> | null = null;

  async function read(): Promise<LoadedJourney> {
    if (fail) throw new Error("Journey read failed (test switch)");
    const { data, error } = await supabase.rpc("journey_snapshot", {});
    if (error) throw new Error(`journey_snapshot failed: ${error.message}`);
    const input = parseSnapshot(data, today);
    return { input, result: computeJourney(input) };
  }

  return {
    /** The journey for this request; the snapshot is read at most once. */
    get: (): Promise<LoadedJourney> => (loaded ??= read()),
    /** Saves the journey already read. A failed save is logged, not thrown, so a page never breaks on it. */
    async save(): Promise<void> {
      const { result } = await (loaded ??= read());
      const saved = await supabase.rpc("save_journey_state", { p_state: result });
      if (saved.error) console.error(`save_journey_state failed: ${saved.error.message}`);
    },
  };
}
