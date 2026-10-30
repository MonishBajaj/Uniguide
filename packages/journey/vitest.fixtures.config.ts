import { defineConfig } from "vitest/config";

// Only for `pnpm diff-fixtures` (scripts/diff-fixtures.ts); the normal test run doesn't include it.
export default defineConfig({ test: { include: ["scripts/diff-fixtures.ts"] } });
