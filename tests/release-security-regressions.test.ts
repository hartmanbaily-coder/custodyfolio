import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

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

  it("limits TestFlight StoreKit acceptance to one user and restores live billing", async () => {
    const [helper, runner, config, envTemplate] = await Promise.all([
      source("../deploy/production/configure-apple-testflight-canary.sh"),
      source("../deploy/production/run-apple-testflight-purchase-window.sh"),
      source("../src/lib/billing/config.ts"),
      source("../.env.example"),
    ]);
    expect(helper).toContain('print "BILLING_MODE=test"');
    expect(helper).toContain('print "BILLING_CHECKOUT_ENABLED=false"');
    expect(helper).toContain('print "APPLE_PURCHASE_ENABLED=false"');
    expect(helper).toContain('print "APPLE_BILLING_ENVIRONMENT=sandbox"');
    expect(helper).toContain("remaining > 7200");
    expect(helper).toContain("APPLE_REVIEW_SANDBOX_ENABLED");
    expect(helper).toContain('cp "${backup_file}" "${next_env}"');
    expect(runner).toContain("trap cleanup EXIT INT TERM HUP");
    expect(runner).toContain('read -r -t "$((window_minutes * 60))" _ || true');
    expect(config).toContain("appleTestFlightCanaryEnabled(userId, env, now)");
    expect(config).toContain('billingMode(env) !== "test"');
    expect(envTemplate).toContain("APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false");
  });

  it("restores the exact protected environment after a TestFlight canary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "custodyfolio-apple-canary-"));
    const envFile = join(directory, "app.env");
    const helper = fileURLToPath(
      new URL("../deploy/production/configure-apple-testflight-canary.sh", import.meta.url)
    );
    await writeFile(
      envFile,
      [
        "BILLING_MODE=live",
        "BILLING_CHECKOUT_ENABLED=false",
        "BILLING_LIVE_CANARY_AUTHORIZED=false",
        "APPLE_PURCHASE_ENABLED=",
        "APPLE_BILLING_ENVIRONMENT=production",
        "",
      ].join("\n"),
      { mode: 0o600 }
    );
    await chmod(envFile, 0o600);
    const commandEnv = {
      ...process.env,
      LOSTTOFOUND_ENV_FILE: envFile,
    };
    await execFileAsync("bash", [helper, "install"], { env: commandEnv });
    const installed = await readFile(envFile, "utf8");
    expect(installed).toContain("APPLE_PURCHASE_ENABLED=false");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
    await execFileAsync(
      "bash",
      [helper, "open", "724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea", expiresAt],
      { env: commandEnv }
    );
    const opened = await readFile(envFile, "utf8");
    expect(opened).toContain("BILLING_MODE=test");
    expect(opened).toContain("BILLING_CHECKOUT_ENABLED=false");
    expect(opened).toContain("APPLE_PURCHASE_ENABLED=false");
    expect(opened).toContain("APPLE_TESTFLIGHT_CANARY_AUTHORIZED=true");
    expect(opened).toContain("APPLE_BILLING_ENVIRONMENT=sandbox");
    await execFileAsync("bash", [helper, "close"], { env: commandEnv });
    expect(await readFile(envFile, "utf8")).toBe(installed);
    await expect(access(`${envFile}.apple-testflight-canary-backup`)).rejects.toThrow();
  });

  it("limits App Review Sandbox to one expiring account without changing Stripe checkout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "custodyfolio-apple-review-"));
    const envFile = join(directory, "app.env");
    const helper = fileURLToPath(
      new URL("../deploy/production/configure-apple-review-sandbox.sh", import.meta.url)
    );
    await writeFile(
      envFile,
      [
        "BILLING_MODE=live",
        "BILLING_CHECKOUT_ENABLED=true",
        "BILLING_LIVE_CANARY_AUTHORIZED=false",
        "APPLE_PURCHASE_ENABLED=false",
        "APPLE_TESTFLIGHT_CANARY_AUTHORIZED=false",
        "",
      ].join("\n"),
      { mode: 0o600 }
    );
    await chmod(envFile, 0o600);
    const commandEnv = {
      ...process.env,
      LOSTTOFOUND_ENV_FILE: envFile,
    };
    await execFileAsync("bash", [helper, "install"], { env: commandEnv });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
    await execFileAsync(
      "bash",
      [helper, "open", "724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea", expiresAt],
      { env: commandEnv }
    );
    const opened = await readFile(envFile, "utf8");
    expect(opened).toContain("BILLING_MODE=live");
    expect(opened).toContain("BILLING_CHECKOUT_ENABLED=true");
    expect(opened).toContain("APPLE_REVIEW_SANDBOX_ENABLED=true");
    expect(opened).toContain(
      "APPLE_REVIEW_SANDBOX_USER_ID=724f81aa-b6d1-4b8a-ab59-aec5fe29e7ea"
    );
    await execFileAsync("bash", [helper, "close"], { env: commandEnv });
    const closed = await readFile(envFile, "utf8");
    expect(closed).toContain("BILLING_MODE=live");
    expect(closed).toContain("BILLING_CHECKOUT_ENABLED=true");
    expect(closed).toContain("APPLE_REVIEW_SANDBOX_ENABLED=false");
    expect(closed).toContain("APPLE_REVIEW_SANDBOX_USER_ID=\n");
    expect(closed).toContain("APPLE_REVIEW_SANDBOX_EXPIRES_AT=\n");
  });

  it("records billing evidence without opening either purchase provider", async () => {
    const evidence = await source(
      "../deploy/production/configure-billing-readiness-evidence.sh"
    );
    expect(evidence).toContain('keys["BILLING_POLICY_APPROVED"] = "true"');
    expect(evidence).toContain(
      'keys["BILLING_POLICY_APPROVAL_BASIS"] = "operator_self_review"'
    );
    expect(evidence).not.toContain('keys["BILLING_CHECKOUT_ENABLED"]');
    expect(evidence).not.toContain('keys["LIVE_BILLING_APPROVED"]');
    expect(evidence).not.toContain('keys["BILLING_LIVE_ACTIVATION_AUTHORIZED"]');
    expect(evidence).not.toContain('keys["BILLING_TAX_REVIEW_APPROVED"]');
  });

  it("records only the reviewed United States tax decision without activating billing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "custodyfolio-tax-decision-"));
    const envFile = join(directory, "app.env");
    const helper = fileURLToPath(
      new URL("../deploy/production/configure-billing-tax-decision.sh", import.meta.url)
    );
    await writeFile(
      envFile,
      [
        "STRIPE_TAX_MODE=disabled",
        "BILLING_TAX_REVIEW_APPROVED=false",
        "BILLING_TAX_REVIEWED_AT=",
        "BILLING_CHECKOUT_ENABLED=false",
        "LIVE_BILLING_APPROVED=false",
        "BILLING_LIVE_ACTIVATION_AUTHORIZED=false",
        "APPLE_PURCHASE_ENABLED=false",
        "",
      ].join("\n"),
      { mode: 0o600 }
    );
    await chmod(envFile, 0o600);
    await execFileAsync(
      "bash",
      [
        helper,
        "approve-us-only-not-collecting",
        new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      ],
      { env: { ...process.env, LOSTTOFOUND_ENV_FILE: envFile } }
    );

    const configured = await readFile(envFile, "utf8");
    expect(configured).toContain("STRIPE_TAX_MODE=not_collecting");
    expect(configured).toContain("BILLING_TAX_REVIEW_APPROVED=true");
    expect(configured).toContain("BILLING_CHECKOUT_ENABLED=false");
    expect(configured).toContain("LIVE_BILLING_APPROVED=false");
    expect(configured).toContain("BILLING_LIVE_ACTIVATION_AUTHORIZED=false");
    expect(configured).toContain("APPLE_PURCHASE_ENABLED=false");
  });

  it("opens and reverses global U.S. web checkout without changing Apple purchases", async () => {
    const directory = await mkdtemp(join(tmpdir(), "custodyfolio-live-release-"));
    const envFile = join(directory, "app.env");
    const helper = fileURLToPath(
      new URL("../deploy/production/configure-billing-live-release.sh", import.meta.url)
    );
    const initial = [
      "BILLING_MODE=live",
      "BILLING_CHECKOUT_ENABLED=false",
      "BILLING_LIVE_CANARY_AUTHORIZED=false",
      "APPLE_PURCHASE_ENABLED=false",
      "STRIPE_TAX_MODE=not_collecting",
      "DATA_RETENTION_POLICY_APPROVED=true",
      "INCIDENT_RESPONSE_PLAN_APPROVED=true",
      "LEGAL_REVIEW_APPROVED=true",
      "BILLING_POLICY_APPROVED=true",
      "BILLING_TAX_REVIEW_APPROVED=true",
      "STRIPE_LIVE_RESTRICTED_KEY=rk_live_synthetic",
      "STRIPE_LIVE_WEBHOOK_SECRET=whsec_synthetic",
      "",
    ].join("\n");
    await writeFile(envFile, initial, { mode: 0o600 });
    await chmod(envFile, 0o600);
    const authorizedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    await execFileAsync(
      "bash",
      [helper, "open", "us-web-global", authorizedAt],
      { env: { ...process.env, LOSTTOFOUND_ENV_FILE: envFile } }
    );

    const configured = await readFile(envFile, "utf8");
    expect(configured).toContain("BILLING_MODE=live");
    expect(configured).toContain("BILLING_CHECKOUT_ENABLED=true");
    expect(configured).toContain("LIVE_BILLING_APPROVED=true");
    expect(configured).toContain("BILLING_LIVE_ACTIVATION_AUTHORIZED=true");
    expect(configured).toContain("APPLE_PURCHASE_ENABLED=false");

    await execFileAsync("bash", [helper, "close"], {
      env: { ...process.env, LOSTTOFOUND_ENV_FILE: envFile },
    });
    expect(await readFile(envFile, "utf8")).toBe(initial);
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
