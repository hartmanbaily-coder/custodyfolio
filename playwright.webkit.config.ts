import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = "3000";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  webServer: {
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    ...devices["iPhone 13"],
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "webkit-ios",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
});
