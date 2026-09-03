import { describe, expect, it, vi } from "vitest";
import { captureBillingGrowthCohort } from "@/lib/billing/repository";

const secret = "01234567890123456789012345678901";
const billingAccountId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2026-09-03T08:00:00.000Z");

describe("protected billing growth cohort capture", () => {
  it("does nothing when first party analytics is disabled", async () => {
    const rpc = vi.fn();
    const result = await captureBillingGrowthCohort({
      supabase: { rpc } as never,
      billingAccountId,
      userId,
      now,
      env: {},
    });

    expect(result).toEqual({ captured: false, reason: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends one keyed identifier through the protected server function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const result = await captureBillingGrowthCohort({
      supabase: { rpc } as never,
      billingAccountId,
      userId,
      now,
      env: {
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: secret,
      },
    });

    expect(result).toEqual({ captured: true, reason: null });
    expect(rpc).toHaveBeenCalledWith(
      "custody_folio_capture_billing_growth_cohort",
      {
        p_billing_account_id: billingAccountId,
        p_user_id: userId,
        p_growth_cohort_identifier: expect.stringMatching(/^[a-f0-9]{32}$/),
        p_now: now.toISOString(),
      }
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(secret);
  });

  it("keeps a capture mismatch from blocking billing access", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await captureBillingGrowthCohort({
      supabase: { rpc } as never,
      billingAccountId,
      userId,
      now,
      env: {
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: secret,
      },
    });

    expect(result).toEqual({ captured: false, reason: "storage_failed" });
    expect(warning).toHaveBeenCalledOnce();
    const logged = String(warning.mock.calls[0][0]);
    expect(logged).not.toContain(userId);
    expect(logged).not.toContain(billingAccountId);
    expect(logged).not.toContain(secret);
    warning.mockRestore();
  });
});
