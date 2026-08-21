import { NextRequest, NextResponse } from "next/server";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import { isNativeIosUserAgent } from "@/lib/billing/config";
import { createBillingReturnState } from "@/lib/billing/returnState";
import { findBillingAccountByUser } from "@/lib/billing/repository";
import {
  createStripeClient,
  findStripeCustomerMapping,
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

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  if (!isSupabaseRecordsMode()) {
    return NextResponse.json({ error: "Cloud billing is not enabled." }, { status: 501 });
  }
  if (isNativeIosUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json(
      { error: "Manage App Store billing from the native subscription screen." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const rateLimit = checkRateLimit(request, {
    id: "billing-stripe-portal",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "billing:manage");
  if (!capability.ok) return capability.error;

  try {
    // This also applies the complete live-readiness gate before any provider
    // session can be created. Test mode remains available for local QA.
    const stripe = createStripeClient();
    const account = await findBillingAccountByUser(
      context.supabase,
      context.userId
    );
    if (!account) {
      return NextResponse.json(
        { error: "No web subscription is available to manage." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    const mapping = await findStripeCustomerMapping(context.supabase, account.id);
    if (!mapping) {
      return NextResponse.json(
        { error: "No web subscription is available to manage." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    const returnState = createBillingReturnState("portal");
    const configuration =
      process.env[
        process.env.BILLING_MODE === "live"
          ? "STRIPE_LIVE_PORTAL_CONFIGURATION_ID"
          : "STRIPE_TEST_PORTAL_CONFIGURATION_ID"
      ];
    const session = await stripe.billingPortal.sessions.create({
      customer: mapping.provider_customer_id,
      ...(configuration ? { configuration } : {}),
      return_url: `${recordsAppBaseUrl(request)}/records?billing_return=${encodeURIComponent(returnState)}`,
    });
    return NextResponse.json(
      { url: session.url },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Web subscription management is temporarily unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
