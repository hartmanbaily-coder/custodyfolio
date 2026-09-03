import type { SupabaseClient } from "@supabase/supabase-js";
import {
  growthAnalyticsEnabled,
  growthCohortIdentifierForUser,
} from "@/lib/marketing/growthEvents";
import {
  appleProductIds,
  billingPurchaseEnabledForUser,
  billingEnvironment,
  billingMode,
  configuredStaleToleranceHours,
} from "./config";
import { capabilitiesForEntitlementMode } from "./policy";
import type {
  BillingAccountIdentity,
  BillingStatus,
  EffectiveEntitlement,
  EntitlementMode,
  ProviderSubscriptionSummary,
} from "./types";
import { entitlementModes } from "./types";

type BillingSupabase = SupabaseClient;

type EnsureAccountRow = {
  billing_account_id: string;
  apple_app_account_token: string;
  trial_started_at: string;
  trial_ends_at: string;
};

type EntitlementRow = {
  mode: EntitlementMode;
  source: "trial" | "stripe" | "apple" | "none";
  effective_until: string | null;
  grace_period_ends_at: string | null;
  computed_at: string;
  last_verified_at: string | null;
};

const entitlementSources = ["trial", "stripe", "apple", "none"] as const;

function validateEntitlementRow(row: EntitlementRow): EntitlementRow {
  if (
    !entitlementModes.includes(row.mode) ||
    !entitlementSources.includes(row.source)
  ) {
    throw new Error("Billing entitlement contains an unsupported access source.");
  }
  return row;
}

function disabledBillingStatus(nativeIos: boolean): BillingStatus {
  const now = new Date().toISOString();
  const entitlement: EffectiveEntitlement = {
    mode: "active",
    source: "disabled",
    effectiveUntil: null,
    gracePeriodEndsAt: null,
    computedAt: now,
    lastVerifiedAt: now,
    stale: false,
  };
  return {
    billingMode: "disabled",
    environment: null,
    checkoutEnabled: false,
    entitlement,
    capabilities: capabilitiesForEntitlementMode(entitlement.mode),
    appleAppAccountToken: null,
    subscription: null,
    trial: { startedAt: null, endsAt: null, daysRemaining: 0 },
    pricing: pricingStatus(),
    nativeIos,
  };
}

function pricingStatus(): BillingStatus["pricing"] {
  const products = appleProductIds();
  return {
    web: {
      monthly: "$5.99/month",
      annual: "$59.99/year",
      annualEffectiveMonthly: "$5.00/month",
      annualSavingsPercent: 16.5,
    },
    ios: {
      monthlyProductId: products.monthly,
      annualProductId: products.annual,
      localizedByStoreKit: true,
    },
  };
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) || null;
  return data && typeof data === "object" ? (data as T) : null;
}

export async function ensureBillingAccount(
  supabase: BillingSupabase,
  userId: string,
  now = new Date()
): Promise<BillingAccountIdentity> {
  const { data, error } = await supabase.rpc("custody_folio_ensure_billing_account", {
    p_user_id: userId,
    p_now: now.toISOString(),
  });
  const row = firstRow<EnsureAccountRow>(data);
  if (error || !row?.billing_account_id || !row.apple_app_account_token) {
    throw new Error("Billing account could not be initialized.");
  }
  return {
    id: row.billing_account_id,
    appleAppAccountToken: row.apple_app_account_token,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
  };
}

export async function captureBillingGrowthCohort(input: {
  supabase: BillingSupabase;
  billingAccountId: string;
  userId: string;
  now?: Date;
  env?: Record<string, string | undefined>;
}) {
  const env = input.env || process.env;
  if (!growthAnalyticsEnabled(env)) {
    return { captured: false as const, reason: "disabled" as const };
  }

  const cohortIdentifier = growthCohortIdentifierForUser(input.userId, env);
  if (!cohortIdentifier) {
    return { captured: false as const, reason: "missing_cohort" as const };
  }

  try {
    const { data, error } = await input.supabase.rpc(
      "custody_folio_capture_billing_growth_cohort",
      {
        p_billing_account_id: input.billingAccountId,
        p_user_id: input.userId,
        p_growth_cohort_identifier: cohortIdentifier,
        p_now: (input.now || new Date()).toISOString(),
      }
    );
    if (error || data !== true) throw error || new Error("cohort mismatch");
    return { captured: true as const, reason: null };
  } catch {
    console.warn(
      JSON.stringify({
        event: "custody_folio_billing_growth_cohort_capture_failed",
        at: new Date().toISOString(),
      })
    );
    return { captured: false as const, reason: "storage_failed" as const };
  }
}

