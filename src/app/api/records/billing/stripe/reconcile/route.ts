import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import { findBillingAccountByUser, getBillingStatus } from "@/lib/billing/repository";
import {
  applyStripeProviderEvent,
  createStripeClient,
  findStripeCustomerMapping,
  latestStripeInvoiceFullyRefunded,
  mapStripeSubscription,
  stripeEnvironment,
} from "@/lib/billing/stripe";
import { getRecordsAuthContext } from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const rateLimit = checkRateLimit(request, {
    id: "billing-stripe-reconcile",
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "billing:manage");
  if (!capability.ok) return capability.error;

  const startedAt = new Date().toISOString();
  let runId: number | null = null;
  try {
    const account = await findBillingAccountByUser(context.supabase, context.userId);
    if (!account) {
      return NextResponse.json({ error: "Billing account was not found." }, { status: 404 });
    }
    const run = await context.supabase
      .from("custody_folio_reconciliation_runs")
      .insert({
        provider: "stripe",
        environment: stripeEnvironment(),
        billing_account_id: account.id,
        status: "started",
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (run.error || !run.data) throw new Error("Reconciliation run could not be recorded.");
    runId = run.data.id;

    const mapping = await findStripeCustomerMapping(context.supabase, account.id);
    if (mapping) {
      const storedSubscriptions = await context.supabase
        .from("custody_folio_provider_subscriptions")
        .select("provider_subscription_id,grace_period_ends_at")
        .eq("billing_account_id", account.id)
        .eq("provider", "stripe")
        .eq("environment", stripeEnvironment());
      if (storedSubscriptions.error) {
        throw new Error("Stored Stripe subscription state could not be loaded.");
      }
      const graceBySubscriptionId = new Map(
        (storedSubscriptions.data || []).map((subscription) => [
          subscription.provider_subscription_id,
          subscription.grace_period_ends_at as string | null,
        ])
      );
      const stripe = createStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: mapping.provider_customer_id,
        status: "all",
        limit: 100,
      });
      for (const subscription of subscriptions.data) {
        const latestInvoiceRefunded =
          await latestStripeInvoiceFullyRefunded(stripe, subscription);
        const mapped = mapStripeSubscription(subscription, {
          existingGracePeriodEndsAt:
            graceBySubscriptionId.get(subscription.id) || null,
          allowNewGracePeriod: false,
          overrideStatus: latestInvoiceRefunded ? "refunded" : undefined,
        });
        const state = JSON.stringify({
          id: subscription.id,
          status: subscription.status,
          productId: mapped.productId,
          currentPeriodEnd: mapped.currentPeriodEnd,
          canceledAt: mapped.canceledAt,
          latestInvoiceRefunded,
        });
        const digest = createHash("sha256").update(state).digest("hex");
        await applyStripeProviderEvent({
          supabase: context.supabase,
          eventId: `reconcile:${subscription.id}:${digest.slice(0, 40)}`,
          eventType: "reconciliation.subscription",
          payloadSha256: digest,
          occurredAt: new Date(),
          billingAccountId: account.id,
          subscription: mapped,
        });
      }
    }
    await context.supabase
      .from("custody_folio_reconciliation_runs")
      .update({
        status: "succeeded",
        result_code: mapping ? "provider_state_applied" : "no_stripe_customer",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
    });
    return NextResponse.json(
      { ok: true, billing: status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    if (runId !== null) {
      await context.supabase
        .from("custody_folio_reconciliation_runs")
        .update({
          status: "failed",
          result_code: "provider_reconciliation_failed",
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return NextResponse.json(
      { error: "Stripe subscription status could not be refreshed." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
