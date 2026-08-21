import { beforeEach, describe, expect, it, vi } from "vitest";
import { capabilitiesForEntitlementMode } from "@/lib/billing/policy";
import type { BillingStatus, EntitlementMode } from "@/lib/billing/types";

const getBillingStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/repository", () => ({ getBillingStatus }));

import { requireRecordsCapability } from "@/lib/billing/capabilities";

function billingStatus(mode: EntitlementMode): BillingStatus {
  return {
    billingMode: "test",
    environment: "test",
    checkoutEnabled: true,
    entitlement: {
      mode,
      source: mode === "export_only" ? "none" : "trial",
      effectiveUntil: null,
      gracePeriodEndsAt: null,
      computedAt: "2026-08-13T00:00:00.000Z",
      lastVerifiedAt: "2026-08-13T00:00:00.000Z",
      stale: false,
    },
    capabilities: capabilitiesForEntitlementMode(mode),
    appleAppAccountToken: "6b80ee75-f46b-458d-a700-061774ca2dee",
    subscription: null,
    trial: { startedAt: null, endsAt: null, daysRemaining: 0 },
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

describe("server-side billing capability guard", () => {
  const context = {
    userId: "00000000-0000-4000-8000-000000000001",
    supabase: {} as never,
  };

  beforeEach(() => vi.clearAllMocks());

  it("denies writes in export-only mode with a no-store 402 response", async () => {
    getBillingStatus.mockResolvedValue(billingStatus("export_only"));
    const result = await requireRecordsCapability(context, "records:write");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Write unexpectedly allowed.");
    expect(result.error.status).toBe(402);
    expect(result.error.headers.get("Cache-Control")).toBe("no-store");
    await expect(result.error.json()).resolves.toMatchObject({
      code: "billing_entitlement_required",
      capability: "records:write",
    });
  });

  it.each([
    "records:read",
    "records:delete",
    "evidence:download",
    "evidence:delete",
    "exports:create",
    "attorney:revoke",
    "billing:manage",
    "account:delete",
  ] as const)("keeps %s available after expiration", async (capability) => {
    getBillingStatus.mockResolvedValue(billingStatus("export_only"));
    await expect(requireRecordsCapability(context, capability)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("fails closed when entitlement verification is unavailable", async () => {
    getBillingStatus.mockRejectedValue(new Error("database unavailable"));
    const result = await requireRecordsCapability(context, "records:write");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Write unexpectedly allowed.");
    expect(result.error.status).toBe(503);
    expect(result.error.headers.get("Retry-After")).toBe("60");
  });
});