async function refreshEntitlement(
  supabase: BillingSupabase,
  billingAccountId: string,
  now: Date
) {
  const environment = billingEnvironment();
  if (!environment) throw new Error("Billing environment is unavailable.");
  const { data, error } = await supabase.rpc("custody_folio_refresh_entitlement", {
    p_billing_account_id: billingAccountId,
    p_environment: environment,
    p_now: now.toISOString(),
  });
  const row = firstRow<EntitlementRow>(data);
  if (!error && row) return { row: validateEntitlementRow(row), stale: false };

  const fallback = await supabase
    .from("custody_folio_entitlements")
    .select(
      "mode,source,effective_until,grace_period_ends_at,computed_at,last_verified_at"
    )
    .eq("billing_account_id", billingAccountId)
    .eq("environment", environment)
    .maybeSingle();
  if (fallback.error || !fallback.data) {
    throw new Error("Billing entitlement could not be verified.");
  }

  const candidate = validateEntitlementRow(fallback.data as EntitlementRow);
  const verifiedAt = Date.parse(candidate.last_verified_at || candidate.computed_at);
  const maxAge = configuredStaleToleranceHours() * 60 * 60 * 1000;
  const effectiveUntil = candidate.effective_until
    ? Date.parse(candidate.effective_until)
    : Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(verifiedAt) ||
    now.getTime() - verifiedAt > maxAge ||
    effectiveUntil <= now.getTime()
  ) {
    throw new Error("Billing entitlement is too stale to use.");
  }
  return { row: candidate, stale: true };
}

async function currentSubscription(
  supabase: BillingSupabase,
  billingAccountId: string
): Promise<ProviderSubscriptionSummary | null> {
  const environment = billingEnvironment();
  if (!environment) throw new Error("Billing environment is unavailable.");
  const { data, error } = await supabase
    .from("custody_folio_provider_subscriptions")
    .select(
      "provider,product_id,plan_interval,status,current_period_end,cancel_at_period_end,updated_at"
    )
    .eq("billing_account_id", billingAccountId)
    .eq("environment", environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Subscription state could not be loaded.");
  if (!data) return null;
  return {
    provider: data.provider,
    productId: data.product_id,
    planInterval: data.plan_interval,
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  } as ProviderSubscriptionSummary;
}

function daysRemaining(endsAt: string | null, now: Date) {
  if (!endsAt) return 0;
  const remaining = Date.parse(endsAt) - now.getTime();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export async function getBillingStatus(input: {
  supabase: BillingSupabase;
  userId: string;
  nativeIos?: boolean;
  now?: Date;
}): Promise<BillingStatus> {
  const mode = billingMode();
  const nativeIos = input.nativeIos === true;
  if (mode === "disabled") return disabledBillingStatus(nativeIos);

  const now = input.now || new Date();
  const account = await ensureBillingAccount(input.supabase, input.userId, now);
  const [{ row, stale }, subscription] = await Promise.all([
    refreshEntitlement(input.supabase, account.id, now),
    currentSubscription(input.supabase, account.id),
    captureBillingGrowthCohort({
      supabase: input.supabase,
      billingAccountId: account.id,
      userId: input.userId,
      now,
    }),
  ]);
  const entitlement: EffectiveEntitlement = {
    mode: row.mode,
    source: row.source,
    effectiveUntil: row.effective_until,
    gracePeriodEndsAt: row.grace_period_ends_at,
    computedAt: row.computed_at,
    lastVerifiedAt: row.last_verified_at,
    stale,
  };
  return {
    billingMode: mode,
    environment: billingEnvironment(),
    checkoutEnabled: billingPurchaseEnabledForUser(
      input.userId,
      { nativeIos },
      process.env,
      now
    ),
    entitlement,
    capabilities: capabilitiesForEntitlementMode(entitlement.mode),
    appleAppAccountToken: account.appleAppAccountToken,
    subscription,
    trial: {
      startedAt: account.trialStartedAt,
      endsAt: account.trialEndsAt,
      daysRemaining: daysRemaining(account.trialEndsAt, now),
    },
    pricing: pricingStatus(),
    nativeIos,
  };
}

export async function findBillingAccountByUser(
  supabase: BillingSupabase,
  userId: string
) {
  const { data, error } = await supabase
    .from("custody_folio_billing_accounts")
    .select("id,apple_app_account_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Billing account lookup failed.");
  return data as { id: string; apple_app_account_token: string } | null;
}

export async function findBillingAccountByAppleToken(
  supabase: BillingSupabase,
  appAccountToken: string
) {
  const { data, error } = await supabase
    .from("custody_folio_billing_accounts")
    .select("id,user_id,apple_app_account_token")
    .eq("apple_app_account_token", appAccountToken)
    .maybeSingle();
  if (error) throw new Error("Apple billing account lookup failed.");
  return data as
    | { id: string; user_id: string | null; apple_app_account_token: string }
    | null;
}
