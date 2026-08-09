import { defineConfig, devices } from "@playwright/test";

const host = process.env.PLAYWRIGHT_HOST || "127.0.0.1";
const port = process.env.PLAYWRIGHT_PORT || "3000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://${host}:${port}`;
const standaloneCommand = [
  "npm run build",
  "cp -R public .next/standalone/public",
  "cp -R .next/static .next/standalone/.next/static",
  `HOSTNAME=${host} PORT=${port} node .next/standalone/server.js`,
].join(" && ");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  webServer: {
    command: standaloneCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
