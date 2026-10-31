import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Journey M6 (J6.3): journey pages link with AppLink, which doesn't prefetch when data saver is on (15.3).
const ROOT = join(__dirname, "..");
const FILES = [
  ...readdirSync(join(ROOT, "components/journey")).filter((f) => f.endsWith(".tsx")).map((f) => join("components/journey", f)),
  "app/app/page.tsx",
  "app/app/steps/page.tsx",
];

describe("journey links in data-saver mode", () => {
  for (const f of FILES) {
    it(`${f} doesn't import next/link directly`, () => {
      expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/from "next\/link"/);
    });
  }
});
