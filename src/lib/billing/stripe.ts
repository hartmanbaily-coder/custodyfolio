import { createHash, randomInt } from "node:crypto";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertBillingProviderMode,
  billingEnvironment,
  configuredGracePeriodDays,
  stripeApiVersion,
  stripePriceIds,
  stripeSecretKey,
  webPriceCatalog,
} from "./config";
import type {
  ProviderSubscriptionUpdate,
} from "./types";

type BillingSupabase = SupabaseClient;

export function stripeApiKeyMatchesMode(
  mode: "test" | "live",
  key: string
) {
  return mode === "test"
    ? key.startsWith("sk_test_") || key.startsWith("rk_test_")
    : key.startsWith("rk_live_");
}

export function createStripeClient() {
  const mode = assertBillingProviderMode();
  const key = stripeSecretKey();
  if (!stripeApiKeyMatchesMode(mode, key)) {
    throw new Error(
      mode === "live"
        ? "A live restricted Stripe key is required."
        : "A Stripe test secret or restricted key is required."
    );
  }
  return new Stripe(key, {
    apiVersion: stripeApiVersion,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: {
      name: "Custody Folio",
      version: process.env.npm_package_version || "0.1.0",
      url: "https://custodyfolio.com",
    },
  });
}

export function stripeCheckoutIntegrationIdentifier() {
  let suffix = "";
  for (let index = 0; index < 8; index += 1) {
    suffix += String.fromCharCode(97 + randomInt(26));
  }
  return `custody_folio_${suffix}`;
}

export function stripeObjectId(
  value: string | { id: string } | null | undefined
) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function stripeEnvironment() {
  const environment = billingEnvironment();
  if (!environment) throw new Error("Billing is disabled.");
  return environment;
}

export function stripePayloadDigest(payload: string | Buffer) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function verifyConfiguredStripePrice(
  stripe: Stripe,
  plan: "monthly" | "annual"
) {
  const configured = stripePriceIds();
  const priceId = configured[plan];
  if (!priceId) throw new Error(`Stripe ${plan} price is not configured.`);
  const price = await stripe.prices.retrieve(priceId);
  const expected = webPriceCatalog[plan];
  if (
    !price.active ||
    price.currency !== "usd" ||
    price.unit_amount !== expected.amountCents ||
    price.recurring?.interval !== expected.interval ||
    price.recurring.interval_count !== 1
  ) {
    throw new Error(`Stripe ${plan} price does not match the approved catalog.`);
  }
  return price;
}

export async function findStripeCustomerMapping(
  supabase: BillingSupabase,
  billingAccountId: string
) {
  const environment = stripeEnvironment();
  const { data, error } = await supabase
    .from("custody_folio_provider_customers")
    .select("provider_customer_id,last_verified_at")
    .eq("billing_account_id", billingAccountId)
    .eq("provider", "stripe")
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw new Error("Stripe customer mapping could not be loaded.");
  return data as
    | { provider_customer_id: string; last_verified_at: string | null }
    | null;
}

