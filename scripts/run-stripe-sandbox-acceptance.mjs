#!/usr/bin/env node

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const timeoutMs = 90_000;
const pollMs = 2_000;
const apiVersion = "2026-07-29.dahlia";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertSafeEnvironment() {
  if (process.env.BILLING_MODE?.trim().toLowerCase() !== "test") {
    throw new Error("Refusing to run unless BILLING_MODE=test.");
  }
  if (process.env.BILLING_CHECKOUT_ENABLED?.trim().toLowerCase() !== "false") {
    throw new Error("Refusing to run unless BILLING_CHECKOUT_ENABLED=false.");
  }
  const key = required("STRIPE_TEST_SECRET_KEY");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_TEST_SECRET_KEY is not a Stripe test-mode key.");
  }
  return key;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(label, load, accept) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await load();
    if (await accept(lastValue)) return lastValue;
    await sleep(pollMs);
  }
  throw new Error(`${label} did not complete within ${timeoutMs / 1000} seconds.`);
}

async function waitForRecordedEventType(supabase, billingAccountId, eventType, startedAt) {
  return waitFor(
    `Custody Folio ${eventType}`,
    async () => {
      const result = await supabase
        .from("custody_folio_provider_events")
        .select("provider_event_id,event_type,processing_status,processing_code,billing_account_id,received_at")
        .eq("provider", "stripe")
        .eq("environment", "test")
        .eq("billing_account_id", billingAccountId)
        .eq("event_type", eventType)
        .gte("received_at", startedAt)
        .order("received_at", { ascending: false })
        .limit(1);
      if (result.error) throw new Error(result.error.message);
      return result.data?.[0] || null;
    },
    (row) => row?.processing_status === "processed",
  );
}

async function chargeForSubscription(stripe, subscriptionId) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const invoiceValue = subscription.latest_invoice;
  const invoiceId = typeof invoiceValue === "string" ? invoiceValue : invoiceValue?.id;
  if (!invoiceId) return null;
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  const paymentIntentValue = payments.data.find(
    (payment) => payment.payment?.type === "payment_intent",
  )?.payment?.payment_intent;
  const paymentIntentId =
    typeof paymentIntentValue === "string" ? paymentIntentValue : paymentIntentValue?.id;
  if (!paymentIntentId) return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeValue = paymentIntent.latest_charge;
  const chargeId = typeof chargeValue === "string" ? chargeValue : chargeValue?.id;
  return chargeId ? stripe.charges.retrieve(chargeId) : null;
}

async function subscriptionRow(supabase, subscriptionId) {
  const result = await supabase
    .from("custody_folio_provider_subscriptions")
    .select("provider_subscription_id,status,grace_period_ends_at,last_provider_event_id")
    .eq("provider", "stripe")
    .eq("environment", "test")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function cancelIfNeeded(stripe, subscriptionId) {
  if (!subscriptionId) return;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscriptionId);
    }
  } catch (error) {
    if (error?.code !== "resource_missing") throw error;
  }
}

async function detachIfNeeded(stripe, paymentMethodId) {
  if (!paymentMethodId) return;
  try {
    await stripe.paymentMethods.detach(paymentMethodId);
  } catch (error) {
    if (error?.code !== "resource_missing") throw error;
  }
}

