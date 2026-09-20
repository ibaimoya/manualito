import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  forbidOnly: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5229",
  },
  webServer: {
    command: "pnpm exec wrangler dev --ip 127.0.0.1 --port 5229 --inspector-port 0",
    url: "http://127.0.0.1:5229",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