export async function findBillingAccountForStripeCustomer(
  supabase: BillingSupabase,
  customerId: string
) {
  const environment = stripeEnvironment();
  const { data, error } = await supabase
    .from("custody_folio_provider_customers")
    .select("billing_account_id")
    .eq("provider", "stripe")
    .eq("environment", environment)
    .eq("provider_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error("Stripe customer mapping could not be verified.");
  return (data as { billing_account_id: string } | null)?.billing_account_id || null;
}

export async function ensureStripeCustomer(input: {
  stripe: Stripe;
  supabase: BillingSupabase;
  billingAccountId: string;
  email: string;
}) {
  const existing = await findStripeCustomerMapping(
    input.supabase,
    input.billingAccountId
  );
  if (existing) {
    const customer = await input.stripe.customers.retrieve(
      existing.provider_customer_id
    );
    if (customer.deleted) throw new Error("Stripe customer was deleted.");
    return customer;
  }

  const environment = stripeEnvironment();
  const customer = await input.stripe.customers.create(
    {
      email: input.email,
      metadata: {
        custody_folio_billing_account: input.billingAccountId,
      },
    },
    {
      idempotencyKey: `custody-folio:${environment}:customer:${input.billingAccountId}:v1`,
    }
  );
  const { error } = await input.supabase
    .from("custody_folio_provider_customers")
    .upsert(
      {
        billing_account_id: input.billingAccountId,
        provider: "stripe",
        environment,
        provider_customer_id: customer.id,
        updated_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: "billing_account_id,provider,environment" }
    );
  if (error) {
    throw new Error("Stripe customer mapping could not be saved.");
  }
  return customer;
}

function stripeTime(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

export function mapStripeSubscription(
  subscription: Stripe.Subscription,
  options: {
    occurredAt?: Date;
    overrideStatus?: ProviderSubscriptionUpdate["status"];
    existingGracePeriodEndsAt?: string | null;
    allowNewGracePeriod?: boolean;
  } = {}
): ProviderSubscriptionUpdate {
  const item = subscription.items.data[0];
  if (!item?.price?.id || !item.price.recurring) {
    throw new Error("Stripe subscription does not contain an approved recurring price.");
  }
  const priceIds = stripePriceIds();
  const planInterval =
    item.price.id === priceIds.monthly
      ? "month"
      : item.price.id === priceIds.annual
        ? "year"
        : null;
  if (!planInterval) throw new Error("Stripe subscription price is not allowlisted.");

  const occurredAt = options.occurredAt || new Date();
  let status: ProviderSubscriptionUpdate["status"];
  let gracePeriodEndsAt: string | null = null;
  switch (subscription.status) {
    case "active":
      status = "active";
      break;
    case "past_due":
      if (options.existingGracePeriodEndsAt) {
        status = "grace_period";
        gracePeriodEndsAt = options.existingGracePeriodEndsAt;
      } else if (options.allowNewGracePeriod !== true) {
        status = "expired";
      } else {
        status = "grace_period";
        gracePeriodEndsAt = new Date(
          occurredAt.getTime() + configuredGracePeriodDays() * 24 * 60 * 60 * 1000
        ).toISOString();
      }
      break;
    case "canceled":
      status = "canceled";
      break;
    case "unpaid":
    case "incomplete_expired":
      status = "expired";
      break;
    case "paused":
      status = "paused";
      break;
    case "trialing":
    case "incomplete":
    default:
      status = "incomplete";
      break;
  }
  if (
    options.overrideStatus &&
    (options.overrideStatus !== "grace_period" ||
      status === "active" ||
      status === "grace_period")
  ) {
    status = options.overrideStatus;
  }
  if (status === "past_due" || status === "grace_period") {
    gracePeriodEndsAt ||= new Date(
      occurredAt.getTime() + configuredGracePeriodDays() * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  const periodStarts = subscription.items.data
    .map((candidate) => candidate.current_period_start)
    .filter((value): value is number => typeof value === "number");
  const periodEnds = subscription.items.data
    .map((candidate) => candidate.current_period_end)
    .filter((value): value is number => typeof value === "number");
  const currentPeriodEnd =
    periodEnds.length > 0 ? Math.max(...periodEnds) : null;
  const cancelAtPeriodEnd = Boolean(
    subscription.cancel_at_period_end ||
      (typeof subscription.cancel_at === "number" &&
        currentPeriodEnd !== null &&
        subscription.cancel_at === currentPeriodEnd)
  );
  return {
    providerSubscriptionId: subscription.id,
    providerCustomerId: stripeObjectId(subscription.customer),
    productId: item.price.id,
    planInterval,
    status,
    currentPeriodStart: stripeTime(
      periodStarts.length > 0 ? Math.min(...periodStarts) : null
    ),
    currentPeriodEnd: stripeTime(currentPeriodEnd),
    gracePeriodEndsAt,
    cancelAtPeriodEnd,
    canceledAt: stripeTime(subscription.canceled_at),
  };
}

export async function latestStripeInvoiceFullyRefunded(
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  const invoiceId = stripeObjectId(subscription.latest_invoice);
  if (!invoiceId) return false;

  const invoicePayments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    limit: 100,
  });
  let paidAmount = 0;
  let refundedAmount = 0;
  for (const invoicePayment of invoicePayments.data) {
    if (
      invoicePayment.status !== "paid" ||
      invoicePayment.payment?.type !== "payment_intent"
    ) {
      continue;
    }
    const paymentIntentId = stripeObjectId(
      invoicePayment.payment.payment_intent
    );
    if (!paymentIntentId) continue;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId = stripeObjectId(paymentIntent.latest_charge);
    if (!chargeId) continue;
    const charge = await stripe.charges.retrieve(chargeId);
    paidAmount += charge.amount;
    refundedAmount += charge.amount_refunded;
  }
  return paidAmount > 0 && refundedAmount >= paidAmount;
}

export async function applyStripeProviderEvent(input: {
  supabase: BillingSupabase;
  eventId: string;
  eventType: string;
  payloadSha256: string;
  occurredAt: Date;
  billingAccountId: string;
  subscription: ProviderSubscriptionUpdate;
}) {
  const currentResult = await input.supabase
    .from("custody_folio_provider_subscriptions")
    .select("status,grace_period_ends_at,last_provider_occurred_at")
    .eq("provider", "stripe")
    .eq("environment", stripeEnvironment())
    .eq("provider_subscription_id", input.subscription.providerSubscriptionId)
    .maybeSingle();
  if (currentResult.error) {
    throw new Error("Stripe subscription restriction state could not be verified.");
  }
  const protectedUpdate = protectStripeRestrictionOrdering({
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    receivedAt: new Date(),
    subscription: input.subscription,
    current: currentResult.data as StripeRestrictionProjection | null,
  });
  const { data, error } = await input.supabase.rpc(
    "custody_folio_apply_provider_event",
    {
      p_provider: "stripe",
      p_environment: stripeEnvironment(),
      p_provider_event_id: input.eventId,
      p_billing_account_id: input.billingAccountId,
      p_event_type: input.eventType,
      p_payload_sha256: input.payloadSha256,
      p_provider_occurred_at: protectedUpdate.occurredAt.toISOString(),
      p_subscription: protectedUpdate.subscription,
    }
  );
  if (error) throw new Error("Stripe event could not be applied transactionally.");
  return Array.isArray(data) ? data[0] : data;
}

type StripeRestrictionProjection = {
  status: ProviderSubscriptionUpdate["status"];
  grace_period_ends_at: string | null;
  last_provider_occurred_at: string | null;
};

const riskPrecedenceEvents = new Set([
  "charge.refunded",
  "refund.created",
  "refund.updated",
]);

const terminalRestrictionStatuses = new Set<ProviderSubscriptionUpdate["status"]>([
  "refunded",
  "revoked",
]);

export function protectStripeRestrictionOrdering(input: {
  eventType: string;
  occurredAt: Date;
  receivedAt: Date;
  subscription: ProviderSubscriptionUpdate;
  current: StripeRestrictionProjection | null;
}) {
  let occurredAt = input.occurredAt;
  const currentOccurredAt = Date.parse(
    input.current?.last_provider_occurred_at || ""
  );
  if (
    riskPrecedenceEvents.has(input.eventType) &&
    Number.isFinite(currentOccurredAt) &&
    currentOccurredAt >= occurredAt.getTime()
  ) {
    occurredAt = new Date(
      Math.max(input.receivedAt.getTime(), currentOccurredAt + 1)
    );
  }

  let subscription = input.subscription;
  if (
    input.current &&
    terminalRestrictionStatuses.has(input.current.status) &&
    !terminalRestrictionStatuses.has(subscription.status)
  ) {
    subscription = {
      ...subscription,
      status: input.current.status,
      gracePeriodEndsAt: null,
    };
  } else if (
    input.current?.status === "grace_period" &&
    subscription.status === "grace_period"
  ) {
    subscription = {
      ...subscription,
      gracePeriodEndsAt:
        input.current.grace_period_ends_at || subscription.gracePeriodEndsAt,
    };
  } else if (
    input.current?.status === "grace_period" &&
    subscription.status === "active" &&
    input.eventType !== "invoice.paid" &&
    input.eventType !== "charge.dispute.closed"
  ) {
    subscription = {
      ...subscription,
      status: "grace_period",
      gracePeriodEndsAt:
        input.current.grace_period_ends_at || subscription.gracePeriodEndsAt,
    };
  }

  return { occurredAt, subscription };
}

export async function recordIgnoredStripeEvent(input: {
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
      provider: "stripe",
      environment: stripeEnvironment(),
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
  if (error) throw new Error("Stripe event disposition could not be recorded.");
}
