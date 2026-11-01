import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __SUPABASE_URL__: JSON.stringify("http://127.0.0.1:54321"),
    __SUPABASE_KEY__: JSON.stringify("test-key"),
    __WEB_ORIGIN__: JSON.stringify("http://localhost:3000"),
    __TEST_BUILD__: "true",
    __WRONG_ADAPTER__: "false",
  },
  test: { testTimeout: 60_000 },
});
