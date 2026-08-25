import {
  evaluateProductionReadiness,
  type ProductionReadinessReport,
} from "@/lib/production/readiness";

export type BillingReadinessSeverity = "blocker" | "warning";

export interface BillingReadinessCheck {
  id: string;
  label: string;
  ready: boolean;
  severity: BillingReadinessSeverity;
  detail: string;
}

export interface BillingReadinessReport {
  ready: boolean;
  generatedAt: string;
  checks: BillingReadinessCheck[];
  blockers: BillingReadinessCheck[];
  warnings: BillingReadinessCheck[];
}

type EnvSource = Record<string, string | undefined>;

const placeholders = [
  "replace_with",
  "placeholder",
  "changeme",
  "yyyy-mm-dd",
  "example.invalid",
];

function hasValue(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(
    normalized && !placeholders.some((candidate) => normalized.includes(candidate))
  );
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function strongSecret(value: string | undefined) {
  return hasValue(value) && String(value).length >= 32;
}

function recentDate(value: string | undefined, nowIso: string, maxAgeDays = 30) {
  const valueTime = Date.parse(value || "");
  const now = Date.parse(nowIso);
  return (
    Number.isFinite(valueTime) &&
    Number.isFinite(now) &&
    valueTime <= now &&
    now - valueTime <= maxAgeDays * 24 * 60 * 60 * 1000
  );
}

function exactNotificationUrl(value: string | undefined) {
  try {
    const url = new URL(value || "");
    return (
      url.protocol === "https:" &&
      url.pathname === "/api/records/billing/apple/notifications" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function check(
  id: string,
  label: string,
  ready: boolean,
  severity: BillingReadinessSeverity,
  detail: string
): BillingReadinessCheck {
  return { id, label, ready, severity, detail };
}

export function evaluateLiveBillingReadiness(
  env: EnvSource = process.env,
  generatedAt = new Date().toISOString(),
  productionReport: ProductionReadinessReport = evaluateProductionReadiness(
    env,
    generatedAt
  )
): BillingReadinessReport {
  const applePurchasesEnabled = enabled(env.APPLE_PURCHASE_ENABLED);
  const taxMode = String(env.STRIPE_TAX_MODE || "").trim().toLowerCase();
  const policyApprovalBasis = String(
    env.BILLING_POLICY_APPROVAL_BASIS || ""
  ).trim().toLowerCase();
  const appleProducts = [
    env.APPLE_MONTHLY_PRODUCT_ID,
    env.APPLE_ANNUAL_PRODUCT_ID,
  ];
  const policyVersions = [
    env.BILLING_TERMS_VERSION,
    env.BILLING_PRIVACY_VERSION,
    env.BILLING_SUBPROCESSOR_VERSION,
    env.BILLING_DISCLOSURE_VERSION,
  ];
  const checks = [
    check(
      "billing-mode-live",
      "Billing mode is explicitly live",
      env.BILLING_MODE === "live" &&
        (!applePurchasesEnabled || env.APPLE_BILLING_ENVIRONMENT === "production"),
      "blocker",
      "Set Stripe live mode only during an approved activation window. Apple production mode is required only when new App Store purchases are enabled."
    ),
    check(
      "billing-checkout-enabled",
      "New subscription checkout is explicitly enabled",
      enabled(env.BILLING_CHECKOUT_ENABLED),
      "blocker",
      "Keep checkout disabled until the activation window; pausing it later must not stop provider servicing."
    ),
    check(
      "production-readiness",
      "Existing production readiness has no blockers",
      productionReport.ready,
      "blocker",
      "Resolve every existing production-readiness blocker before live billing can create or activate an entitlement."
    ),
    check(
      "stripe-live-key",
      "Stripe live restricted key is present",
      String(env.STRIPE_LIVE_RESTRICTED_KEY || "").startsWith("rk_live_") &&
        hasValue(env.STRIPE_LIVE_RESTRICTED_KEY),
      "blocker",
      "Configure a least-privilege Stripe live restricted key in the secret manager."
    ),
    check(
      "stripe-live-webhook",
      "Stripe live webhook signing secret is present",
      String(env.STRIPE_LIVE_WEBHOOK_SECRET || "").startsWith("whsec_") &&
        hasValue(env.STRIPE_LIVE_WEBHOOK_SECRET),
      "blocker",
      "Configure the signing secret for the dedicated live billing webhook endpoint."
    ),
    check(
      "stripe-price-allowlist",
      "Stripe live monthly and annual Prices are allowlisted",
      [env.STRIPE_LIVE_MONTHLY_PRICE_ID, env.STRIPE_LIVE_ANNUAL_PRICE_ID].every(
        (value) => hasValue(value) && String(value).startsWith("price_")
      ) && env.STRIPE_LIVE_MONTHLY_PRICE_ID !== env.STRIPE_LIVE_ANNUAL_PRICE_ID,
      "blocker",
      "Verify separate live monthly and annual Price IDs against the approved amount, currency, and interval catalog."
    ),
    check(
      "stripe-live-portal-configuration",
      "Stripe live Customer Portal configuration is allowlisted",
      hasValue(env.STRIPE_LIVE_PORTAL_CONFIGURATION_ID) &&
        String(env.STRIPE_LIVE_PORTAL_CONFIGURATION_ID).startsWith("bpc_"),
      "blocker",
      "Configure the verified, dedicated Custody Folio live Customer Portal configuration ID."
    ),
    check(
      "stripe-portal-verified",
      "Stripe Customer Portal configuration was verified recently",
      recentDate(env.STRIPE_CUSTOMER_PORTAL_VERIFIED_AT, generatedAt),
      "blocker",
      "Verify payment updates, invoices, and cancellation in the live Customer Portal and record the date."
    ),
    check(
      "billing-secrets",
      "Billing return-state and deletion secrets are strong and separate",
      strongSecret(env.BILLING_RETURN_STATE_SECRET) &&
        strongSecret(env.BILLING_DELETION_HASH_SECRET) &&
        env.BILLING_RETURN_STATE_SECRET !== env.BILLING_DELETION_HASH_SECRET &&
        env.BILLING_RETURN_STATE_SECRET !== env.AUTH_SECRET &&
        env.BILLING_DELETION_HASH_SECRET !== env.AUTH_SECRET,
      "blocker",
      "Configure separate random server-only secrets of at least 32 characters for return state and deletion pseudonyms."
    ),
    check(
      "apple-identity",
      "Apple bundle and Custody Folio product identifiers are explicit",
      !applePurchasesEnabled ||
        (hasValue(env.APPLE_BUNDLE_ID) &&
        appleProducts.every(
          (value) => hasValue(value) && String(value).startsWith("io.custodyfolio.subscription.")
        ) &&
        appleProducts[0] !== appleProducts[1]),
      "blocker",
      "Verify the existing App Store bundle identity and the two products in one Custody Folio subscription group."
    ),
    check(
      "apple-notifications-v2",
      "App Store Server Notifications V2 endpoint is verified",
      !applePurchasesEnabled ||
        (exactNotificationUrl(env.APPLE_NOTIFICATIONS_V2_URL) &&
          recentDate(env.APPLE_NOTIFICATIONS_V2_VERIFIED_AT, generatedAt)),
      "blocker",
      "Configure the exact HTTPS V2 notification endpoint and record a recent verified test-notification date."
    ),
    check(
      "apple-server-api",
      "App Store Server API credentials and trust roots are present",
      !applePurchasesEnabled ||
        (hasValue(env.APPLE_APP_ID) &&
        /^\d+$/.test(env.APPLE_APP_ID || "") &&
        hasValue(env.APPLE_APP_STORE_SERVER_KEY_ID) &&
        hasValue(env.APPLE_APP_STORE_SERVER_ISSUER_ID) &&
        hasValue(env.APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64) &&
        hasValue(env.APPLE_ROOT_CA_CERTIFICATES_BASE64)),
      "blocker",
      "Configure the server-only Apple API key, issuer, App ID, and pinned Apple root certificates."
    ),
    check(
      "billing-tests-recent",
      "Billing provider and reconciliation tests are recent",
      recentDate(env.BILLING_PROVIDER_TESTED_AT, generatedAt) &&
        recentDate(env.BILLING_RECONCILIATION_TESTED_AT, generatedAt) &&
        recentDate(env.BILLING_MIGRATION_VERIFIED_AT, generatedAt),
      "blocker",
      "Run Stripe test-mode, reconciliation, and migration verification within 30 days. Apple sandbox/StoreKit is required only when new App Store purchases are enabled."
    ),
    check(
      "billing-policy-versions",
      "Billing policy and disclosure versions are adopted",
      policyVersions.every(
        (value) => hasValue(value) && !String(value).toLowerCase().includes("draft")
      ) &&
        enabled(env.BILLING_POLICY_APPROVED) &&
        ["operator_self_review", "qualified_counsel"].includes(policyApprovalBasis) &&
        recentDate(env.BILLING_POLICY_VERSIONS_VERIFIED_AT, generatedAt),
      "blocker",
      "Record the exact operative Terms, Privacy, subprocessor, and subscription-disclosure versions and whether adoption was operator self-review or qualified-counsel review. Operator self-review is not a compliance claim."
    ),
    check(
      "billing-tax-review",
      "Tax decision and Stripe configuration were reviewed",
      enabled(env.BILLING_TAX_REVIEW_APPROVED) &&
        recentDate(env.BILLING_TAX_REVIEWED_AT, generatedAt, 365) &&
        (taxMode === "not_collecting" ||
          (taxMode === "automatic" &&
            recentDate(env.STRIPE_TAX_REGISTRATIONS_VERIFIED_AT, generatedAt) &&
            recentDate(
              env.STRIPE_TAX_PRODUCT_CONFIGURATION_VERIFIED_AT,
              generatedAt
            ))),
      "blocker",
      "Choose automatic only after active registrations and the Stripe product tax configuration are verified. Choose not_collecting only after the operator documents why the launch footprint does not require collection; consider tax advice."
    ),
    check(
      "live-billing-approval",
      "Live billing activation has two explicit approvals",
      enabled(env.LIVE_BILLING_APPROVED) &&
        enabled(env.BILLING_LIVE_ACTIVATION_AUTHORIZED),
      "blocker",
      "Both the operational live-billing approval and the user-authorized activation flag must be true."
    ),
    check(
      "apple-small-business-program",
      "Apple Small Business Program status is recorded",
      !applePurchasesEnabled || ["enrolled", "not_enrolled", "not_eligible"].includes(
        env.APPLE_SMALL_BUSINESS_PROGRAM_STATUS || ""
      ),
      "warning",
      "Record current Small Business Program status for fee forecasting; this does not change customer entitlement."
    ),
  ];
  const blockers = checks.filter(
    (item) => !item.ready && item.severity === "blocker"
  );
  const warnings = checks.filter(
    (item) => !item.ready && item.severity === "warning"
  );
  return {
    ready: blockers.length === 0,
    generatedAt,
    checks,
    blockers,
    warnings,
  };
}

export function assertLiveBillingReady(
  env: EnvSource = process.env,
  generatedAt = new Date().toISOString()
) {
  const report = evaluateLiveBillingReadiness(env, generatedAt);
  if (!report.ready) {
    throw new Error(
      `Live billing readiness failed: ${report.blockers
        .map((item) => item.id)
        .join(", ")}`
    );
  }
  return report;
}
