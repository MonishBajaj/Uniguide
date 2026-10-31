import { defineConfig } from "@playwright/test";

// End-to-end flows against the local Supabase stack with the seed users and seed courses loaded
// (see docs/SETUP.md). Specs share those users, so they run one at a time.
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // First visits compile pages on demand, so allow more than the default per test.
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", channel: process.env.E2E_BROWSER_CHANNEL },
  // "demo" runs only with sign-in switched off (AUTH_DISABLED=true, `pnpm e2e:demo`); "community" only with
  // COMMUNITY_ENABLED=true (`pnpm e2e:community`); "app" covers everything else.
  projects: [
    { name: "app", testIgnore: /(demo-mode|community-[\w-]+)\.spec\.ts/ },
    { name: "demo", testMatch: /demo-mode\.spec\.ts/ },
    { name: "community", testMatch: /community-[\w-]+\.spec\.ts/ },
  ],
  webServer: {
    // The dev server: without an email provider it shows the parental consent link instead of
    // sending it, which production rightly refuses to do. The CI web job checks the production build.
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}`,
    // A server Playwright starts has real sign-in, except for `pnpm e2e:demo`, which sets AUTH_DISABLED=true.
    // E2E=1 lets the error-state specs set a test-only cookie that makes the journey read fail (journey M2).
    env: { AUTH_DISABLED: process.env.AUTH_DISABLED === "true" ? "true" : "false", E2E: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
