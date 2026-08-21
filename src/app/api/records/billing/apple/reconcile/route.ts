import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  applyAppleProviderEvent,
  appleBillingEnvironment,
  createAppleServerApiClient,
  createAppleSignedDataVerifier,
  mapAppleSubscription,
} from "@/lib/billing/apple";
import { requireRecordsCapability } from "@/lib/billing/capabilities";
import { findBillingAccountByUser, getBillingStatus } from "@/lib/billing/repository";
import { getRecordsAuthContext } from "@/lib/records/authServer";
import { recordsCsrfError, verifyRecordsCsrf } from "@/lib/security/csrf";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyRecordsCsrf(request).ok) return recordsCsrfError();
  const rateLimit = checkRateLimit(request, {
    id: "billing-apple-reconcile",
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit.limited) return rateLimitExceededResponse(rateLimit);
  const context = await getRecordsAuthContext(request);
  if ("error" in context) return context.error;
  const capability = await requireRecordsCapability(context, "billing:manage", {
    nativeIos: true,
  });
  if (!capability.ok) return capability.error;

  let runId: number | null = null;
  try {
    const account = await findBillingAccountByUser(context.supabase, context.userId);
    if (!account) {
      return NextResponse.json({ error: "Billing account was not found." }, { status: 404 });
    }
    const stored = await context.supabase
      .from("custody_folio_provider_subscriptions")
      .select("original_transaction_id")
      .eq("billing_account_id", account.id)
      .eq("provider", "apple")
      .eq("environment", appleBillingEnvironment())
      .not("original_transaction_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (stored.error) throw new Error("Stored App Store subscription could not be loaded.");
    if (!stored.data?.original_transaction_id) {
      return NextResponse.json(
        { error: "No App Store subscription is available to refresh. Restore purchases in the iOS app first." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    const run = await context.supabase
      .from("custody_folio_reconciliation_runs")
      .insert({
        provider: "apple",
        environment: appleBillingEnvironment(),
        billing_account_id: account.id,
        status: "started",
      })
      .select("id")
      .single();
    if (run.error || !run.data) throw new Error("Reconciliation run could not be recorded.");
    runId = run.data.id;

    const client = createAppleServerApiClient();
    const verifier = createAppleSignedDataVerifier();
    const response = await client.getAllSubscriptionStatuses(
      stored.data.original_transaction_id
    );
    let applied = 0;
    for (const group of response.data || []) {
      for (const item of group.lastTransactions || []) {
        if (!item.signedTransactionInfo) continue;
        const transaction = await verifier.verifyAndDecodeTransaction(
          item.signedTransactionInfo
        );
        if (
          !transaction.appAccountToken ||
          transaction.appAccountToken.toLowerCase() !==
            account.apple_app_account_token.toLowerCase()
        ) {
          throw new Error("Reconciled App Store transaction belongs to another account.");
        }
        const renewal = item.signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
          : null;
        const subscription = mapAppleSubscription({
          transaction,
          renewal,
          status: item.status,
          occurredAt: new Date(),
          notificationType: "RECONCILIATION",
        });
        const state = JSON.stringify({
          originalTransactionId: subscription.originalTransactionId,
          transactionId: transaction.transactionId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        });
        const digest = createHash("sha256").update(state).digest("hex");
        await applyAppleProviderEvent({
          supabase: context.supabase,
          eventId: `reconcile:${transaction.transactionId || subscription.providerSubscriptionId}:${digest.slice(0, 32)}`,
          eventType: "reconciliation.subscription",
          payloadSha256: digest,
          occurredAt: new Date(),
          billingAccountId: account.id,
          subscription,
        });
        applied += 1;
      }
    }
    await context.supabase
      .from("custody_folio_reconciliation_runs")
      .update({
        status: "succeeded",
        result_code: applied > 0 ? "provider_state_applied" : "no_status_rows",
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    const status = await getBillingStatus({
      supabase: context.supabase,
      userId: context.userId,
      nativeIos: true,
    });
    return NextResponse.json(
      { ok: true, billing: status },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
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
      {
        error:
          error instanceof Error
            ? error.message
            : "App Store subscription status could not be refreshed.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
