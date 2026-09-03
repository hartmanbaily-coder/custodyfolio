import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const packet = source("marketing/PRODUCTION_RELEASE_PACKET_V2.md");
const migrationPaths = [
  "supabase/migrations/20260831120000_add_growth_events_and_feedback_consents.sql",
  "supabase/migrations/20260901052100_restrict_growth_function_execution.sql",
];

describe("marketing production release packet", () => {
  it("binds the packet to the current migration and policy bundle", () => {
    const migrationDigests = migrationPaths.map((migrationPath) =>
      createHash("sha256").update(source(migrationPath)).digest("hex")
    );
    const policyBundle = source("src/generated/productionPolicyBundle.mjs");
    const policyDigest = policyBundle.match(
      /productionPolicyBundleSha256 = "(sha256:[a-f0-9]{64})"/
    )?.[1];

    expect(policyDigest).toBeTruthy();
    for (const migrationDigest of migrationDigests) {
      expect(packet).toContain(migrationDigest);
    }
    expect(packet).toContain(policyDigest);
  });

  it("keeps both customer facing features disabled in the production template", () => {
    const template = source(".env.production.example");

    expect(template).toContain("MARKETING_ANALYTICS_ENABLED=false");
    expect(template).toContain("CUSTOMER_FEEDBACK_INVITE_ENABLED=false");
    expect(template).toContain("CUSTOMER_GROWTH_SCHEMA_VERIFIED_AT=");
  });

  it("keeps launch pending deployments fail closed", () => {
    const deployment = source("deploy/production/deploy.sh");

    expect(deployment).toContain("MARKETING_ANALYTICS_ENABLED");
    expect(deployment).toContain("CUSTOMER_FEEDBACK_INVITE_ENABLED");
  });

  it("lists exactly four separate decisions and records their status", () => {
    expect(packet.match(/^### Decision [1-4]$/gm)).toHaveLength(4);
    expect(packet).toContain("Decisions 1, 2, and 3 are approved. Decision 4 is not approved.");
  });
});
