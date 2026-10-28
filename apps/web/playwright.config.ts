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
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: process.env.CI ? `pnpm start --port ${port}` : `pnpm dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
