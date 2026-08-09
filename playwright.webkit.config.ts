import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = "3100";
const baseURL = `http://${host}:${port}`;
const standaloneCommand = [
  "npm run build",
  "cp -R public .next/standalone/public",
  "cp -R .next/static .next/standalone/.next/static",
  `HOSTNAME=${host} PORT=${port} node .next/standalone/server.js`,
].join(" && ");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // Next's development compiler can trigger full-page refreshes when two
  // WebKit sessions request previously uncompiled routes at the same time.
  // Run the iOS regression lane serially so navigation assertions exercise
  // the product instead of racing the development server's hot reload.
  workers: 1,
  webServer: {
    command: standaloneCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  use: {
    ...devices["iPhone 13"],
    baseURL,
    serviceWorkers: "block",
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
