import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("release security regressions", () => {
  it("propagates the selected snapshot key through export-only deletion", async () => {
    const [route, client] = await Promise.all([
      source("../src/app/api/records/dataset/delete/route.ts"),
      source("../src/lib/records/clientStore.ts"),
    ]);
    expect(route).toContain("getRecordsCaseKey(request)");
    expect(route).not.toContain('.eq("case_key", "default")');
    expect(client).toContain("/api/records/dataset/delete?caseId=");
    expect(client).toContain("expectedUpdatedAt: remoteSnapshotUpdatedAt");
  });

  it("uses the authoritative evidence snapshot key for metadata cleanup", async () => {
    const [storage, route] = await Promise.all([
      source("../src/lib/records/evidenceStorage.ts"),
      source("../src/app/api/records/evidence/delete/route.ts"),
    ]);
    expect(storage).toContain('.select("case_key,dataset")');
    expect(storage).toContain("caseKey: row.case_key");
    expect(route).toContain("authoritative.caseKey");
    expect(route).not.toContain('.eq("case_key", "default")');
  });

  it("keeps local MCP configuration out of production deployment sync", async () => {
    const deploy = await source("../deploy/production/deploy-from-mac.sh");
    expect(deploy).toContain("--exclude '.mcp.json'");
    expect(deploy).toContain("--exclude '.codex/'");
    expect(deploy).toContain("--exclude '.agents/'");
  });

  it("limits the deployment override to documented approval-only blockers", async () => {
    const [smoke, classification, readinessRoute] = await Promise.all([
      source("../deploy/production/smoke-test.sh"),
      source("../deploy/production/readiness-blocker-classification.sh"),
      source("../src/app/api/records/readiness/route.ts"),
    ]);
    expect(smoke).toContain("readiness_blockers_are_approval_only");
    expect(smoke).toContain(
      '(.billing.checks // []) | any(("billing:" + .id) == $blocker)'
    );
    expect(classification).toContain('"data-retention-policy"');
    expect(classification).toContain('"incident-response-plan"');
    expect(classification).toContain('"legal-review"');
    expect(classification).toContain("return 1");
    expect(smoke).toContain("readiness_technical_blocked=true");
    expect(smoke).toContain("exit 1");
    expect(readinessRoute).toContain(
      'const billingRequired = billingMode() === "live";'
    );
  });

  it("keeps provider reconciliation available after entitlement revocation", async () => {
    const subscriptionPanel = await source(
      "../src/components/billing/SubscriptionPanel.tsx"
    );
    expect(subscriptionPanel).toContain(
      'status.subscription?.provider === "stripe"'
    );
    expect(subscriptionPanel).toContain(
      'status.subscription?.provider === "apple" && status.nativeIos'
    );
  });

  it("preserves provider access restrictions across out-of-order billing events", async () => {
    const migration = await source(
      "../supabase/migrations/20260815163000_preserve_provider_access_restrictions.sql"
    );
    expect(migration).toContain("provider_subscription_id");
    expect(migration).toContain("access_restriction");
    expect(migration).toContain("'open_dispute'");
    expect(migration).toContain("p_event_type = 'charge.dispute.closed'");
    expect(migration).toContain("incoming_restriction in ('refunded', 'revoked')");

    const disputeMigration = await source(
      "../supabase/migrations/20260821220000_track_stripe_dispute_identity.sql"
    );
    expect(disputeMigration).toContain("custody_folio_provider_restrictions");
    expect(disputeMigration).toContain("providerEventObjectId");
    expect(disputeMigration).toContain("and r.active");
    expect(disputeMigration).toContain("not has_open_dispute");
    expect(disputeMigration).toContain(
      "Retried invoice failures do not start a fresh grace period"
    );
    const stripeWebhook = await source(
      "../src/app/api/records/billing/stripe/webhook/route.ts"
    );
    expect(stripeWebhook).toContain("providerEventObjectId = dispute.id");
    expect(stripeWebhook).toContain(
      "providerEventObjectId: resolved.providerEventObjectId"
    );
  });

  it("indexes billing reconciliation history by its account foreign key", async () => {
    const migration = await source(
      "../supabase/migrations/20260815170000_index_billing_reconciliation_account.sql"
    );
    expect(migration).toContain(
      "custody_folio_reconciliation_account_started_idx"
    );
    expect(migration).toContain("billing_account_id, started_at desc");
    expect(migration).toContain("where billing_account_id is not null");
  });
});
