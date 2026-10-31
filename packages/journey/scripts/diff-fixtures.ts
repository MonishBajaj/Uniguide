/**
 * Compares the engine's full output for every fixture with the copy saved in
 * test/fixtures/output.json, so an engine change (M3 switching steps on, a rule change) shows
 * exactly what it changes. expected.json holds only stages and top three ids; this holds everything.
 *
 *   pnpm --filter @uniguide/journey diff-fixtures              compare, and list every difference
 *   UPDATE=1 pnpm --filter @uniguide/journey diff-fixtures     save the current output as the new copy
 *
 * Runs on demand only: it is not part of `pnpm test`.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { computeJourney } from "../src";
import { STAGE_FIXTURES } from "../test/fixtures";

const FILE = join(__dirname, "../test/fixtures/output.json");

/** Every leaf path where two values differ, e.g. "stage-1-new-account.steps[2].href". */
function differences(a: unknown, b: unknown, path = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], Array.isArray(a) ? `${path}[${k}]` : path ? `${path}.${k}` : k),
    );
  }
  return [`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`];
}

it("engine output matches the saved copy", () => {
  const now = Object.fromEntries(Object.entries(STAGE_FIXTURES).map(([name, f]) => [name, computeJourney(f.input)]));
  if (process.env.UPDATE === "1" || !existsSync(FILE)) {
    writeFileSync(FILE, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`Saved the engine output for ${Object.keys(now).length} fixtures to ${FILE}`);
    return;
  }
  const saved = JSON.parse(readFileSync(FILE, "utf8"));
  const diff = differences(saved, now);
  if (diff.length) console.log(`${diff.length} differences (saved → now):\n${diff.join("\n")}`);
  expect(diff).toEqual([]);
});
