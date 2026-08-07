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

  it("treats only the documented launch approvals as non-outage blockers", () => {
    expect(workflow).toContain("[200, 503].includes(readinessResponse.status)");
    expect(workflow).toContain("allowedPendingLaunchBlockers");
    expect(workflow).toContain('"backup-restore-tested"');
    expect(workflow).toContain('"data-retention-policy"');
    expect(workflow).toContain('"incident-response-plan"');
    expect(workflow).toContain('"legal-review"');
    expect(workflow).toContain("Customer launch approval blockers remain");
    expect(workflow).not.toContain("readinessResponse.status !== 200");
    expect(workflow).not.toContain("Production readiness blockers remain");
  });

  it("still fails for unexpected blockers or inconsistent readiness responses", () => {
    expect(workflow).toContain("Unexpected production readiness blockers");
    expect(workflow).toContain("does not match status");
    expect(workflow).toContain("not_ready without an explanatory blocker");
    expect(workflow).toContain("Readiness is ready but still reports blockers");
  });

  it("closes a stale monitor issue after recovery", () => {
    expect(workflow).toContain("Close monitor issue on recovery");
    expect(workflow).toContain("Live monitor recovered");
    expect(workflow).toContain('gh issue close "$existing_issue" --reason completed');
  });
});
