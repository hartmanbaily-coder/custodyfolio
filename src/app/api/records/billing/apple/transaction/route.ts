import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyAppleProviderEvent,
  applePayloadDigest,
  createAppleSignedDataVerifier,
  mapAppleSubscription,
} from "@/lib/billing/apple";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import {
  appleReviewSandboxEnabledForUser,
  isNativeIosUserAgent,
} from "@/lib/billing/config";
import { subscriptionPurchaseEligible } from "@/lib/billing/policy";
import { ensureBillingAccount, getBillingStatus } from "@/lib/billing/repository";
import { getRecordsAuthContext } from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";
import {
  recordGrowthEvent,
  subscriptionGrowthEventNames,
} from "@/lib/marketing/growthEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const transactionSchema = z.object({
  signedTransactionInfo: z.string().min(100).max(128 * 1024),
});

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  if (!isNativeIosUserAgent(request.headers.get("user-agent"))) {
    return NextResponse.json(
      { error: "App Store transactions are accepted only from the Custody Folio iOS app." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
  const rateLimit = checkRateLimit(request, {
    id: "billing-apple-transaction",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "billing:manage", {
    nativeIos: true,
  });
  if (!capability.ok) return capability.error;
  if (
    !subscriptionPurchaseEligible(capability.status.entitlement.mode) &&
    capability.status.entitlement.source !== "apple"
  ) {
    return NextResponse.json(
      {
        error:
          "Full access is already provided without App Store billing. Manage that access instead of starting a second subscription.",
        code: "existing_full_access",
        source: capability.status.entitlement.source,
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const parsed = transactionSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The App Store transaction response was incomplete." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const account = await ensureBillingAccount(context.supabase, context.userId);
    const reviewSandbox = appleReviewSandboxEnabledForUser(context.userId);
    const verifier = createAppleSignedDataVerifier(process.env, {
      userId: context.userId,
    });
    const transaction = await verifier.verifyAndDecodeTransaction(
      parsed.data.signedTransactionInfo
    );
    if (
      !transaction.appAccountToken ||
      transaction.appAccountToken.toLowerCase() !==
        account.appleAppAccountToken.toLowerCase()
    ) {
      return NextResponse.json(
        { error: "This App Store purchase belongs to a different Custody Folio account." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!transaction.transactionId) {
      return NextResponse.json(
        { error: "The verified App Store transaction has no transaction identifier." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }
    const occurredAt = new Date(transaction.signedDate || Date.now());
    const subscription = mapAppleSubscription({
      transaction,
      occurredAt,
    });
    await applyAppleProviderEvent({
      supabase: context.supabase,
      eventId: `${reviewSandbox ? "review-sandbox:" : ""}transaction:${transaction.transactionId}`,
      eventType: "device.transaction",
      payloadSha256: applePayloadDigest(parsed.data.signedTransactionInfo),
      occurredAt,
      billingAccountId: account.id,
      subscription,
    });
    try {
      for (const growthEventName of subscriptionGrowthEventNames({
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        providerEventType: "device.transaction",
      })) {
        await recordGrowthEvent({
          supabase: context.supabase,
          eventName: growthEventName,
          request,
          userId: context.userId,
          platform: "ios",
          planInterval: subscription.planInterval,
          occurredAt,
          dedupeSeed: `apple:transaction:${transaction.transactionId}`,
        });
      }
    } catch {
      // Growth measurement never changes verified provider processing.
    }
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
      nativeIos: true,
    });
    return NextResponse.json(
      { ok: true, billing: status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "The App Store transaction could not be verified." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
