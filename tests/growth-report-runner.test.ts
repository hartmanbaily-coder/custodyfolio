import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("growth report exclusion preflight", () => {
  it.each([undefined, "", " , ", "not-a-uuid"])("rejects unsafe exclusion configuration before querying (%s)", (value) => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-key",
      MARKETING_ANALYTICS_SECRET: "s".repeat(32),
    };
    if (value !== undefined) env.GROWTH_EXCLUDED_USER_IDS = value;
    const result = spawnSync(process.execPath, ["scripts/report-growth-scorecard.mjs"], { env, encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toMatch(/Unable to load|fetch failed|ECONNREFUSED/);
    expect(result.stderr).toMatch(/GROWTH_EXCLUDED_USER_IDS|internal account exclusion|Invalid UUID/i);
  });
});
