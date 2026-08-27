import { createHash } from "node:crypto";
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appleBundleId,
  appleProductIds,
  appleReviewSandboxEnabledForUser,
  assertBillingProviderMode,
  billingMode,
  configuredGracePeriodDays,
} from "./config";
import type {
  BillingEnvironment,
  ProviderSubscriptionUpdate,
} from "./types";

type BillingSupabase = SupabaseClient;

type AppleServerContext = {
  userId?: string;
  now?: Date;
};

function requiredValue(
  name: string,
  env: Record<string, string | undefined> = process.env
) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for App Store verification.`);
  return value;
}

export function appleServerEnvironment(
  env: Record<string, string | undefined> = process.env,
  context: AppleServerContext = {}
) {
  const mode = assertBillingProviderMode(env);
  if (
    context.userId &&
    appleReviewSandboxEnabledForUser(
      context.userId,
      env,
      context.now || new Date()
    )
  ) {
    return Environment.SANDBOX;
  }
  if (mode === "live") return Environment.PRODUCTION;
  const configured = (env.APPLE_BILLING_ENVIRONMENT || "sandbox").toLowerCase();
  if (configured === "xcode") return Environment.XCODE;
  if (configured === "local_testing") return Environment.LOCAL_TESTING;
  return Environment.SANDBOX;
}

export function appleBillingEnvironment(): BillingEnvironment {
  const mode = billingMode();
  if (mode === "disabled") throw new Error("Billing is disabled.");
  return mode;
}

export function appleRootCertificates(
  env: Record<string, string | undefined> = process.env
) {
  const encoded = requiredValue("APPLE_ROOT_CA_CERTIFICATES_BASE64", env);
  let values: string[];
  try {
    const parsed = JSON.parse(encoded) as unknown;
    values = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [encoded];
  } catch {
    values = encoded.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const certificates = values.map((value) => Buffer.from(value, "base64"));
  if (certificates.length === 0 || certificates.some((value) => value.length < 100)) {
    throw new Error("Apple root certificate configuration is invalid.");
  }
  return certificates;
}

export function createAppleSignedDataVerifier(
  env: Record<string, string | undefined> = process.env,
  context: AppleServerContext = {}
) {
  const environment = appleServerEnvironment(env, context);
  const appAppleId =
    environment === Environment.PRODUCTION
      ? Number(requiredValue("APPLE_APP_ID", env))
      : undefined;
  if (environment === Environment.PRODUCTION && !Number.isSafeInteger(appAppleId)) {
    throw new Error("APPLE_APP_ID must be a valid integer.");
  }
  return new SignedDataVerifier(
    appleRootCertificates(env),
    true,
    environment,
    appleBundleId(env),
    appAppleId
  );
}

export function createAppleServerApiClient(
  env: Record<string, string | undefined> = process.env,
  context: AppleServerContext = {}
) {
  const environment = appleServerEnvironment(env, context);
  if (
    environment === Environment.XCODE ||
    environment === Environment.LOCAL_TESTING
  ) {
    throw new Error("App Store Server API reconciliation is unavailable for local StoreKit configuration.");
  }
  const signingKey = Buffer.from(
    requiredValue("APPLE_APP_STORE_SERVER_PRIVATE_KEY_BASE64", env),
    "base64"
  ).toString("utf8");
  if (!signingKey.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Apple App Store Server API private key is invalid.");
  }
  return new AppStoreServerAPIClient(
    signingKey,
    requiredValue("APPLE_APP_STORE_SERVER_KEY_ID", env),
    requiredValue("APPLE_APP_STORE_SERVER_ISSUER_ID", env),
    appleBundleId(env),
    environment
  );
}

function appleDate(value: number | undefined) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

export function applePlanInterval(productId: string) {
  const products = appleProductIds();
  if (productId === products.monthly) return "month" as const;
  if (productId === products.annual) return "year" as const;
  return null;
}

export function mapAppleSubscription(input: {
  transaction: JWSTransactionDecodedPayload;
  renewal?: JWSRenewalInfoDecodedPayload | null;
  status?: Status | number;
  occurredAt?: Date;
  notificationType?: string | null;
}): ProviderSubscriptionUpdate {
  const { transaction, renewal } = input;
  const originalTransactionId = transaction.originalTransactionId;
  const transactionId = transaction.transactionId;
  const productId = transaction.productId;
  const planInterval = productId ? applePlanInterval(productId) : null;
  if (!originalTransactionId || !transactionId || !productId || !planInterval) {
    throw new Error("Apple subscription transaction is incomplete or not allowlisted.");
  }
  const occurredAt = input.occurredAt || new Date();
  const expiresAt = transaction.expiresDate || 0;
  let status: ProviderSubscriptionUpdate["status"];
  let gracePeriodEndsAt = appleDate(renewal?.gracePeriodExpiresDate);
  if (
    input.notificationType === "REFUND" ||
    transaction.revocationDate ||
    transaction.revocationReason !== undefined
  ) {
    status = input.notificationType === "REVOKE" ? "revoked" : "refunded";
  } else {
    switch (input.status) {
      case Status.ACTIVE:
        status = expiresAt > occurredAt.getTime() ? "active" : "expired";
        break;
      case Status.BILLING_GRACE_PERIOD:
        status = "grace_period";
        gracePeriodEndsAt ||=
          new Date(
            occurredAt.getTime() +
              configuredGracePeriodDays() * 24 * 60 * 60 * 1000
          ).toISOString();
        break;
      case Status.BILLING_RETRY:
        status = "billing_retry";
        break;
      case Status.REVOKED:
        status = "revoked";
        break;
      case Status.EXPIRED:
        status = "expired";
        break;
      default:
        status = expiresAt > occurredAt.getTime() ? "active" : "expired";
        break;
    }
  }
  if (input.notificationType === "REFUND_REVERSED") {
    status = expiresAt > occurredAt.getTime() ? "active" : "expired";
  }
  if (input.notificationType === "GRACE_PERIOD_EXPIRED") status = "expired";

  return {
    providerSubscriptionId: originalTransactionId,
    originalTransactionId,
    productId,
    planInterval,
    status,
    currentPeriodStart: appleDate(transaction.purchaseDate),
    currentPeriodEnd: appleDate(transaction.expiresDate),
    gracePeriodEndsAt,
    cancelAtPeriodEnd: renewal?.autoRenewStatus === 0,
    revokedAt: appleDate(transaction.revocationDate),
  };
}

export function applePayloadDigest(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function applyAppleProviderEvent(input: {
  supabase: BillingSupabase;
  eventId: string;
  eventType: string;
  payloadSha256: string;
  occurredAt: Date;
  billingAccountId: string;
  subscription: ProviderSubscriptionUpdate;
}) {
  const { data, error } = await input.supabase.rpc(
    "custody_folio_apply_provider_event",
    {
      p_provider: "apple",
      p_environment: appleBillingEnvironment(),
      p_provider_event_id: input.eventId,
      p_billing_account_id: input.billingAccountId,
      p_event_type: input.eventType,
      p_payload_sha256: input.payloadSha256,
      p_provider_occurred_at: input.occurredAt.toISOString(),
      p_subscription: input.subscription,
    }
  );
  if (error) throw new Error("Apple event could not be applied transactionally.");
  return Array.isArray(data) ? data[0] : data;
}

export async function recordIgnoredAppleEvent(input: {
  supabase: BillingSupabase;
  eventId: string;
  eventType: string;
  payloadSha256: string;
  occurredAt: Date;
  billingAccountId?: string | null;
  processingCode: string;
  status?: "ignored" | "failed";
}) {
  const { error } = await input.supabase.from("custody_folio_provider_events").upsert(
    {
      provider: "apple",
      environment: appleBillingEnvironment(),
      provider_event_id: input.eventId,
      billing_account_id: input.billingAccountId || null,
      event_type: input.eventType,
      payload_sha256: input.payloadSha256,
      provider_occurred_at: input.occurredAt.toISOString(),
      processing_status: input.status || "ignored",
      processing_code: input.processingCode,
      processed_at: new Date().toISOString(),
    },
    { onConflict: "provider,environment,provider_event_id", ignoreDuplicates: true }
  );
  if (error) throw new Error("Apple event disposition could not be recorded.");
}
