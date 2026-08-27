import type { BillingEnvironment, BillingMode } from "./types";
import { assertLiveBillingReady } from "./readiness";
import { billingFeatureMayRun } from "@/lib/legalRelease";

export const stripeApiVersion = "2026-07-29.dahlia" as const;

export const webPriceCatalog = {
  monthly: {
    amountCents: 599,
    interval: "month" as const,
    display: "$5.99/month" as const,
  },
  annual: {
    amountCents: 5999,
    interval: "year" as const,
    display: "$59.99/year" as const,
  },
};

export function billingMode(
  env: Record<string, string | undefined> = process.env
): BillingMode {
  const value = (env.BILLING_MODE || "disabled").trim().toLowerCase();
  if (value === "test" || value === "live") return value;
  return "disabled";
}

export function billingEnvironment(
  env: Record<string, string | undefined> = process.env
): BillingEnvironment | null {
  const mode = billingMode(env);
  return mode === "disabled" ? null : mode;
}

export function billingIsEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return billingMode(env) !== "disabled";
}

export function billingCheckoutEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return billingFeatureMayRun(env) &&
    billingMode(env) !== "disabled" &&
    env.BILLING_CHECKOUT_ENABLED?.trim().toLowerCase() === "true";
}

export function applePurchaseEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return env.APPLE_PURCHASE_ENABLED?.trim().toLowerCase() === "true";
}

function appleTestFlightCanaryEnabled(
  userId: string,
  env: Record<string, string | undefined>,
  now: Date
) {
  if (
    !billingFeatureMayRun(env) ||
    billingMode(env) !== "test" ||
    env.APPLE_TESTFLIGHT_CANARY_AUTHORIZED?.trim().toLowerCase() !== "true"
  ) {
    return false;
  }
  const configuredUserId = String(
    env.APPLE_TESTFLIGHT_CANARY_USER_ID || ""
  ).trim();
  if (
    configuredUserId !== userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      configuredUserId
    )
  ) {
    return false;
  }
  const expiresAt = Date.parse(env.APPLE_TESTFLIGHT_CANARY_EXPIRES_AT || "");
  const remaining = expiresAt - now.getTime();
  return Number.isFinite(expiresAt) && remaining > 0 && remaining <= 2 * 60 * 60 * 1000;
}

export function appleReviewSandboxUserId(
  env: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  if (
    !billingFeatureMayRun(env) ||
    billingMode(env) !== "live" ||
    env.APPLE_REVIEW_SANDBOX_ENABLED?.trim().toLowerCase() !== "true"
  ) {
    return null;
  }
  const userId = String(env.APPLE_REVIEW_SANDBOX_USER_ID || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId
    )
  ) {
    return null;
  }
  const expiresAt = Date.parse(env.APPLE_REVIEW_SANDBOX_EXPIRES_AT || "");
  const remaining = expiresAt - now.getTime();
  return Number.isFinite(expiresAt) &&
    remaining > 0 &&
    remaining <= 45 * 24 * 60 * 60 * 1000
    ? userId
    : null;
}

export function appleReviewSandboxEnabledForUser(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  return appleReviewSandboxUserId(env, now) === userId;
}

export type StripeTaxMode = "disabled" | "automatic" | "not_collecting";

export function stripeTaxMode(
  env: Record<string, string | undefined> = process.env
): StripeTaxMode {
  const value = env.STRIPE_TAX_MODE?.trim().toLowerCase();
  return value === "automatic" || value === "not_collecting"
    ? value
    : "disabled";
}

export function stripeAutomaticTaxEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return stripeTaxMode(env) === "automatic";
}

function liveCanaryCheckoutEnabled(
  userId: string,
  env: Record<string, string | undefined>,
  now: Date
) {
  if (
    !billingFeatureMayRun(env) ||
    billingMode(env) !== "live" ||
    billingCheckoutEnabled(env) ||
    env.BILLING_LIVE_CANARY_AUTHORIZED?.trim().toLowerCase() !== "true"
  ) {
    return false;
  }
  const configuredUserId = String(env.BILLING_LIVE_CANARY_USER_ID || "").trim();
  if (
    configuredUserId !== userId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      configuredUserId
    )
  ) {
    return false;
  }
  const expiresAt = Date.parse(env.BILLING_LIVE_CANARY_EXPIRES_AT || "");
  const remaining = expiresAt - now.getTime();
  return Number.isFinite(expiresAt) && remaining > 0 && remaining <= 24 * 60 * 60 * 1000;
}

