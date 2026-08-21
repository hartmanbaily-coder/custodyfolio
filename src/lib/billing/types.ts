export const billingModes = ["disabled", "test", "live"] as const;
export type BillingMode = (typeof billingModes)[number];

export const entitlementModes = [
  "trial",
  "active",
  "grace_period",
  "export_only",
] as const;
export type EntitlementMode = (typeof entitlementModes)[number];

export const billingProviders = ["stripe", "apple"] as const;
export type BillingProvider = (typeof billingProviders)[number];
export type BillingEnvironment = "test" | "live";

export const recordsCapabilities = [
  "records:read",
  "records:write",
  "records:delete",
  "evidence:download",
  "evidence:upload",
  "evidence:delete",
  "exports:create",
  "attorney:read",
  "attorney:invite",
  "attorney:revoke",
  "billing:manage",
  "account:delete",
] as const;
export type RecordsCapability = (typeof recordsCapabilities)[number];
export type RecordsCapabilityMap = Record<RecordsCapability, boolean>;

export interface BillingAccountIdentity {
  id: string;
  appleAppAccountToken: string;
  trialStartedAt: string;
  trialEndsAt: string;
}

export interface EffectiveEntitlement {
  mode: EntitlementMode;
  source: "disabled" | "trial" | BillingProvider | "none";
  effectiveUntil: string | null;
  gracePeriodEndsAt: string | null;
  computedAt: string;
  lastVerifiedAt: string | null;
  stale: boolean;
}

export interface ProviderSubscriptionSummary {
  provider: BillingProvider;
  productId: string;
  planInterval: "month" | "year";
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingStatus {
  billingMode: BillingMode;
  environment: BillingEnvironment | null;
  checkoutEnabled: boolean;
  entitlement: EffectiveEntitlement;
  capabilities: RecordsCapabilityMap;
  appleAppAccountToken: string | null;
  subscription: ProviderSubscriptionSummary | null;
  trial: {
    startedAt: string | null;
    endsAt: string | null;
    daysRemaining: number;
  };
  pricing: {
    web: {
      monthly: "$5.99/month";
      annual: "$59.99/year";
      annualEffectiveMonthly: "$5.00/month";
      annualSavingsPercent: 16.5;
    };
    ios: {
      monthlyProductId: string;
      annualProductId: string;
      localizedByStoreKit: true;
    };
  };
  nativeIos: boolean;
}

export interface ProviderSubscriptionUpdate {
  providerSubscriptionId: string;
  /** Provider object that caused this update (for example, a Stripe dispute ID). */
  providerEventObjectId?: string | null;
  originalTransactionId?: string | null;
  providerCustomerId?: string | null;
  productId: string;
  planInterval: "month" | "year";
  status:
    | "incomplete"
    | "active"
    | "past_due"
    | "grace_period"
    | "billing_retry"
    | "paused"
    | "canceled"
    | "expired"
    | "revoked"
    | "refunded"
    | "provider_conflict";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  revokedAt?: string | null;
}
