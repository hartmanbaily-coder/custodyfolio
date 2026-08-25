import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recordsCsrfCookieName } from "@/lib/security/csrf";
import { resetRateLimitStore } from "@/lib/security/rateLimit";

const getRecordsAuthContext = vi.hoisted(() => vi.fn());
const verifyAndDecodeNotification = vi.hoisted(() => vi.fn());
const verifyAndDecodeTransaction = vi.hoisted(() => vi.fn());
const verifyAndDecodeRenewalInfo = vi.hoisted(() => vi.fn());
const providerEventMaybeSingle = vi.hoisted(() => vi.fn());
const requireRecordsCapability = vi.hoisted(() => vi.fn());

vi.mock("@/lib/records/authServer", () => ({
  getRecordsAuthContext,
  isSupabaseRecordsMode: () => true,
  recordsAppBaseUrl: () => "https://custodyfolio.com",
}));

vi.mock("@/lib/billing/capabilities", () => ({ requireRecordsCapability }));

vi.mock("@/lib/billing/apple", () => ({
  applyAppleProviderEvent: vi.fn(),
  applePayloadDigest: () => "a".repeat(64),
  createAppleSignedDataVerifier: () => ({
    verifyAndDecodeNotification,
    verifyAndDecodeTransaction,
    verifyAndDecodeRenewalInfo,
  }),
  mapAppleSubscription: vi.fn(),
  recordIgnoredAppleEvent: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  createSupabaseAdminClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: providerEventMaybeSingle,
    };
    return { from: vi.fn(() => query) };
  },
}));

import { POST as checkout } from "@/app/api/records/billing/stripe/checkout/route";
import { POST as stripeWebhook } from "@/app/api/records/billing/stripe/webhook/route";
import { POST as appleTransaction } from "@/app/api/records/billing/apple/transaction/route";
import { POST as appleNotification } from "@/app/api/records/billing/apple/notifications/route";

function csrfHeaders(extra: Record<string, string> = {}) {
  const token = "billing-route-csrf-token";
  return {
    Origin: "https://custodyfolio.com",
    Cookie: `${recordsCsrfCookieName}=${token}`,
    "X-L2F-CSRF": token,
    "Content-Type": "application/json",
    ...extra,
  };
}

describe("billing route trust boundaries", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env = {
      ...originalEnv,
      BILLING_MODE: "test",
      STRIPE_TEST_SECRET_KEY: "sk_test_custody_folio_fake_key",
      STRIPE_TEST_WEBHOOK_SECRET: "whsec_custody_folio_test_secret",
    };
    providerEventMaybeSingle.mockResolvedValue({ data: null, error: null });
    getRecordsAuthContext.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
      supabase: {},
    });
    requireRecordsCapability.mockResolvedValue({
      ok: true,
      status: {
        entitlement: { mode: "active", source: "stripe" },
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects Stripe Checkout before authentication when CSRF is absent", async () => {
    const response = await checkout(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/stripe/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: "monthly",
            requestId: "308b6f06-81b0-4cf8-8c8a-c5de9c8c0148",
          }),
        }
      )
    );
    if (!response) throw new Error("Checkout route returned no response.");
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
  });

  it("never sends a native iOS purchase through Stripe Checkout", async () => {
    const response = await checkout(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/stripe/checkout",
        {
          method: "POST",
          headers: csrfHeaders({ "User-Agent": "CustodyFolio-iOS/1.0" }),
          body: JSON.stringify({
            plan: "annual",
            requestId: "308b6f06-81b0-4cf8-8c8a-c5de9c8c0148",
          }),
        }
      )
    );
    if (!response) throw new Error("Checkout route returned no response.");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "native_purchase_unavailable",
    });
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
  });

  it("accepts App Store transactions only from the native wrapper", async () => {
    const response = await appleTransaction(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/apple/transaction",
        {
          method: "POST",
          headers: csrfHeaders({ "User-Agent": "Mozilla/5.0 Safari/605.1" }),
          body: JSON.stringify({ signedTransactionInfo: "x".repeat(120) }),
        }
      )
    );
    if (!response) throw new Error("Apple transaction route returned no response.");
    expect(response.status).toBe(400);
    expect(getRecordsAuthContext).not.toHaveBeenCalled();
  });

  it("rejects App Store activation when Stripe already supplies full access", async () => {
    const response = await appleTransaction(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/apple/transaction",
        {
          method: "POST",
          headers: csrfHeaders({ "User-Agent": "CustodyFolio-iOS/1.0" }),
          body: JSON.stringify({ signedTransactionInfo: "x".repeat(120) }),
        }
      )
    );
    if (!response) throw new Error("Apple transaction route returned no response.");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "existing_full_access",
      source: "stripe",
    });
    expect(verifyAndDecodeTransaction).not.toHaveBeenCalled();
  });

  it("rejects a Stripe webhook with an invalid signature", async () => {
    const response = await stripeWebhook(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/stripe/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "invalid" },
          body: JSON.stringify({ id: "evt_untrusted" }),
        }
      )
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Webhook signature is invalid.",
    });
  });

  it("rejects an Apple notification with an invalid outer JWS", async () => {
    verifyAndDecodeNotification.mockRejectedValue(new Error("invalid JWS"));
    const response = await appleNotification(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/apple/notifications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedPayload: "x".repeat(120) }),
        }
      )
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "App Store notification signature is invalid.",
    });
  });

  it("rejects invalid nested Apple transaction JWS data without retrying it", async () => {
    verifyAndDecodeNotification.mockResolvedValue({
      notificationUUID: "1c075a61-75c1-44bf-9690-cdb839428f50",
      notificationType: "DID_RENEW",
      signedDate: Date.parse("2026-08-13T00:00:00.000Z"),
      data: { signedTransactionInfo: "nested" },
    });
    verifyAndDecodeTransaction.mockRejectedValue(new Error("invalid nested JWS"));
    const response = await appleNotification(
      new NextRequest(
        "https://custodyfolio.com/api/records/billing/apple/notifications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedPayload: "x".repeat(120) }),
        }
      )
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("Retry-After")).toBeNull();
  });
});