export function billingCheckoutEnabledForUser(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  return billingCheckoutEnabled(env) || liveCanaryCheckoutEnabled(userId, env, now);
}

export function billingPurchaseEnabledForUser(
  userId: string,
  options: { nativeIos?: boolean } = {},
  env: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  if (options.nativeIos === true) {
    return (
      billingFeatureMayRun(env) &&
      billingMode(env) !== "disabled" &&
      (applePurchaseEnabled(env) ||
        appleTestFlightCanaryEnabled(userId, env, now) ||
        appleReviewSandboxEnabledForUser(userId, env, now))
    );
  }
  return billingCheckoutEnabledForUser(userId, env, now);
}

export function isNativeIosUserAgent(userAgent: string | null | undefined) {
  return /(?:^|\s|\()CustodyFolio-iOS\/\d+(?:\.\d+)*/i.test(userAgent || "");
}

export function stripeSecretKey(
  env: Record<string, string | undefined> = process.env
) {
  const mode = billingMode(env);
  if (mode === "test") return env.STRIPE_TEST_SECRET_KEY || "";
  if (mode === "live") return env.STRIPE_LIVE_RESTRICTED_KEY || "";
  return "";
}

export function stripeWebhookSecret(
  env: Record<string, string | undefined> = process.env
) {
  const mode = billingMode(env);
  if (mode === "test") return env.STRIPE_TEST_WEBHOOK_SECRET || "";
  if (mode === "live") return env.STRIPE_LIVE_WEBHOOK_SECRET || "";
  return "";
}

export function stripePriceIds(
  env: Record<string, string | undefined> = process.env
) {
  const prefix = billingMode(env) === "live" ? "STRIPE_LIVE" : "STRIPE_TEST";
  return {
    monthly: env[`${prefix}_MONTHLY_PRICE_ID`] || "",
    annual: env[`${prefix}_ANNUAL_PRICE_ID`] || "",
  };
}

export function appleProductIds(
  env: Record<string, string | undefined> = process.env
) {
  return {
    monthly:
      env.APPLE_MONTHLY_PRODUCT_ID ||
      "io.custodyfolio.subscription.monthly",
    annual:
      env.APPLE_ANNUAL_PRODUCT_ID ||
      "io.custodyfolio.subscription.annual",
  };
}

export function appleBundleId(
  env: Record<string, string | undefined> = process.env
) {
  // Compatibility exception: this is the existing App Store identity. Changing
  // it would create a different app and break installed builds.
  return env.APPLE_BUNDLE_ID || "io.lendori.losttofound";
}

export function configuredGracePeriodDays(
  env: Record<string, string | undefined> = process.env
) {
  const parsed = Number(env.BILLING_GRACE_PERIOD_DAYS || 7);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 7;
}

export function configuredStaleToleranceHours(
  env: Record<string, string | undefined> = process.env
) {
  const parsed = Number(env.BILLING_STALE_TOLERANCE_HOURS || 72);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 168 ? parsed : 72;
}

export function assertBillingProviderMode(
  env: Record<string, string | undefined> = process.env
) {
  const mode = billingMode(env);
  if (mode === "disabled") {
    throw new Error("Billing is disabled for this deployment.");
  }
  return mode;
}

export function assertBillingCheckoutMode(
  env: Record<string, string | undefined> = process.env
) {
  const mode = assertBillingProviderMode(env);
  if (!billingCheckoutEnabled(env)) {
    throw new Error("New subscription checkout is disabled for this deployment.");
  }
  if (mode === "live") {
    assertLiveBillingReady(env);
  }
  return mode;
}

export function assertBillingCheckoutModeForUser(
  userId: string,
  env: Record<string, string | undefined> = process.env,
  now = new Date()
) {
  if (liveCanaryCheckoutEnabled(userId, env, now)) {
    const mode = assertBillingProviderMode(env);
    if (mode === "live") {
      // The bounded canary is the checkout authorization for this one user.
      // Evaluate every other live-readiness control as though the global flag
      // were open; the global flag itself intentionally remains false.
      assertLiveBillingReady({ ...env, BILLING_CHECKOUT_ENABLED: "true" });
    }
    return mode;
  }
  return assertBillingCheckoutMode(env);
}
