import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { billingMode, stripeWebhookSecret } from "@/lib/billing/config";
import {
  applyStripeProviderEvent,
  createStripeClient,
  findBillingAccountForStripeCustomer,
  mapStripeSubscription,
  recordIgnoredStripeEvent,
  stripeObjectId,
  stripePayloadDigest,
} from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  readTextBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/lib/security/requestBody";
import {
  growthAnalyticsEnabled,
  recordGrowthEvent,
  subscriptionGrowthEventNames,
} from "@/lib/marketing/growthEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const relevantEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return stripeObjectId(invoice.parent?.subscription_details?.subscription);
}

async function subscriptionFromEvent(
  stripe: Stripe,
  event: Stripe.Event
): Promise<{
  subscription: Stripe.Subscription | null;
  overrideStatus?: ReturnType<typeof mapStripeSubscription>["status"];
  providerEventObjectId?: string | null;
}> {
  if (event.type.startsWith("customer.subscription.")) {
    const eventSubscription = event.data.object as Stripe.Subscription;
    try {
      return { subscription: await stripe.subscriptions.retrieve(eventSubscription.id) };
    } catch {
      return { subscription: eventSubscription };
    }
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = stripeObjectId(session.subscription);
    return {
      subscription: subscriptionId
        ? await stripe.subscriptions.retrieve(subscriptionId)
        : null,
    };
  }
  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    return {
      subscription: subscriptionId
        ? await stripe.subscriptions.retrieve(subscriptionId)
        : null,
      overrideStatus:
        event.type === "invoice.payment_failed" ||
        event.type === "invoice.payment_action_required"
          ? "grace_period"
          : undefined,
    };
  }

  let chargeId: string | null = null;
  let fullRefund = false;
  let providerEventObjectId: string | null = null;
  let overrideStatus: ReturnType<typeof mapStripeSubscription>["status"] | undefined;
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    chargeId = charge.id;
    fullRefund = charge.refunded || charge.amount_refunded >= charge.amount;
    if (fullRefund) overrideStatus = "refunded";
  } else if (event.type.startsWith("refund.")) {
    const refund = event.data.object as Stripe.Refund;
    chargeId = stripeObjectId(refund.charge);
  } else if (event.type.startsWith("charge.dispute.")) {
    const dispute = event.data.object as Stripe.Dispute;
    providerEventObjectId = dispute.id;
    chargeId = stripeObjectId(dispute.charge);
    overrideStatus =
      event.type === "charge.dispute.created"
        ? "grace_period"
        : dispute.status === "lost"
          ? "revoked"
          : undefined;
  }
  if (!chargeId) {
    return { subscription: null, overrideStatus, providerEventObjectId };
  }
  const charge = await stripe.charges.retrieve(chargeId);
  if (event.type.startsWith("refund.")) {
    fullRefund = charge.refunded || charge.amount_refunded >= charge.amount;
    if (fullRefund) overrideStatus = "refunded";
  }
  const paymentIntentId = stripeObjectId(charge.payment_intent);
  if (!paymentIntentId) {
    return { subscription: null, overrideStatus, providerEventObjectId };
  }
  const invoicePayments = await stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 1,
  });
  const invoiceId = stripeObjectId(invoicePayments.data[0]?.invoice);
  if (!invoiceId) {
    return { subscription: null, overrideStatus, providerEventObjectId };
  }
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = invoiceSubscriptionId(invoice);
  return {
    subscription: subscriptionId
      ? await stripe.subscriptions.retrieve(subscriptionId)
      : null,
    overrideStatus,
    providerEventObjectId,
  };
}