const stripeKey = assertSafeEnvironment();
const billingAccountId = required("STRIPE_ACCEPTANCE_BILLING_ACCOUNT_ID");
const customerId = required("STRIPE_ACCEPTANCE_CUSTOMER_ID");
const monthlyPriceId = required("STRIPE_TEST_MONTHLY_PRICE_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

const stripe = new Stripe(stripeKey, {
  apiVersion,
  maxNetworkRetries: 2,
  timeout: 20_000,
});
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const mapping = await supabase
  .from("custody_folio_provider_customers")
  .select("provider_customer_id")
  .eq("billing_account_id", billingAccountId)
  .eq("provider", "stripe")
  .eq("environment", "test")
  .maybeSingle();
if (mapping.error || mapping.data?.provider_customer_id !== customerId) {
  throw new Error("The supplied Stripe customer is not the verified test mapping for this account.");
}
const customer = await stripe.customers.retrieve(customerId);
if (customer.deleted || customer.livemode) {
  throw new Error("The supplied Stripe customer is unavailable or not a test customer.");
}

const runId = `stripe_acceptance_${Date.now()}`;
const evidence = {
  schemaVersion: 1,
  runId,
  startedAt: new Date().toISOString(),
  environment: "test",
  checkoutEnabled: false,
  paymentFailure: null,
  dispute: null,
  cleanup: null,
};
let failureSubscriptionId;
let disputeSubscriptionId;
let declinedPaymentMethodId;
let disputedPaymentMethodId;

try {
  const failureStartedAt = new Date(Date.now() - 2_000).toISOString();
  const declinedPaymentMethod = await stripe.paymentMethods.attach(
    "pm_card_chargeCustomerFail",
    { customer: customerId },
  );
  declinedPaymentMethodId = declinedPaymentMethod.id;
  const failureSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: monthlyPriceId }],
    default_payment_method: declinedPaymentMethod.id,
    payment_behavior: "allow_incomplete",
    metadata: {
      custody_folio_billing_account: billingAccountId,
      custody_folio_acceptance_run: runId,
      custody_folio_acceptance_scenario: "payment_failure",
    },
  });
  failureSubscriptionId = failureSubscription.id;
  const recordedFailure = await waitForRecordedEventType(
    supabase,
    billingAccountId,
    "invoice.payment_failed",
    failureStartedAt,
  );
  const failedRow = await waitFor(
    "failed subscription projection",
    () => subscriptionRow(supabase, failureSubscription.id),
    (row) => row?.status === "grace_period",
  );
  evidence.paymentFailure = {
    subscriptionId: failureSubscription.id,
    stripeEventId: recordedFailure.provider_event_id,
    eventType: recordedFailure.event_type,
    processingStatus: recordedFailure.processing_status,
    projectedStatus: failedRow.status,
  };

  await cancelIfNeeded(stripe, failureSubscription.id);

  const disputeStartedAt = new Date(Date.now() - 2_000).toISOString();
  const disputedPaymentMethod = await stripe.paymentMethods.attach(
    "pm_card_createDispute",
    { customer: customerId },
  );
  disputedPaymentMethodId = disputedPaymentMethod.id;
  const disputeSubscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: monthlyPriceId }],
    default_payment_method: disputedPaymentMethod.id,
    payment_behavior: "error_if_incomplete",
    metadata: {
      custody_folio_billing_account: billingAccountId,
      custody_folio_acceptance_run: runId,
      custody_folio_acceptance_scenario: "dispute",
    },
  });
  disputeSubscriptionId = disputeSubscription.id;

  const recordedDisputeCreated = await waitForRecordedEventType(
    supabase,
    billingAccountId,
    "charge.dispute.created",
    disputeStartedAt,
  );
  const graceRow = await waitFor(
    "disputed subscription grace projection",
    () => subscriptionRow(supabase, disputeSubscription.id),
    (row) => row?.status === "grace_period",
  );

  const disputedCharge = await waitFor(
    "disputed Stripe charge",
    () => chargeForSubscription(stripe, disputeSubscription.id),
    (charge) => charge?.disputed === true,
  );
  const disputes = await stripe.disputes.list({ charge: disputedCharge.id, limit: 10 });
  const disputeObject = disputes.data[0];
  if (!disputeObject) throw new Error("Stripe did not return the created test dispute.");
  const closedDispute = await stripe.disputes.update(disputeObject.id, {
    evidence: { uncategorized_text: "losing_evidence" },
    submit: true,
  });
  const recordedDisputeClosed = await waitForRecordedEventType(
    supabase,
    billingAccountId,
    "charge.dispute.closed",
    disputeStartedAt,
  );
  const revokedRow = await waitFor(
    "lost dispute revocation projection",
    () => subscriptionRow(supabase, disputeSubscription.id),
    (row) => row?.status === "revoked",
  );
  evidence.dispute = {
    subscriptionId: disputeSubscription.id,
    disputeId: disputeObject.id,
    createdEventId: recordedDisputeCreated.provider_event_id,
    createdProcessingStatus: recordedDisputeCreated.processing_status,
    graceStatus: graceRow.status,
    closedEventId: recordedDisputeClosed.provider_event_id,
    closedProcessingStatus: recordedDisputeClosed.processing_status,
    finalDisputeStatus: closedDispute.status,
    projectedStatus: revokedRow.status,
  };
} finally {
  const cleanupErrors = [];
  for (const subscriptionId of [failureSubscriptionId, disputeSubscriptionId]) {
    try {
      await cancelIfNeeded(stripe, subscriptionId);
    } catch (error) {
      cleanupErrors.push(`subscription ${subscriptionId}: ${error.message}`);
    }
  }
  for (const paymentMethodId of [declinedPaymentMethodId, disputedPaymentMethodId]) {
    try {
      await detachIfNeeded(stripe, paymentMethodId);
    } catch (error) {
      cleanupErrors.push(`payment method ${paymentMethodId}: ${error.message}`);
    }
  }
  await sleep(5_000);
  const entitlement = await supabase.rpc("custody_folio_refresh_entitlement", {
    p_billing_account_id: billingAccountId,
    p_environment: "test",
    p_now: new Date().toISOString(),
  });
  if (entitlement.error) cleanupErrors.push(`entitlement refresh: ${entitlement.error.message}`);
  const entitlementRow = Array.isArray(entitlement.data)
    ? entitlement.data[0]
    : entitlement.data;
  evidence.cleanup = {
    completedAt: new Date().toISOString(),
    entitlementMode: entitlementRow?.mode || null,
    entitlementSource: entitlementRow?.source || null,
    errors: cleanupErrors,
  };
  if (cleanupErrors.length > 0) {
    console.error(JSON.stringify(evidence, null, 2));
    throw new Error(`Sandbox acceptance cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}

if (evidence.cleanup.entitlementMode !== "export_only") {
  throw new Error(
    `Sandbox acceptance did not return the account to export_only (got ${evidence.cleanup.entitlementMode}).`,
  );
}

console.log(JSON.stringify(evidence, null, 2));
