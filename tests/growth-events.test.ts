import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  growthAnalyticsEnabled,
  growthCohortIdentifierForUser,
  deleteGrowthEventsForUser,
  recordGrowthEvent,
  sanitizeGrowthAttribution,
  subscriptionGrowthEventNames,
  validGrowthVisitorToken,
} from "@/lib/marketing/growthEvents";

const secret = "01234567890123456789012345678901";

describe("privacy preserving growth events", () => {
  beforeEach(() => {
    vi.stubEnv("MARKETING_ANALYTICS_ENABLED", "true");
    vi.stubEnv("MARKETING_ANALYTICS_SECRET", secret);
  });

  it("stays disabled without both an explicit flag and a strong secret", () => {
    expect(growthAnalyticsEnabled({})).toBe(false);
    expect(
      growthAnalyticsEnabled({
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: "short",
      })
    ).toBe(false);
    expect(
      growthAnalyticsEnabled({
        MARKETING_ANALYTICS_ENABLED: "true",
        MARKETING_ANALYTICS_SECRET: secret,
      })
    ).toBe(true);
  });

  it("accepts only allowlisted attribution values", () => {
    expect(
      sanitizeGrowthAttribution({
        source: "Community",
        medium: "organic",
        campaign: "launch",
        contentCode: "hero",
        email: "person@example.com",
      })
    ).toEqual({
      source: "community",
      medium: "organic",
      campaign: "launch",
      contentCode: "hero",
    });
    expect(
      sanitizeGrowthAttribution({
        source: "person@example.com",
        medium: "unknown",
        campaign: "private_case_name",
        contentCode: "child_name",
      })
    ).toEqual({
      source: undefined,
      medium: undefined,
      campaign: undefined,
      contentCode: undefined,
    });
  });

  it("derives an opaque stable cohort without storing the user id", () => {
    const userId = "00000000-0000-4000-8000-000000000123";
    const expected = createHmac("sha256", secret)
      .update(`user:${userId}`)
      .digest("hex")
      .slice(0, 32);

    expect(
      growthCohortIdentifierForUser(userId, {
        MARKETING_ANALYTICS_SECRET: secret,
      })
    ).toBe(expected);
    expect(expected).not.toContain(userId);
  });

  it("stores only the constrained aggregate event row", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const userId = "00000000-0000-4000-8000-000000000123";

    const result = await recordGrowthEvent({
      supabase: { from } as never,
      eventName: "customer_first_record_saved",
      userId,
      platform: "web",
      attribution: {
        source: "community",
        medium: "organic",
        campaign: "launch",
        contentCode: "hero",
      },
      occurredAt: new Date("2026-08-31T00:00:00.000Z"),
    });

    expect(result).toEqual({ recorded: true, reason: null });
    expect(from).toHaveBeenCalledWith("custody_folio_growth_events");
    const stored = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual([
      "campaign",
      "cohort_identifier",
      "content_code",
      "dedupe_key",
      "event_name",
      "expires_at",
      "failure_code",
      "first_time",
      "medium",
      "occurred_at",
      "plan_interval",
      "platform",
      "source",
      "success",
    ]);
    expect(JSON.stringify(stored)).not.toContain(userId);
    expect(stored.expires_at).toBe("2027-02-27T00:00:00.000Z");
  });

  it("validates visitor tokens and maps billing states", () => {
    expect(validGrowthVisitorToken("a".repeat(32))).toBe("a".repeat(32));
    expect(validGrowthVisitorToken("a".repeat(31))).toBe("");
    expect(
      subscriptionGrowthEventNames({
        status: "active",
        cancelAtPeriodEnd: true,
        providerEventType: "charge.refunded",
      })
    ).toEqual([
      "customer_subscription_started",
      "customer_subscription_cancelled",
      "customer_refund_requested",
    ]);
  });

  it("deletes the account cohort without exposing the user id", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: remove }));
    const userId = "00000000-0000-4000-8000-000000000123";

    const result = await deleteGrowthEventsForUser({
      supabase: { from } as never,
      userId,
      env: { MARKETING_ANALYTICS_SECRET: secret },
    });

    expect(result).toEqual({ ok: true, deleted: true, reason: null });
    expect(from).toHaveBeenCalledWith("custody_folio_growth_events");
    expect(remove).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith(
      "cohort_identifier",
      growthCohortIdentifierForUser(userId, {
        MARKETING_ANALYTICS_SECRET: secret,
      })
    );
    expect(JSON.stringify(eq.mock.calls)).not.toContain(userId);
  });
});