export async function POST(request: NextRequest) {
  if (billingMode() === "disabled") {
    return NextResponse.json({ error: "Billing webhook is disabled." }, { status: 503 });
  }
  let payload: string;
  try {
    payload = await readTextBodyWithLimit(request, 512 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
    }
    throw error;
  }
  const signature = request.headers.get("stripe-signature");
  const secret = stripeWebhookSecret();
  if (!signature || !secret) {
    return NextResponse.json({ error: "Webhook signature is unavailable." }, { status: 400 });
  }

  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = createStripeClient();
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Webhook signature is invalid." }, { status: 400 });
  }
  if (event.livemode !== (billingMode() === "live")) {
    return NextResponse.json({ error: "Webhook environment does not match." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const digest = stripePayloadDigest(payload);
  const occurredAt = new Date(event.created * 1000);
  try {
    const duplicate = await supabase
      .from("custody_folio_provider_events")
      .select("id")
      .eq("provider", "stripe")
      .eq("environment", billingMode())
      .eq("provider_event_id", event.id)
      .maybeSingle();
    if (duplicate.error) throw new Error("Webhook deduplication lookup failed.");
    if (duplicate.data) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!relevantEvents.has(event.type)) {
      await recordIgnoredStripeEvent({
        supabase,
        eventId: event.id,
        eventType: event.type,
        payloadSha256: digest,
        occurredAt,
        processingCode: "event_not_entitlement_relevant",
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    const resolved = await subscriptionFromEvent(stripe, event);
    if (!resolved.subscription) {
      await recordIgnoredStripeEvent({
        supabase,
        eventId: event.id,
        eventType: event.type,
        payloadSha256: digest,
        occurredAt,
        processingCode: "subscription_not_resolved",
      });
      return NextResponse.json({ received: true, ignored: true });
    }
    const customerId = stripeObjectId(resolved.subscription.customer);
    const billingAccountId = customerId
      ? await findBillingAccountForStripeCustomer(supabase, customerId)
      : null;
    if (!billingAccountId) {
      await recordIgnoredStripeEvent({
        supabase,
        eventId: event.id,
        eventType: event.type,
        payloadSha256: digest,
        occurredAt,
        processingCode: "customer_mapping_not_found",
        status: "failed",
      });
      return NextResponse.json({ error: "Customer mapping was not verified." }, { status: 409 });
    }
    const metadataAccount =
      resolved.subscription.metadata.custody_folio_billing_account;
    if (metadataAccount && metadataAccount !== billingAccountId) {
      await recordIgnoredStripeEvent({
        supabase,
        eventId: event.id,
        eventType: event.type,
        payloadSha256: digest,
        occurredAt,
        billingAccountId,
        processingCode: "subscription_metadata_mismatch",
        status: "failed",
      });
      return NextResponse.json({ error: "Subscription mapping was not verified." }, { status: 409 });
    }
    const subscription = {
      ...mapStripeSubscription(resolved.subscription, {
        occurredAt,
        overrideStatus: resolved.overrideStatus,
        allowNewGracePeriod: true,
      }),
      providerEventObjectId: resolved.providerEventObjectId,
    };
    await applyStripeProviderEvent({
      supabase,
      eventId: event.id,
      eventType: event.type,
      payloadSha256: digest,
      occurredAt,
      billingAccountId,
      subscription,
    });
    if (growthAnalyticsEnabled()) {
      try {
        const account = await supabase
          .from("custody_folio_billing_accounts")
          .select("user_id")
          .eq("id", billingAccountId)
          .maybeSingle();
        if (!account.error && account.data?.user_id) {
          for (const growthEventName of subscriptionGrowthEventNames({
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            providerEventType: event.type,
          })) {
            await recordGrowthEvent({
              supabase,
              eventName: growthEventName,
              userId: account.data.user_id,
              platform: "web",
              planInterval: subscription.planInterval,
              occurredAt,
              dedupeSeed: `stripe:${event.id}`,
            });
          }
        }
      } catch {
        // Growth measurement never changes verified provider processing.
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      { error: "Webhook processing failed and may be retried." },
      { status: 500, headers: { "Retry-After": "60" } }
    );
  }
}
