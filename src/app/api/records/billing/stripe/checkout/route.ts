import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import {
  assertBillingCheckoutModeForUser,
  isNativeIosUserAgent,
  stripeAutomaticTaxEnabled,
} from "@/lib/billing/config";
import { createBillingReturnState } from "@/lib/billing/returnState";
import {
  ensureBillingAccount,
  getBillingStatus,
} from "@/lib/billing/repository";
import {
  createStripeClient,
  ensureStripeCustomer,
  stripeCheckoutIntegrationIdentifier,
  stripeEnvironment,
  verifyConfiguredStripePrice,
} from "@/lib/billing/stripe";
import {
  getRecordsAuthContext,
  isSupabaseRecordsMode,
  recordsAppBaseUrl,
} from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["monthly", "annual"]),
  requestId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Cloud billing is not enabled." }, { status: 501 });
  }
  if (isNativeIosUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json(
      {
        error: "New subscription purchases are not available in this iOS release.",
        code: "native_purchase_unavailable",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateLimit = checkRateLimit(request, {
    id: "billing-stripe-checkout",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "billing:manage");
  if (!capability.ok) return capability.error;

  const parsed = checkoutSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose monthly or annual billing and try again." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    assertBillingCheckoutModeForUser(context.userId);
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
    });
    if (status.entitlement.mode === "trial") {
      return NextResponse.json(
        {
          error: "Your no-card trial is still active. Billing choices open after the trial ends.",
          code: "trial_still_active",
          trialEndsAt: status.trial.endsAt,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (status.entitlement.mode !== "export_only") {
      const managedBy =
        status.entitlement.source === "apple"
          ? "App Store"
          : "web billing";
      return NextResponse.json(
        {
          error: `Full access is already provided by ${managedBy}. Manage that access instead of starting a second subscription.`,
          code: "existing_full_access",
          source: status.entitlement.source,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const account = await ensureBillingAccount(
      context.supabase,
      context.userId
    );
    const stripe = createStripeClient();
    const [customer, price] = await Promise.all([
      ensureStripeCustomer({
        stripe,
        supabase: context.supabase,
        billingAccountId: account.id,
        email: context.email,
      }),
      verifyConfiguredStripePrice(stripe, parsed.data.plan),
    ]);
    const baseUrl = recordsAppBaseUrl(request);
    const successState = createBillingReturnState("success");
    const cancelState = createBillingReturnState("cancel");
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customer.id,
        client_reference_id: account.id,
        line_items: [{ price: price.id, quantity: 1 }],
        integration_identifier: stripeCheckoutIntegrationIdentifier(),
        automatic_tax: { enabled: stripeAutomaticTaxEnabled() },
        metadata: {
          custody_folio_billing_account: account.id,
          custody_folio_plan: parsed.data.plan,
        },
        subscription_data: {
          metadata: {
            custody_folio_billing_account: account.id,
            custody_folio_plan: parsed.data.plan,
          },
        },
        success_url: `${baseUrl}/records?billing_return=${encodeURIComponent(successState)}`,
        cancel_url: `${baseUrl}/records?billing_return=${encodeURIComponent(cancelState)}`,
      },
      {
        idempotencyKey: `custody-folio:${stripeEnvironment()}:checkout:${account.id}:${parsed.data.plan}:${parsed.data.requestId}`,
      }
    );
    if (!checkout.url) throw new Error("Stripe did not return a hosted checkout URL.");
    return NextResponse.json(
      { url: checkout.url },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe Checkout is temporarily unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
