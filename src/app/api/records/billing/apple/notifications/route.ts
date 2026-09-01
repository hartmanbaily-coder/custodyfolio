import { NextRequest, NextResponse } from "next/server";
import {
  applyAppleProviderEvent,
  applePayloadDigest,
  createAppleSignedDataVerifier,
  mapAppleSubscription,
  recordIgnoredAppleEvent,
} from "@/lib/billing/apple";
import {
  appleReviewSandboxUserId,
  billingMode,
} from "@/lib/billing/config";
import { findBillingAccountByAppleToken } from "@/lib/billing/repository";
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

class InvalidAppleNotificationError extends Error {}

export async function POST(request: NextRequest) {
  if (billingMode() === "disabled") {
    return NextResponse.json({ error: "App Store notifications are disabled." }, { status: 503 });
  }
  let rawBody: string;
  try {
    rawBody = await readTextBodyWithLimit(request, 512 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Notification payload is too large." }, { status: 413 });
    }
    throw error;
  }
  let signedPayload = "";
  try {
    const body = JSON.parse(rawBody) as { signedPayload?: unknown };
    signedPayload = typeof body.signedPayload === "string" ? body.signedPayload : "";
  } catch {
    return NextResponse.json({ error: "Notification body is invalid." }, { status: 400 });
  }
  if (signedPayload.length < 100 || signedPayload.length > 500 * 1024) {
    return NextResponse.json({ error: "Signed notification is invalid." }, { status: 400 });
  }

  let verifier = createAppleSignedDataVerifier();
  let reviewSandboxUserId: string | null = null;
  let notification;
  try {
    notification = await verifier.verifyAndDecodeNotification(signedPayload);
  } catch {
    reviewSandboxUserId = appleReviewSandboxUserId();
    if (reviewSandboxUserId) {
      try {
        verifier = createAppleSignedDataVerifier(process.env, {
          userId: reviewSandboxUserId,
        });
        notification = await verifier.verifyAndDecodeNotification(signedPayload);
      } catch {
        reviewSandboxUserId = null;
      }
    }
    if (!notification) {
      return NextResponse.json(
        { error: "App Store notification signature is invalid." },
        { status: 400 }
      );
    }
  }

  try {
    const notificationId = notification.notificationUUID;
    if (!notificationId) {
      return NextResponse.json({ error: "Verified notification has no identifier." }, { status: 400 });
    }
    const eventId = reviewSandboxUserId
      ? `review-sandbox:${notificationId}`
      : notificationId;
    const eventType = [notification.notificationType || "UNKNOWN", notification.subtype]
      .filter(Boolean)
      .join(".")
      .slice(0, 180);
    const occurredAt = new Date(notification.signedDate || Date.now());
    const digest = applePayloadDigest(signedPayload);
    const supabase = createSupabaseAdminClient();
    const duplicate = await supabase
      .from("custody_folio_provider_events")
      .select("id")
      .eq("provider", "apple")
      .eq("environment", billingMode())
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (duplicate.error) throw new Error("Notification deduplication lookup failed.");
    if (duplicate.data) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) {
      await recordIgnoredAppleEvent({
        supabase,
        eventId,
        eventType,
        payloadSha256: digest,
        occurredAt,
        processingCode:
          notification.notificationType === "TEST"
            ? "verified_test_notification"
            : "notification_without_transaction",
      });
      return NextResponse.json({ received: true, ignored: true });
    }
    let transaction;
    let renewal;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
      renewal = notification.data?.signedRenewalInfo
        ? await verifier.verifyAndDecodeRenewalInfo(
            notification.data.signedRenewalInfo
          )
        : null;
    } catch {
      throw new InvalidAppleNotificationError(
        "Verified notification contained invalid nested signed data."
      );
    }
    if (!transaction.appAccountToken) {
      return NextResponse.json(
        { error: "Verified transaction has no account binding." },
        { status: 500, headers: { "Retry-After": "60" } }
      );
    }
    const account = await findBillingAccountByAppleToken(
      supabase,
      transaction.appAccountToken
    );
    if (!account) {
      return NextResponse.json(
        { error: "Apple account binding is not available yet." },
        { status: 500, headers: { "Retry-After": "60" } }
      );
    }
    if (!account.user_id) {
      await recordIgnoredAppleEvent({
        supabase,
        eventId,
        eventType,
        payloadSha256: digest,
        occurredAt,
        billingAccountId: account.id,
        processingCode: "deleted_account_provider_record",
      });
      return NextResponse.json({ received: true, ignored: true });
    }
    if (reviewSandboxUserId && account.user_id !== reviewSandboxUserId) {
      return NextResponse.json(
        { error: "Sandbox App Review transaction belongs to an unauthorized account." },
        { status: 403 }
      );
    }
    const subscription = mapAppleSubscription({
      transaction,
      renewal,
      status: notification.data?.status,
      occurredAt,
      notificationType: notification.notificationType || null,
    });
    await applyAppleProviderEvent({
      supabase,
      eventId,
      eventType,
      payloadSha256: digest,
      occurredAt,
      billingAccountId: account.id,
      subscription,
    });
    if (growthAnalyticsEnabled()) {
      try {
        for (const growthEventName of subscriptionGrowthEventNames({
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          providerEventType: eventType,
        })) {
          await recordGrowthEvent({
            supabase,
            eventName: growthEventName,
            userId: account.user_id,
            platform: "ios",
            planInterval: subscription.planInterval,
            occurredAt,
            dedupeSeed: `apple:notification:${eventId}`,
          });
        }
      } catch {
        // Growth measurement never changes verified provider processing.
      }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof InvalidAppleNotificationError) {
      return NextResponse.json(
        { error: "App Store notification signed data is invalid." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "App Store notification processing failed and may be retried." },
      { status: 500, headers: { "Retry-After": "60" } }
    );
  }
}
