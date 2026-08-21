import { describe, expect, it } from "vitest";
import { accountSubscriptionIndicatorModel } from "@/components/billing/AccountSubscriptionIndicator";
import { capabilitiesForEntitlementMode } from "@/lib/billing/policy";
import type { BillingStatus, EntitlementMode } from "@/lib/billing/types";

function status(
  mode: EntitlementMode,
  source: BillingStatus["entitlement"]["source"] = "stripe"
): BillingStatus {
  return {
    billingMode: "live",
    environment: "live",
    checkoutEnabled: false,
    entitlement: {
      mode,
      source,
      effectiveUntil: "2026-09-17T03:46:28.000Z",
      gracePeriodEndsAt: "2026-08-24T03:46:28.000Z",
      computedAt: "2026-08-17T03:46:34.000Z",
      lastVerifiedAt: "2026-08-17T03:46:34.000Z",
      stale: false,
    },
    capabilities: capabilitiesForEntitlementMode(mode),
    appleAppAccountToken: "5ce20fc3-33f0-4ed3-ab50-621ca8294a4d",
    subscription:
      source === "stripe" || source === "apple"
        ? {
            provider: source,
            productId: "custody-folio-monthly",
            planInterval: "month",
            status: "active",
            currentPeriodEnd: "2026-09-17T03:46:28.000Z",
            cancelAtPeriodEnd: false,
          }
        : null,
    trial: {
      startedAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
      daysRemaining: 14,
    },
    pricing: {
      web: {
        monthly: "$5.99/month",
        annual: "$59.99/year",
        annualEffectiveMonthly: "$5.00/month",
        annualSavingsPercent: 16.5,
      },
      ios: {
        monthlyProductId: "io.custodyfolio.subscription.monthly",
        annualProductId: "io.custodyfolio.subscription.annual",
        localizedByStoreKit: true,
      },
    },
    nativeIos: false,
  };
}

describe("account subscription indicator", () => {
  it("identifies an active Stripe account as subscribed", () => {
    expect(accountSubscriptionIndicatorModel(status("active"), false, null)).toMatchObject({
      label: "Subscribed",
      detail: expect.stringContaining("Web billing"),
      tone: "teal",
    });
  });

  it("identifies an active App Store account as subscribed", () => {
    expect(
      accountSubscriptionIndicatorModel(status("active", "apple"), false, null)
    ).toMatchObject({
      label: "Subscribed",
      detail: expect.stringContaining("App Store billing"),
      tone: "teal",
    });
  });

  it("distinguishes trial, grace period, export-only, and unavailable states", () => {
    expect(
      accountSubscriptionIndicatorModel(status("trial", "trial"), false, null).label
    ).toBe("Trial active");
    expect(
      accountSubscriptionIndicatorModel(status("grace_period"), false, null).label
    ).toContain("payment needs attention");
    expect(
      accountSubscriptionIndicatorModel(status("export_only", "none"), false, null).label
    ).toBe("Not subscribed");
    expect(accountSubscriptionIndicatorModel(null, true, null).label).toBe(
      "Checking subscription"
    );
    expect(accountSubscriptionIndicatorModel(null, false, "Provider unavailable")).toEqual({
      label: "Status unavailable",
      detail: "Provider unavailable",
      tone: "slate",
    });
  });
});
