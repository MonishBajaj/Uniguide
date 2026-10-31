import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { STAGES } from "../src/stages";

/**
 * Journey M4 (J4.3): the worker's emails name the stage and quote its parent note. It reads them from a
 * JSON copy of STAGES inside the worker package (its image only ships worker/src), so the text has one
 * source. `UPDATE=1 pnpm --filter @uniguide/journey test` rewrites the copy after a deliberate change.
 */
const FILE = join(__dirname, "../../../worker/src/uniguide_worker/journey_stages.json");

it("the worker's stage text matches STAGES", () => {
  const want = Object.fromEntries(
    Object.entries(STAGES).map(([n, s]) => [n, { name: s.name, forText: s.forText, doneWhen: s.doneWhen, usuallyTakes: s.usuallyTakes, parentNote: s.parentNote }]),
  );
  const text = `${JSON.stringify(want, null, 2)}\n`;
  if (process.env.UPDATE === "1" || !existsSync(FILE)) writeFileSync(FILE, text);
  expect(readFileSync(FILE, "utf8")).toBe(text);
});
