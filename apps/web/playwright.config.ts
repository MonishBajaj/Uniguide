import { defineConfig } from "@playwright/test";

// End-to-end flows against the local Supabase stack with the seed users and seed courses loaded
// (see docs/SETUP.md). Specs share those users, so they run one at a time.
const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // First visits compile pages on demand, so allow more than the default per test.
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: {
    // The dev server: without an email provider it shows the parental consent link instead of
    // sending it, which production rightly refuses to do. The CI web job checks the production build.
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
