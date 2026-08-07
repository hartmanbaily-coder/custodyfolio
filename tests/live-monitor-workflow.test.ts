import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/live-monitor.yml"),
  "utf8"
);

describe("live monitor workflow", () => {
  it("sends the trusted production origin with the fake login probe", () => {
    expect(workflow).toContain("Origin: baseUrl");
    expect(workflow).toContain('"Sec-Fetch-Site": "same-origin"');
  });

  it("ensures the monitor issue label exists before using it", () => {
    expect(workflow).toContain("gh label create live-monitor");
    expect(workflow).toContain("--force");
  });

  it("fails when production readiness is degraded or blocked", () => {
    expect(workflow).toContain("readinessResponse.status !== 200");
    expect(workflow).toContain('readiness.status !== "ready"');
    expect(workflow).toContain("Production readiness blockers remain");
    expect(workflow).not.toContain("[200, 503].includes(readinessResponse.status)");
  });
});
