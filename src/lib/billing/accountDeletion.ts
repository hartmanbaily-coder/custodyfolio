import { createHmac } from "node:crypto";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { billingMode } from "./config";
import {
  createStripeClient,
  findStripeCustomerMapping,
} from "./stripe";

type BillingSupabase = SupabaseClient;

const stripeStatusesThatDoNotNeedCancellation = new Set<
  Stripe.Subscription.Status
>(["canceled", "incomplete_expired"]);

export function stripeSubscriptionNeedsCancellation(
  status: Stripe.Subscription.Status
) {
  return !stripeStatusesThatDoNotNeedCancellation.has(status);
}

function deletionHashSecret(
  env: Record<string, string | undefined> = process.env
) {
  const secret = env.BILLING_DELETION_HASH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("Billing deletion hashing is not safely configured.");
  }
  return secret;
}

export function deletedBillingUserHash(
  userId: string,
  env: Record<string, string | undefined> = process.env
) {
  return createHmac("sha256", deletionHashSecret(env))
    .update(`custody-folio-deleted-user:v1:${userId}`)
    .digest("hex");
}

async function findBillingAccount(
  supabase: BillingSupabase,
  userId: string
) {
  const { data, error } = await supabase
    .from("custody_folio_billing_accounts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Billing account lookup failed during deletion.");
  return (data as { id: string } | null)?.id || null;
}

async function recordDeletionAudit(input: {
  supabase: BillingSupabase;
  billingAccountId: string;
  eventType: string;
  result: "success" | "failed";
  reasonCode: string;
}) {
  const { error } = await input.supabase
    .from("custody_folio_billing_audit_events")
    .insert({
      billing_account_id: input.billingAccountId,
      event_type: input.eventType,
      actor_type: "account",
      result: input.result,
      reason_code: input.reasonCode,
    });
  if (error) throw new Error("Billing deletion audit could not be recorded.");
}

export interface BillingDeletionPreparation {
  billingAccountId: string | null;
  canceledStripeSubscriptions: number;
  appleBillingMayContinue: boolean;
}

export async function prepareBillingForAccountDeletion(input: {
  supabase: BillingSupabase;
  userId: string;
}): Promise<BillingDeletionPreparation> {
  if (billingMode() === "disabled") {
    return {
      billingAccountId: null,
      canceledStripeSubscriptions: 0,
      appleBillingMayContinue: false,
    };
  }

  const billingAccountId = await findBillingAccount(
    input.supabase,
    input.userId
  );
  if (!billingAccountId) {
    return {
      billingAccountId: null,
      canceledStripeSubscriptions: 0,
      appleBillingMayContinue: false,
    };
  }

  const { data: appleRows, error: appleError } = await input.supabase
    .from("custody_folio_provider_subscriptions")
    .select("id")
    .eq("billing_account_id", billingAccountId)
    .eq("provider", "apple")
    .in("status", ["active", "past_due", "grace_period", "billing_retry"])
    .limit(1);
  if (appleError) {
    throw new Error("App Store billing state could not be checked during deletion.");
  }
  const appleBillingMayContinue = Boolean(appleRows?.length);

  const mapping = await findStripeCustomerMapping(
    input.supabase,
    billingAccountId
  );
  let canceledStripeSubscriptions = 0;
  if (mapping) {
    const stripe = createStripeClient();
    const subscriptions = await stripe.subscriptions.list({
      customer: mapping.provider_customer_id,
      status: "all",
      limit: 100,
    });
    if (subscriptions.has_more) {
      await recordDeletionAudit({
        supabase: input.supabase,
        billingAccountId,
        eventType: "account_deletion_stripe_cancellation",
        result: "failed",
        reasonCode: "provider_subscription_limit_exceeded",
      });
      throw new Error(
        "Stripe subscription cancellation requires support review before deletion."
      );
    }
    const subscriptionsToCancel = subscriptions.data.filter((subscription) =>
      stripeSubscriptionNeedsCancellation(subscription.status)
    );
    try {
      for (const subscription of subscriptionsToCancel) {
        await stripe.subscriptions.cancel(subscription.id, {
          prorate: false,
          invoice_now: false,
        });
        canceledStripeSubscriptions += 1;
      }
    } catch (error) {
      await recordDeletionAudit({
        supabase: input.supabase,
        billingAccountId,
        eventType: "account_deletion_stripe_cancellation",
        result: "failed",
        reasonCode: "provider_cancellation_failed",
      });
      throw error;
    }
  }

  await recordDeletionAudit({
    supabase: input.supabase,
    billingAccountId,
    eventType: "account_deletion_billing_prepared",
    result: "success",
    reasonCode: appleBillingMayContinue
      ? "apple_management_required"
      : canceledStripeSubscriptions > 0
        ? "stripe_canceled"
        : "no_active_provider_billing",
  });

  return {
    billingAccountId,
    canceledStripeSubscriptions,
    appleBillingMayContinue,
  };
}

export async function redactBillingIdentityForAccountDeletion(input: {
  supabase: BillingSupabase;
  userId: string;
}) {
  if (billingMode() === "disabled") return;
  const { data, error } = await input.supabase.rpc(
    "custody_folio_redact_billing_account",
    {
      p_user_id: input.userId,
      p_deleted_user_hash: deletedBillingUserHash(input.userId),
      p_now: new Date().toISOString(),
    }
  );
  if (error || data !== true) {
    throw new Error("Billing identity could not be minimized during deletion.");
  }
}
